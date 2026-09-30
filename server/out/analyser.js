'use strict'
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k
        var desc = Object.getOwnPropertyDescriptor(m, k)
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k]
            },
          }
        }
        Object.defineProperty(o, k2, desc)
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k
        o[k2] = m[k]
      })
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v })
      }
    : function (o, v) {
        o['default'] = v
      })
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = []
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k
          return ar
        }
      return ownKeys(o)
    }
    return function (mod) {
      if (mod && mod.__esModule) return mod
      var result = {}
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i])
      __setModuleDefault(result, mod)
      return result
    }
  })()
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const fs = __importStar(require('fs'))
const fuzzy_search_1 = __importDefault(require('fuzzy-search'))
const url = __importStar(require('url'))
const util_1 = require('util')
const LSP = __importStar(require('vscode-languageserver/node'))
const vscode_languageserver_textdocument_1 = require('vscode-languageserver-textdocument')
const config_1 = require('./config')
const array_1 = require('./util/array')
const declarations_1 = require('./util/declarations')
const fs_1 = require('./util/fs')
const input_declarations_1 = require('./util/input-declarations')
const logger_1 = require('./util/logger')
const lsp_1 = require('./util/lsp')
const shebang_1 = require('./util/shebang')
const sourcing = __importStar(require('./util/sourcing'))
const TreeSitterUtil = __importStar(require('./util/tree-sitter'))
const BACKGROUND_ANALYSIS_TIMEOUT_MS = 10000
/**
 * The Analyzer uses the Abstract Syntax Trees (ASTs) that are provided by
 * tree-sitter to find definitions, reference, etc.
 */
class Analyzer {
  backgroundAnalysisController
  backgroundAnalyzedUris = new Set()
  enableSourceErrorDiagnostics
  includeAllWorkspaceSymbols
  parser
  uriToAnalyzedDocument = {}
  workspaceFolder
  constructor({
    enableSourceErrorDiagnostics = false,
    includeAllWorkspaceSymbols = false,
    parser,
    workspaceFolder,
  }) {
    this.enableSourceErrorDiagnostics = enableSourceErrorDiagnostics
    this.includeAllWorkspaceSymbols = includeAllWorkspaceSymbols
    this.parser = parser
    this.workspaceFolder = workspaceFolder
  }
  /**
   * Analyze the given document, cache the tree-sitter AST, and iterate over the
   * tree to find declarations.
   */
  analyze({
    document,
    uri, // NOTE: we don't use document.uri to make testing easier
    background = false,
  }) {
    // An opened/on-demand document must survive subsequent background rescans,
    // including when parsing its new contents fails.
    if (!background) this.backgroundAnalyzedUris.delete(uri)
    const diagnostics = []
    const fileContent = document.getText()
    const tree = this.parser.parse(fileContent)
    if (!tree) {
      throw new Error(`Failed to parse ${uri}: no syntax tree returned`)
    }
    let globalDeclarations
    let sourceCommands
    try {
      globalDeclarations = (0, declarations_1.getGlobalDeclarations)({ tree, uri })
      sourceCommands = sourcing.getSourceCommands({
        fileUri: uri,
        rootPath: this.workspaceFolder,
        tree,
      })
    } catch (error) {
      tree.delete()
      throw error
    }
    const sourcedUris = new Set(
      sourceCommands
        .map((sourceCommand) => sourceCommand.uri)
        .filter((uri) => uri !== null),
    )
    // The AST lives in WebAssembly memory. Waiting for JavaScript finalizers
    // lets that memory grow substantially during repeated edits.
    this.uriToAnalyzedDocument[uri]?.tree.delete()
    this.uriToAnalyzedDocument[uri] = {
      document,
      globalDeclarations,
      sourcedUris,
      sourceCommands: sourceCommands.filter((sourceCommand) => !sourceCommand.error),
      tree,
    }
    if (background) this.backgroundAnalyzedUris.add(uri)
    if (!this.includeAllWorkspaceSymbols) {
      sourceCommands
        .filter((sourceCommand) => sourceCommand.error)
        .forEach((sourceCommand) => {
          logger_1.logger.warn(
            `${uri} line ${sourceCommand.range.start.line}: ${sourceCommand.error}`,
          )
          if (this.enableSourceErrorDiagnostics) {
            diagnostics.push(
              LSP.Diagnostic.create(
                sourceCommand.range,
                [
                  `Source command could not be analyzed: ${sourceCommand.error}.\n`,
                  'Consider adding a ShellCheck directive above this line to fix or ignore this:',
                  '# shellcheck source=/my-file.sh # specify the file to source',
                  '# shellcheck source-path=my_script_folder # specify the folder to search in',
                  '# shellcheck source=/dev/null # to ignore the error',
                  '',
                  'Disable this message by changing the configuration option "enableSourceErrorDiagnostics"',
                ].join('\n'),
                LSP.DiagnosticSeverity.Information,
                undefined,
                'bash-language-server',
              ),
            )
          }
        })
    }
    if (tree.rootNode.hasError) {
      logger_1.logger.warn(`Error while parsing ${uri}: syntax error`)
    }
    return diagnostics
  }
  cancelBackgroundAnalysis() {
    this.backgroundAnalysisController?.abort()
  }
  /** Discover and analyze workspace files within one elapsed-time budget. */
  async initiateBackgroundAnalysis({
    backgroundAnalysisMaxFiles,
    backgroundAnalysisIgnore = (0, config_1.getDefaultConfiguration)()
      .backgroundAnalysisIgnore,
    globPattern,
  }) {
    this.cancelBackgroundAnalysis()
    const controller = new AbortController()
    this.backgroundAnalysisController = controller
    const { signal } = controller
    const rootPath = this.workspaceFolder
    if (!rootPath) return { filesParsed: 0 }
    if (backgroundAnalysisMaxFiles <= 0) {
      this.evictBackgroundDocuments(new Set())
      logger_1.logger.info(
        `BackgroundAnalysis: skipping as backgroundAnalysisMaxFiles was 0...`,
      )
      return { filesParsed: 0 }
    }
    logger_1.logger.info(
      `BackgroundAnalysis: resolving glob "${globPattern}" inside "${rootPath}"...`,
    )
    const started = Date.now()
    const deadline = started + BACKGROUND_ANALYSIS_TIMEOUT_MS
    const expire = () => {
      if (signal.aborted) return
      logger_1.logger.warn(
        `BackgroundAnalysis: stopped after ${BACKGROUND_ANALYSIS_TIMEOUT_MS}ms; workspace symbols may be incomplete. Exclude large folders with backgroundAnalysisIgnore or narrow globPattern.`,
      )
      controller.abort()
    }
    const stopped = () => {
      // Synchronous parsing can delay the timer; check between parses as well.
      if (Date.now() >= deadline) expire()
      return signal.aborted
    }
    const timer = setTimeout(expire, BACKGROUND_ANALYSIS_TIMEOUT_MS)
    const getTimePassed = () => `${(Date.now() - started) / 1000} seconds`
    let filesParsed = 0
    try {
      // fast-glob traverses hidden directories for globstars even though the
      // default pattern cannot match their files. Only prune for that pattern:
      // custom globs may deliberately target hidden directories.
      let filePaths
      try {
        filePaths = await (0, fs_1.getFilePaths)({
          globPattern,
          rootPath,
          maxItems: backgroundAnalysisMaxFiles,
          timeoutMs: BACKGROUND_ANALYSIS_TIMEOUT_MS,
          ignore: backgroundAnalysisIgnore,
          skipHiddenEntries:
            globPattern === (0, config_1.getDefaultConfiguration)().globPattern,
          signal,
          onLimit: (reason) => {
            if (reason === 'time') expire()
            else
              logger_1.logger.warn(
                `BackgroundAnalysis: stopped discovery at the directories limit; workspace symbols may be incomplete. Exclude large folders with backgroundAnalysisIgnore or narrow globPattern.`,
              )
          },
        })
      } catch (error) {
        if (!signal.aborted)
          logger_1.logger.warn(
            `BackgroundAnalysis: failed resolving glob "${globPattern}". The experience across files will be degraded. Error: ${String(error)}`,
          )
        return { filesParsed }
      }
      if (stopped()) return { filesParsed }
      this.evictBackgroundDocuments(
        new Set(filePaths.map((p) => url.pathToFileURL(p).href)),
      )
      logger_1.logger.info(
        `BackgroundAnalysis: Glob resolved with ${filePaths.length} files after ${getTimePassed()}`,
      )
      for (const filePath of filePaths) {
        if (stopped()) break
        const uri = url.pathToFileURL(filePath).href
        const isOnDemand = () =>
          this.uriToAnalyzedDocument[uri] && !this.backgroundAnalyzedUris.has(uri)
        // Do not replace an open document's unsaved contents with its disk copy.
        if (isOnDemand()) continue
        try {
          let cancelRead = () => undefined
          const canceled = new Promise((resolve) => {
            cancelRead = () => resolve(undefined)
            signal.addEventListener('abort', cancelRead, { once: true })
          })
          let fileContent
          try {
            // AbortSignal stops readFile's buffering, but an OS read may still
            // be pending. Settle the background pass immediately on cancellation.
            fileContent = await Promise.race([
              fs.promises.readFile(filePath, { encoding: 'utf8', signal }),
              canceled,
            ])
          } finally {
            signal.removeEventListener('abort', cancelRead)
          }
          if (stopped() || fileContent === undefined) break
          // The document may have been opened or edited while its read awaited I/O.
          if (isOnDemand()) continue
          const fileDialect = (0, shebang_1.analyzeFile)(uri, fileContent)
          if (!fileDialect.dialect) {
            logger_1.logger.info(
              `BackgroundAnalysis: Skipping file ${uri} with dialect "${JSON.stringify(fileDialect)}"`,
            )
            continue
          }
          this.analyze({
            document: vscode_languageserver_textdocument_1.TextDocument.create(
              uri,
              'shell',
              1,
              fileContent,
            ),
            uri,
            background: true,
          })
          filesParsed++
        } catch (error) {
          if (stopped()) break
          logger_1.logger.warn(
            `BackgroundAnalysis: Failed analyzing ${uri}. Error: ${String(error)}`,
          )
        }
      }
      // Rereading background files can remove source relationships. Recompute
      // the retained dependency graph, without cleanup from a canceled old pass.
      if (!stopped()) {
        this.evictBackgroundDocuments(
          new Set(filePaths.map((p) => url.pathToFileURL(p).href)),
        )
      }
      logger_1.logger.info(`BackgroundAnalysis: Completed after ${getTimePassed()}.`)
      return { filesParsed }
    } finally {
      clearTimeout(timer)
      if (this.backgroundAnalysisController === controller) {
        this.backgroundAnalysisController = undefined
      }
    }
  }
  evictBackgroundDocuments(keep) {
    // Preserve dependencies of opened/on-demand documents, even if a previous
    // background scan happened to analyze those dependencies first.
    for (const uri of Object.keys(this.uriToAnalyzedDocument)) {
      if (!this.backgroundAnalyzedUris.has(uri)) {
        for (const sourcedUri of this.findAllSourcedUris({ uri })) keep.add(sourcedUri)
      }
    }
    for (const uri of this.backgroundAnalyzedUris) {
      if (keep.has(uri)) continue
      this.uriToAnalyzedDocument[uri]?.tree.delete()
      delete this.uriToAnalyzedDocument[uri]
      this.backgroundAnalyzedUris.delete(uri)
    }
  }
  /**
   * Find all the locations where the word was declared.
   */
  findDeclarationLocations({ position, uri, word }) {
    // If the word is sourced, return the location of the source file
    const sourcedUri = this.uriToAnalyzedDocument[uri]?.sourceCommands
      .filter((sourceCommand) =>
        (0, lsp_1.isPositionIncludedInRange)(position, sourceCommand.range),
      )
      .map((sourceCommand) => sourceCommand.uri)[0]
    if (sourcedUri) {
      return [LSP.Location.create(sourcedUri, LSP.Range.create(0, 0, 0, 0))]
    }
    return this.findDeclarationsMatchingWord({
      exactMatch: true,
      position,
      uri,
      word,
    }).map((symbol) => symbol.location)
  }
  /**
   * Find all the declaration symbols in the workspace matching the query using fuzzy search.
   */
  findDeclarationsWithFuzzySearch(query) {
    const searcher = new fuzzy_search_1.default(this.getAllDeclarations(), ['name'], {
      caseSensitive: true,
    })
    return searcher.search(query)
  }
  /**
   * Find declarations for the given word and position.
   */
  findDeclarationsMatchingWord({ exactMatch, position, uri, word }) {
    return this.getAllDeclarations({ uri, position }).filter((symbol) => {
      if (exactMatch) {
        return symbol.name === word
      } else {
        return symbol.name.startsWith(word)
      }
    })
  }
  /**
   * Find a symbol's original declaration and parent scope based on its original
   * definition with respect to its scope.
   */
  findOriginalDeclaration(params) {
    const node = this.nodeAtPoint(
      params.uri,
      params.position.line,
      params.position.character,
    )
    if (!node) {
      return { declaration: null, parent: null }
    }
    const otherInfo = {
      currentUri: params.uri,
      boundary: params.position.line,
    }
    let parent = this.parentScope(node)
    let declaration
    let continueSearching = false
    // Search for local declaration within parents
    while (parent) {
      if (
        params.kind === LSP.SymbolKind.Variable &&
        parent.type === 'function_definition' &&
        parent.lastChild
      ) {
        ;({ declaration, continueSearching } = (0,
        declarations_1.findDeclarationUsingLocalSemantics)({
          baseNode: parent.lastChild,
          symbolInfo: params,
          otherInfo,
        }))
      } else if (parent.type === 'subshell') {
        ;({ declaration, continueSearching } = (0,
        declarations_1.findDeclarationUsingGlobalSemantics)({
          baseNode: parent,
          symbolInfo: params,
          otherInfo,
        }))
      }
      if (declaration && !continueSearching) {
        break
      }
      // Update boundary since any other instance within or below the current
      // parent can now be considered local to that parent or out of scope.
      otherInfo.boundary = parent.startPosition.row
      parent = this.parentScope(parent)
    }
    // Search for global declaration within files
    if (!parent && (!declaration || continueSearching)) {
      for (const uri of this.getOrderedReachableUris({ fromUri: params.uri })) {
        const root = this.uriToAnalyzedDocument[uri]?.tree.rootNode
        if (!root) {
          continue
        }
        otherInfo.currentUri = uri
        otherInfo.boundary =
          uri === params.uri
            ? // Reset boundary so globally defined variables within any
              // functions already searched can be found.
              params.position.line
            : // Set boundary to EOF since any position taken from the original
              // URI/file does not apply to other URIs/files.
              root.endPosition.row
        ;({ declaration, continueSearching } = (0,
        declarations_1.findDeclarationUsingGlobalSemantics)({
          baseNode: root,
          symbolInfo: params,
          otherInfo,
        }))
        if (declaration && !continueSearching) {
          break
        }
      }
    }
    return {
      declaration: declaration
        ? LSP.Location.create(
            otherInfo.currentUri,
            (0, input_declarations_1.variableNameRange)(declaration),
          )
        : null,
      parent: parent
        ? LSP.Location.create(params.uri, TreeSitterUtil.range(parent))
        : null,
    }
  }
  /**
   * Find all the locations where the given word was defined or referenced.
   * This will include commands, functions, variables, etc.
   *
   * It's currently not scope-aware, see findOccurrences.
   */
  findReferences(word) {
    const uris = Object.keys(this.uriToAnalyzedDocument)
    return (0, array_1.flattenArray)(uris.map((uri) => this.findOccurrences(uri, word)))
  }
  /**
   * Find all occurrences of a word in the given file.
   * It's currently not scope-aware.
   *
   * This will include commands, functions, variables, etc.
   *
   * It's currently not scope-aware, meaning references does include
   * references to functions and variables that has the same name but
   * are defined in different files.
   */
  findOccurrences(uri, word) {
    const analyzedDocument = this.uriToAnalyzedDocument[uri]
    if (!analyzedDocument) {
      return []
    }
    const { tree } = analyzedDocument
    const locations = []
    TreeSitterUtil.forEach(tree.rootNode, (n) => {
      let namedNode = null
      if ((0, input_declarations_1.getInputVariableDeclaration)(n)) {
        namedNode = n
      } else if (TreeSitterUtil.isReference(n)) {
        // NOTE: a reference can be a command, variable, function, etc.
        namedNode = n.firstNamedChild || n
      } else if (TreeSitterUtil.isDefinition(n)) {
        namedNode = n.firstNamedChild
      }
      if (
        namedNode &&
        ((0, input_declarations_1.getInputVariableDeclaration)(namedNode)?.name ??
          namedNode.text) === word
      ) {
        const range = (0, input_declarations_1.variableNameRange)(namedNode)
        const alreadyInLocations = locations.some((loc) => {
          return (0, util_1.isDeepStrictEqual)(loc.range, range)
        })
        if (!alreadyInLocations) {
          locations.push(LSP.Location.create(uri, range))
        }
      }
    })
    return locations
  }
  /**
   * A more scope-aware version of findOccurrences that differentiates between
   * functions and variables.
   */
  findOccurrencesWithin({ uri, word, kind, start, scope }) {
    const scopeNode = scope
      ? this.nodeAtPoints(
          uri,
          { row: scope.start.line, column: scope.start.character },
          { row: scope.end.line, column: scope.end.character },
        )
      : null
    const baseNode =
      scopeNode && (kind === LSP.SymbolKind.Variable || scopeNode.type === 'subshell')
        ? scopeNode
        : this.uriToAnalyzedDocument[uri]?.tree.rootNode
    if (!baseNode) {
      return []
    }
    const typeOfDescendants =
      kind === LSP.SymbolKind.Variable
        ? ['variable_name', 'word', 'string', 'raw_string']
        : ['function_definition', 'command_name']
    const startPosition = start
      ? { row: start.line, column: start.character }
      : baseNode.startPosition
    const ignoredRanges = []
    const filterVariables = (n) => {
      const input = (0, input_declarations_1.getInputVariableDeclaration)(n)
      if ((input?.name ?? n.text) !== word || (n.type !== 'variable_name' && !input)) {
        return false
      }
      const definition = TreeSitterUtil.findParentOfType(n, 'variable_assignment')
      const definedVariable = definition?.descendantsOfType('variable_name').at(0)
      // For self-assignment `var=$var` cases; this decides whether `$var` is an
      // occurrence or not.
      if (definedVariable?.text === word && !n.equals(definedVariable)) {
        // `start.line` is assumed to be the same as the variable's original
        // declaration line; handles cases where `$var` shouldn't be considered
        // an occurrence.
        if (definition?.startPosition.row === start?.line) {
          return false
        }
        // Returning true here is a good enough heuristic for most cases. It
        // breaks down when redeclaration happens in multiple nested scopes,
        // handling those more complex situations can be done later on if use
        // cases arise.
        return true
      }
      const parent = this.parentScope(n)
      if (!parent || baseNode.equals(parent)) {
        return true
      }
      const includeDeclaration = !ignoredRanges.some(
        (r) => n.startPosition.row > r.start.line && n.endPosition.row < r.end.line,
      )
      const declarationCommand = TreeSitterUtil.findParentOfType(n, 'declaration_command')
      const isLocal =
        // Local `variable_name`s
        ((definedVariable?.text === word || !!(!definition && declarationCommand)) &&
          (parent.type === 'subshell' ||
            ['local', 'declare', 'typeset'].includes(
              declarationCommand?.firstChild?.text,
            ))) ||
        // Input destinations belong to their enclosing subshell.
        (parent.type === 'subshell' && !!input)
      if (isLocal) {
        if (includeDeclaration) {
          ignoredRanges.push(TreeSitterUtil.range(parent))
        }
        return false
      }
      return includeDeclaration
    }
    const filterFunctions = (n) => {
      const text = n.type === 'function_definition' ? n.firstNamedChild?.text : n.text
      if (text !== word) {
        return false
      }
      const parentScope = TreeSitterUtil.findParentOfType(n, 'subshell')
      if (!parentScope || baseNode.equals(parentScope)) {
        return true
      }
      const includeDeclaration = !ignoredRanges.some(
        (r) => n.startPosition.row > r.start.line && n.endPosition.row < r.end.line,
      )
      if (n.type === 'function_definition') {
        if (includeDeclaration) {
          ignoredRanges.push(TreeSitterUtil.range(parentScope))
        }
        return false
      }
      return includeDeclaration
    }
    return baseNode
      .descendantsOfType(typeOfDescendants, startPosition)
      .filter(kind === LSP.SymbolKind.Variable ? filterVariables : filterFunctions)
      .map((n) => {
        if (n.type === 'function_definition' && n.firstNamedChild) {
          return TreeSitterUtil.range(n.firstNamedChild)
        }
        return (0, input_declarations_1.variableNameRange)(n)
      })
  }
  getAllVariables({ position, uri }) {
    return this.getAllDeclarations({ uri, position }).filter(
      (symbol) => symbol.kind === LSP.SymbolKind.Variable,
    )
  }
  /**
   * Get all symbol declarations in the given file. This is used for generating an outline.
   *
   * TODO: convert to DocumentSymbol[] which is a hierarchy of symbols found in a given text document.
   */
  getDeclarationsForUri({ uri }) {
    const tree = this.uriToAnalyzedDocument[uri]?.tree
    if (!tree?.rootNode) {
      return []
    }
    return (0, declarations_1.getAllDeclarationsInTree)({ uri, tree })
  }
  /**
   * Get the document for the given URI.
   */
  getDocument(uri) {
    return this.uriToAnalyzedDocument[uri]?.document
  }
  getRootNode(uri) {
    return this.uriToAnalyzedDocument[uri]?.tree.rootNode
  }
  // TODO: move somewhere else than the analyzer...
  async getExplainshellDocumentation({ params, endpoint }) {
    const analyzedDocument = this.uriToAnalyzedDocument[params.textDocument.uri]
    const leafNode = analyzedDocument?.tree.rootNode.descendantForPosition({
      row: params.position.line,
      column: params.position.character,
    })
    if (!leafNode || !analyzedDocument) {
      return {}
    }
    // explainshell needs the whole command, not just the "word" (tree-sitter
    // parlance) that the user hovered over. A relatively successful heuristic
    // is to simply go up one level in the AST. If you go up too far, you'll
    // start to include newlines, and explainshell completely balks when it
    // encounters newlines.
    const interestingNode = leafNode.type === 'word' ? leafNode.parent : leafNode
    if (!interestingNode) {
      return {}
    }
    const searchParams = new URLSearchParams({ cmd: interestingNode.text }).toString()
    const url = `${endpoint}/explain?${searchParams}`
    const explainshellRawResponse = await fetch(url)
    const explainshellResponse = await explainshellRawResponse.json()
    if (!explainshellRawResponse.ok) {
      throw new Error(`HTTP request failed: ${url}`)
    } else if (!explainshellResponse.matches) {
      return {}
    } else {
      const offsetOfMousePointerInCommand =
        analyzedDocument.document.offsetAt(params.position) - interestingNode.startIndex
      const match = explainshellResponse.matches.find(
        (helpItem) =>
          helpItem.start <= offsetOfMousePointerInCommand &&
          offsetOfMousePointerInCommand < helpItem.end,
      )
      const helpHTML =
        match?.helpHTML ??
        (match?.helpclass
          ? explainshellResponse.helptext?.find(([, id]) => id === match.helpclass)?.[0]
          : undefined)
      return { helpHTML }
    }
  }
  /**
   * Find the name of the command at the given point.
   */
  commandNameAtPoint(uri, line, column) {
    let node = this.nodeAtPoint(uri, line, column)
    while (node && node.type !== 'command') {
      node = node.parent
    }
    if (!node) {
      return null
    }
    const firstChild = node.firstNamedChild
    if (!firstChild || firstChild.type !== 'command_name') {
      return null
    }
    return firstChild.text.trim()
  }
  /**
   * Find a block of comments above a line position
   */
  commentsAbove(uri, line) {
    const doc = this.uriToAnalyzedDocument[uri]?.document
    if (!doc) {
      return null
    }
    const commentBlock = []
    // start from the line above
    let commentBlockIndex = line - 1
    // will return the comment string without the comment '#'
    // and without leading whitespace, or null if the line 'l'
    // is not a comment line
    const getComment = (l) => {
      // this regexp has to be defined within the function
      const commentRegExp = /^\s*#\s?(.*)/g
      const matches = commentRegExp.exec(l)
      return matches ? matches[1].trimRight() : null
    }
    let currentLine = doc.getText({
      start: { line: commentBlockIndex, character: 0 },
      end: { line: commentBlockIndex + 1, character: 0 },
    })
    // iterate on every line above and including
    // the current line until getComment returns null
    let currentComment = ''
    while ((currentComment = getComment(currentLine)) !== null) {
      commentBlock.push(currentComment)
      commentBlockIndex -= 1
      currentLine = doc.getText({
        start: { line: commentBlockIndex, character: 0 },
        end: { line: commentBlockIndex + 1, character: 0 },
      })
    }
    if (commentBlock.length) {
      commentBlock.push('```txt')
      // since we searched from bottom up, we then reverse
      // the lines so that it reads top down.
      commentBlock.reverse()
      commentBlock.push('```')
      return commentBlock.join('\n')
    }
    // no comments found above line:
    return null
  }
  /**
   * Find the full word at the given point.
   */
  wordAtPoint(uri, line, column) {
    const node = this.nodeAtPoint(uri, line, column)
    if (node) {
      const input =
        (0, input_declarations_1.getInputVariableDeclaration)(node) ||
        (node.parent &&
          (0, input_declarations_1.getInputVariableDeclaration)(node.parent))
      if (
        input &&
        (0, lsp_1.isPositionIncludedInRange)({ line, character: column }, input.range)
      )
        return input.name
    }
    if (!node || node.childCount > 0 || node.text.trim() === '') {
      return null
    }
    return node.text.trim()
  }
  wordAtPointFromTextPosition(params) {
    return this.wordAtPoint(
      params.textDocument.uri,
      params.position.line,
      params.position.character,
    )
  }
  symbolAtPointFromTextPosition(params) {
    const node = this.nodeAtPoint(
      params.textDocument.uri,
      params.position.line,
      params.position.character,
    )
    if (!node) {
      return null
    }
    if (
      node.type === 'variable_name' ||
      (node.type === 'word' &&
        ['function_definition', 'command_name'].includes(node.parent?.type))
    ) {
      return {
        word: node.text,
        range: TreeSitterUtil.range(node),
        kind:
          node.type === 'variable_name'
            ? LSP.SymbolKind.Variable
            : LSP.SymbolKind.Function,
      }
    }
    const input =
      (0, input_declarations_1.getInputVariableDeclaration)(node) ||
      (node.parent && (0, input_declarations_1.getInputVariableDeclaration)(node.parent))
    if (input && (0, lsp_1.isPositionIncludedInRange)(params.position, input.range)) {
      return {
        word: input.name,
        range: input.range,
        kind: LSP.SymbolKind.Variable,
      }
    }
    return null
  }
  setEnableSourceErrorDiagnostics(enableSourceErrorDiagnostics) {
    this.enableSourceErrorDiagnostics = enableSourceErrorDiagnostics
  }
  setIncludeAllWorkspaceSymbols(includeAllWorkspaceSymbols) {
    this.includeAllWorkspaceSymbols = includeAllWorkspaceSymbols
  }
  /**
   * If includeAllWorkspaceSymbols is true, this returns all URIs from the
   * background analysis, else, it returns the URIs of the files that are
   * linked to `uri` via sourcing.
   */
  findAllLinkedUris(uri) {
    if (this.includeAllWorkspaceSymbols) {
      return Object.keys(this.uriToAnalyzedDocument).filter((u) => u !== uri)
    }
    const uriToAnalyzedDocument = Object.entries(this.uriToAnalyzedDocument)
    const uris = []
    let continueSearching = true
    while (continueSearching) {
      continueSearching = false
      for (const [analyzedUri, analyzedDocument] of uriToAnalyzedDocument) {
        if (!analyzedDocument) {
          continue
        }
        for (const sourcedUri of analyzedDocument.sourcedUris.values()) {
          if (
            (sourcedUri === uri || uris.includes(sourcedUri)) &&
            !uris.includes(analyzedUri)
          ) {
            uris.push(analyzedUri)
            continueSearching = true
            break
          }
        }
      }
    }
    return uris
  }
  // Private methods
  /**
   * Returns all reachable URIs from the given URI based on sourced commands
   * If no URI is given, all URIs from the background analysis are returned.
   * If the includeAllWorkspaceSymbols flag is set, all URIs from the background analysis are also included.
   */
  getReachableUris({ fromUri } = {}) {
    if (!fromUri) {
      return Object.keys(this.uriToAnalyzedDocument)
    }
    const urisBasedOnSourcing = [
      fromUri,
      ...Array.from(this.findAllSourcedUris({ uri: fromUri })),
    ]
    if (this.includeAllWorkspaceSymbols) {
      return Array.from(
        new Set([...urisBasedOnSourcing, ...Object.keys(this.uriToAnalyzedDocument)]),
      )
    } else {
      return urisBasedOnSourcing
    }
  }
  /**
   * Returns all reachable URIs from `fromUri` based on source commands in
   * descending order starting from the top of the sourcing tree, this list
   * includes `fromUri`. If includeAllWorkspaceSymbols is true, other URIs from
   * the background analysis are also included after the ordered URIs in no
   * particular order.
   */
  getOrderedReachableUris({ fromUri }) {
    let uris = this.findAllSourcedUris({ uri: fromUri })
    for (const u1 of uris) {
      for (const u2 of this.findAllSourcedUris({ uri: u1 })) {
        if (uris.has(u2)) {
          uris.delete(u2)
          uris.add(u2)
        }
      }
    }
    uris = Array.from(uris)
    uris.reverse()
    uris.push(fromUri)
    if (this.includeAllWorkspaceSymbols) {
      uris.push(
        ...Object.keys(this.uriToAnalyzedDocument).filter((u) => !uris.includes(u)),
      )
    }
    return uris
  }
  getAnalyzedReachableUris({ fromUri } = {}) {
    return this.ensureUrisAreAnalyzed(this.getReachableUris({ fromUri }))
  }
  ensureUrisAreAnalyzed(uris) {
    return uris.filter((uri) => {
      if (!this.uriToAnalyzedDocument[uri]) {
        // Either the background analysis didn't run or the file is outside
        // the workspace. Let us try to analyze the file.
        try {
          logger_1.logger.debug(
            `Analyzing file not covered by background analysis ${uri}`,
          )
          const fileContent = fs.readFileSync(new URL(uri), 'utf8')
          this.analyze({
            document: vscode_languageserver_textdocument_1.TextDocument.create(
              uri,
              'shell',
              1,
              fileContent,
            ),
            uri,
          })
        } catch (err) {
          logger_1.logger.warn(`Error while analyzing file ${uri}: ${String(err)}`)
          return false
        }
      }
      return true
    })
  }
  /**
   * Get all declaration symbols (function or variables) from the given file/position
   * or from all files in the workspace. It will take into account the given position
   * to filter out irrelevant symbols.
   *
   * Note that this can return duplicates across the workspace.
   */
  getAllDeclarations({ uri: fromUri, position } = {}) {
    return this.getAnalyzedReachableUris({ fromUri }).reduce((symbols, uri) => {
      const analyzedDocument = this.uriToAnalyzedDocument[uri]
      if (analyzedDocument) {
        if (uri !== fromUri || !position) {
          // We use the global declarations for external files or if we do not have a position
          const { globalDeclarations } = analyzedDocument
          Object.values(globalDeclarations).forEach((symbol) => symbols.push(symbol))
        }
        // For the current file we find declarations based on the current scope
        if (uri === fromUri && position) {
          const node = analyzedDocument.tree.rootNode?.descendantForPosition({
            row: position.line,
            column: position.character,
          })
          const localDeclarations = (0, declarations_1.getLocalDeclarations)({
            node,
            rootNode: analyzedDocument.tree.rootNode,
            uri,
          })
          Object.keys(localDeclarations).map((name) => {
            const symbolsMatchingWord = localDeclarations[name]
            // Prefer the latest preceding definition, with the first following
            // function as a fallback: a function body can call a function that
            // is declared later in the file.
            let closestSymbol = null
            let followingFunction = null
            symbolsMatchingWord.forEach((symbol) => {
              if (
                symbol.location.range.start.line > position.line ||
                (symbol.kind === LSP.SymbolKind.Variable &&
                  symbol.location.range.start.line === position.line &&
                  symbol.location.range.start.character > position.character)
              ) {
                if (
                  symbol.kind === LSP.SymbolKind.Function &&
                  !symbol.containerName &&
                  node?.type === 'word' &&
                  node.parent?.type === 'command_name' &&
                  TreeSitterUtil.findParentOfType(node, 'function_definition') &&
                  (!followingFunction ||
                    symbol.location.range.start.line <
                      followingFunction.location.range.start.line)
                ) {
                  followingFunction = symbol
                }
                return
              }
              if (
                closestSymbol === null ||
                symbol.location.range.start.line > closestSymbol.location.range.start.line
              ) {
                closestSymbol = symbol
              }
            })
            const symbol = closestSymbol || followingFunction
            if (symbol) {
              symbols.push(symbol)
            }
          })
        }
      }
      return symbols
    }, [])
  }
  findAllSourcedUris({ uri }) {
    const allSourcedUris = new Set([])
    const addSourcedFilesFromUri = (fromUri) => {
      const sourcedUris = this.uriToAnalyzedDocument[fromUri]?.sourcedUris
      if (!sourcedUris) {
        return
      }
      sourcedUris.forEach((sourcedUri) => {
        if (!allSourcedUris.has(sourcedUri)) {
          allSourcedUris.add(sourcedUri)
          addSourcedFilesFromUri(sourcedUri)
        }
      })
    }
    addSourcedFilesFromUri(uri)
    return allSourcedUris
  }
  /**
   * Returns the parent `subshell` or `function_definition` of the given `node`.
   * To disambiguate between regular `subshell`s and `subshell`s that serve as a
   * `function_definition`'s body, this only returns a `function_definition` if
   * its body is a `compound_statement`.
   */
  parentScope(node) {
    return TreeSitterUtil.findParent(
      node,
      (n) =>
        n.type === 'subshell' ||
        (n.type === 'function_definition' && n.lastChild?.type === 'compound_statement'),
    )
  }
  /**
   * Find the node at the given point.
   */
  nodeAtPoint(uri, line, column) {
    const tree = this.uriToAnalyzedDocument[uri]?.tree
    if (!tree?.rootNode) {
      // Check for lacking rootNode (due to failed parse?)
      return null
    }
    return tree.rootNode.descendantForPosition({ row: line, column })
  }
  nodeAtPoints(uri, start, end) {
    const rootNode = this.uriToAnalyzedDocument[uri]?.tree.rootNode
    if (!rootNode) {
      return null
    }
    return rootNode.descendantForPosition(start, end)
  }
}
exports.default = Analyzer
//# sourceMappingURL=analyser.js.map
