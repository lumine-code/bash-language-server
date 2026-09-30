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
exports.getCommandOptions = getCommandOptions
const node_child_process_1 = require('node:child_process')
const path = __importStar(require('node:path'))
const node_util_1 = require('node:util')
const turndown_1 = __importDefault(require('turndown'))
const LSP = __importStar(require('vscode-languageserver/node'))
const vscode_languageserver_textdocument_1 = require('vscode-languageserver-textdocument')
const analyser_1 = __importDefault(require('./analyser'))
const Builtins = __importStar(require('./builtins'))
const config = __importStar(require('./config'))
const executables_1 = __importDefault(require('./executables'))
const parser_1 = require('./parser')
const ReservedWords = __importStar(require('./reserved-words'))
const shellcheck_1 = require('./shellcheck')
const code_actions_1 = require('./shellcheck/code-actions')
const shfmt_1 = require('./shfmt')
const snippets_1 = require('./snippets')
const types_1 = require('./types')
const array_1 = require('./util/array')
const logger_1 = require('./util/logger')
const lsp_1 = require('./util/lsp')
const sh_1 = require('./util/sh')
const PARAMETER_EXPANSION_PREFIXES = new Set(['$', '${'])
const CONFIGURATION_SECTION = 'bashIde'
/**
 * The BashServer glues together the separate components to implement
 * the various parts of the Language Server Protocol.
 */
class BashServer {
  analyzer
  clientCapabilities
  config
  connection
  documents = new LSP.TextDocuments(vscode_languageserver_textdocument_1.TextDocument)
  executables
  linter
  formatter
  initializationOptions
  workspaceFolder
  uriToCodeActions = {}
  constructor({
    analyzer,
    capabilities,
    connection,
    executables,
    linter,
    formatter,
    workspaceFolder,
  }) {
    this.analyzer = analyzer
    this.clientCapabilities = capabilities
    this.connection = connection
    this.executables = executables
    this.linter = linter
    this.formatter = formatter
    this.workspaceFolder = workspaceFolder
    this.config = {} // NOTE: configured in updateConfiguration
    this.updateConfiguration(config.getDefaultConfiguration(), true)
  }
  /**
   * Initialize the server based on a connection to the client and the protocols
   * initialization parameters.
   */
  static async initialize(
    connection,
    { rootPath, rootUri, capabilities, initializationOptions },
  ) {
    ;(0, logger_1.setLogConnection)(connection)
    logger_1.logger.debug('Initializing...')
    const { PATH } = process.env
    const workspaceFolder = rootUri || rootPath || null
    if (!PATH) {
      throw new Error('Expected PATH environment variable to be set')
    }
    const parser = await (0, parser_1.initializeParser)()
    const analyzer = new analyser_1.default({
      parser,
      workspaceFolder,
    })
    const executables = await executables_1.default.fromPath(PATH)
    const server = new BashServer({
      analyzer,
      capabilities,
      connection,
      executables,
      workspaceFolder,
    })
    server.initializationOptions = initializationOptions
    logger_1.logger.debug('Initialized')
    return server
  }
  /**
   * The parts of the Language Server Protocol that we are currently supporting.
   */
  capabilities() {
    return {
      // For now we're using full-sync even though tree-sitter has great support
      // for partial updates.
      textDocumentSync: LSP.TextDocumentSyncKind.Full,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['$', '{', '-'],
      },
      hoverProvider: true,
      documentHighlightProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      referencesProvider: true,
      codeActionProvider: {
        codeActionKinds: [LSP.CodeActionKind.QuickFix],
        resolveProvider: false,
        workDoneProgress: false,
      },
      renameProvider: { prepareProvider: true },
      documentFormattingProvider: true,
    }
  }
  /**
   * Register handlers for the events from the Language Server Protocol that we
   * care about.
   */
  register(connection) {
    const hasConfigurationCapability = !!this.clientCapabilities?.workspace?.configuration
    const canDynamicallyRegisterConfigurationChangeNotification =
      !!this.clientCapabilities?.workspace?.didChangeConfiguration?.dynamicRegistration
    let currentDocument = null
    let initialized = false // Whether the client finished initializing
    this.documents.listen(this.connection)
    this.documents.onDidChangeContent(({ document }) => {
      // The content of a text document has changed. This event is emitted
      // when the text document first opened or when its content has changed.
      currentDocument = document
      if (initialized) {
        void this.analyzeAndLintDocument(document)
      }
    })
    this.documents.onDidClose((event) => {
      this.linter?.cancel(event.document.uri)
      if (currentDocument?.uri === event.document.uri) {
        currentDocument = null
      }
      void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] })
      delete this.uriToCodeActions[event.document.uri]
    })
    // Register all the handlers for the LSP events.
    connection.onCodeAction(this.onCodeAction.bind(this))
    connection.onCompletion(this.onCompletion.bind(this))
    connection.onCompletionResolve(this.onCompletionResolve.bind(this))
    connection.onDefinition(this.onDefinition.bind(this))
    connection.onDocumentHighlight(this.onDocumentHighlight.bind(this))
    connection.onDocumentSymbol(this.onDocumentSymbol.bind(this))
    connection.onHover(this.onHover.bind(this))
    connection.onReferences(this.onReferences.bind(this))
    connection.onWorkspaceSymbol(this.onWorkspaceSymbol.bind(this))
    connection.onPrepareRename(this.onPrepareRename.bind(this))
    connection.onRenameRequest(this.onRenameRequest.bind(this))
    connection.onDocumentFormatting(this.onDocumentFormatting.bind(this))
    connection.onShutdown(() => {
      this.analyzer.cancelBackgroundAnalysis()
      this.linter?.dispose()
    })
    /**
     * The initialized notification is sent from the client to the server after
     * the client received the result of the initialize request but before the
     * client is sending any other request or notification to the server.
     * The server can use the initialized notification for example to dynamically
     * register capabilities. The initialized notification may only be sent once.
     */
    connection.onInitialized(async () => {
      const { config: environmentConfig, environmentVariablesUsed } =
        config.getConfigFromEnvironmentVariables()
      this.updateConfiguration(environmentConfig)
      if (environmentVariablesUsed.length > 0) {
        logger_1.logger.warn(
          `Environment variable configuration is being deprecated, please use workspace configuration. The following environment variables were used: ${environmentVariablesUsed.join(', ')}`,
        )
      }
      const initializationOptions = config.InitializationOptionsSchema.safeParse(
        this.initializationOptions ?? {},
      )
      if (initializationOptions.success) {
        this.updateConfiguration({
          ...this.config,
          ...initializationOptions.data,
          shfmt: { ...this.config.shfmt, ...initializationOptions.data.shfmt },
        })
      } else {
        logger_1.logger.warn(
          `Failed to parse initialization options: ${initializationOptions.error}`,
        )
      }
      if (hasConfigurationCapability) {
        // Register event for all configuration changes.
        if (canDynamicallyRegisterConfigurationChangeNotification) {
          void connection.client.register(LSP.DidChangeConfigurationNotification.type, {
            section: CONFIGURATION_SECTION,
          })
        }
        // get current configuration from client
        const configObject =
          await connection.workspace.getConfiguration(CONFIGURATION_SECTION)
        this.updateConfiguration(configObject)
        logger_1.logger.debug('Configuration loaded from client')
      }
      initialized = true
      if (currentDocument) {
        // If we already have a document, analyze it now that we're initialized
        // and the linter is ready.
        void this.analyzeAndLintDocument(currentDocument)
      }
      // NOTE: we do not block the server initialization on this background analysis.
      void this.startBackgroundAnalysis()
    })
    // Respond to changes in the configuration.
    connection.onDidChangeConfiguration(({ settings }) => {
      const configChanged = this.updateConfiguration(settings[CONFIGURATION_SECTION])
      if (configChanged && initialized) {
        logger_1.logger.debug('Configuration changed')
        void this.startBackgroundAnalysis()
        for (const document of this.documents.all()) {
          void this.analyzeAndLintDocument(document)
        }
      }
    })
    // FIXME: re-lint on workspace folder change
  }
  // ==================
  // Internal functions
  // ==================
  async startBackgroundAnalysis() {
    const { workspaceFolder } = this
    if (workspaceFolder) {
      return this.analyzer.initiateBackgroundAnalysis({
        globPattern: this.config.globPattern,
        backgroundAnalysisMaxFiles: this.config.backgroundAnalysisMaxFiles,
        backgroundAnalysisIgnore: this.config.backgroundAnalysisIgnore,
      })
    }
    return Promise.resolve({ filesParsed: 0 })
  }
  updateConfiguration(configObject, isDefaultConfig = false) {
    if (typeof configObject === 'object' && configObject !== null) {
      try {
        const newConfig = config.ConfigSchema.parse(configObject)
        if (!(0, node_util_1.isDeepStrictEqual)(this.config, newConfig)) {
          this.config = newConfig
          // NOTE: I don't really like this... An alternative would be to pass in the
          // shellcheck executable path when linting. We would need to handle
          // resetting the canLint flag though.
          const { shellcheckPath } = this.config
          this.linter?.dispose()
          if (!shellcheckPath) {
            logger_1.logger.info(
              'ShellCheck linting is disabled as "shellcheckPath" was not set',
            )
            this.linter = undefined
          } else {
            this.linter = new shellcheck_1.Linter({
              executablePath: shellcheckPath,
              externalSources: this.config.shellcheckExternalSources,
            })
          }
          const shfmtPath = this.config.shfmt?.path
          if (!shfmtPath) {
            logger_1.logger.info(
              'Shfmt formatting is disabled as "shfmt.path" was not set',
            )
            this.formatter = undefined
          } else {
            this.formatter = new shfmt_1.Formatter({ executablePath: shfmtPath })
          }
          this.analyzer.setEnableSourceErrorDiagnostics(
            this.config.enableSourceErrorDiagnostics,
          )
          this.analyzer.setIncludeAllWorkspaceSymbols(
            this.config.includeAllWorkspaceSymbols,
          )
          if (!isDefaultConfig) {
            // We skip setting the log level as the default configuration should
            // not override the environment defined log level.
            ;(0, logger_1.setLogLevel)(this.config.logLevel)
          }
          return true
        }
      } catch (err) {
        logger_1.logger.warn(`updateConfiguration: failed with ${String(err)}`)
      }
    }
    return false
  }
  /**
   * Analyze and lint the given document.
   */
  async analyzeAndLintDocument(document) {
    const { uri, version } = document
    delete this.uriToCodeActions[uri]
    // Load the tree for the modified contents into the analyzer:
    let diagnostics = this.analyzer.analyze({ uri, document })
    // Run ShellCheck diagnostics:
    const { linter } = this
    if (linter) {
      try {
        const sourceFolders = this.workspaceFolder ? [this.workspaceFolder] : []
        const result = await linter.lint(
          document,
          sourceFolders,
          this.config.shellcheckArguments,
        )
        if (!result || this.linter !== linter) {
          return
        }
        const { diagnostics: lintDiagnostics } = result
        diagnostics = diagnostics.concat(lintDiagnostics)
        this.uriToCodeActions[uri] = (0, code_actions_1.getCodeActions)({
          document,
          rootNode: this.analyzer.getRootNode(uri),
          result,
        })
      } catch (err) {
        logger_1.logger.error(`Error while linting: ${String(err)}`)
      }
    }
    await this.connection.sendDiagnostics({ uri, version, diagnostics })
  }
  logRequest({ request, params, word }) {
    const wordLog = word ? `"${word}"` : 'null'
    logger_1.logger.debug(
      `${request} ${params.position.line}:${params.position.character} word=${wordLog}`,
    )
  }
  getCompletionItemsForSymbols({ symbols, currentUri }) {
    return deduplicateSymbols({ symbols, currentUri }).map((symbol) => ({
      label: symbol.name,
      kind: symbolKindToCompletionKind(symbol.kind),
      data: {
        type: types_1.CompletionItemDataType.Symbol,
      },
      documentation:
        symbol.location.uri !== currentUri
          ? this.getDocumentationForSymbol({
              currentUri,
              symbol,
            })
          : undefined,
    }))
  }
  getDocumentationForSymbol({ currentUri, symbol }) {
    logger_1.logger.debug(
      `getDocumentationForSymbol: symbol=${symbol.name} uri=${symbol.location.uri}`,
    )
    const symbolUri = symbol.location.uri
    const symbolStartLine = symbol.location.range.start.line
    const commentAboveSymbol = this.analyzer.commentsAbove(symbolUri, symbolStartLine)
    const symbolDocumentation = commentAboveSymbol ? `\n\n${commentAboveSymbol}` : ''
    const hoverHeader = `${symbolKindToDescription(symbol.kind)}: **${symbol.name}**`
    const symbolLocation =
      symbolUri !== currentUri
        ? `in ${path.relative(path.dirname(currentUri), symbolUri)}`
        : `on line ${symbolStartLine + 1}`
    // TODO: An improvement could be to add show the symbol definition in the hover instead
    // of the defined location – similar to how VSCode works for languages like TypeScript.
    return getMarkdownContent(
      `${hoverHeader} - *defined ${symbolLocation}*${symbolDocumentation}`,
    )
  }
  throwResponseError(message, code = LSP.LSPErrorCodes.RequestFailed) {
    throw new LSP.ResponseError(code, message)
  }
  // ==============================
  // Language server event handlers
  // ==============================
  async onCodeAction(params) {
    const codeActionsForUri = this.uriToCodeActions[params.textDocument.uri] || {}
    const codeActions = (0, array_1.uniqueBasedOnHash)(
      params.context.diagnostics.flatMap(({ data }) => codeActionsForUri[data?.id] || []),
      (action) => JSON.stringify([action.title, action.edit]),
    )
    logger_1.logger.debug(`onCodeAction: found ${codeActions.length} code action(s)`)
    return codeActions
  }
  onCompletion(params) {
    const word = this.analyzer.wordAtPointFromTextPosition({
      ...params,
      position: {
        line: params.position.line,
        // Go one character back to get completion on the current word
        character: Math.max(params.position.character - 1, 0),
      },
    })
    this.logRequest({ request: 'onCompletion', params, word })
    if (word?.startsWith('#')) {
      // Inside a comment block
      return []
    }
    if (word === '{') {
      // We should not complete when it is not prefixed by a $.
      // This case needs to be here as "{" is a completionProvider triggerCharacter.
      return []
    }
    if (!word) {
      const nextCharacter = this.analyzer.getDocument(params.textDocument.uri)?.getText({
        start: params.position,
        end: { ...params.position, character: params.position.character + 1 },
      })
      const isNextCharacterSpaceOrEmpty = nextCharacter === '' || nextCharacter === ' '
      if (!isNextCharacterSpaceOrEmpty) {
        // We are in the middle of something, so don't complete
        return []
      }
    }
    const currentUri = params.textDocument.uri
    // TODO: an improvement here would be to detect if the current word is
    // not only a parameter expansion prefix, but also if the word is actually
    // inside a parameter expansion (e.g. auto completing on a word $MY_VARIA).
    const shouldCompleteOnVariables = word
      ? PARAMETER_EXPANSION_PREFIXES.has(word)
      : false
    const symbolCompletions =
      word === null
        ? []
        : this.getCompletionItemsForSymbols({
            symbols: shouldCompleteOnVariables
              ? this.analyzer.getAllVariables({
                  uri: currentUri,
                  position: params.position,
                })
              : this.analyzer.findDeclarationsMatchingWord({
                  exactMatch: false,
                  uri: currentUri,
                  word,
                  position: params.position,
                }),
            currentUri,
          })
    if (shouldCompleteOnVariables) {
      // In case we auto complete on a word that starts a parameter expansion,
      // we do not return anything else than variable/parameter suggestions.
      // Note: that LSP clients should not call onCompletion in the middle
      // of a word, so the following should work for client.
      return symbolCompletions
    }
    const reservedWordsCompletions = ReservedWords.LIST.map((reservedWord) => ({
      label: reservedWord,
      kind: LSP.CompletionItemKind.Keyword,
      data: {
        type: types_1.CompletionItemDataType.ReservedWord,
      },
    }))
    const programCompletions = this.executables
      .list()
      .filter((executable) => !Builtins.isBuiltin(executable))
      .map((executable) => {
        return {
          label: executable,
          kind: LSP.CompletionItemKind.Function,
          data: {
            type: types_1.CompletionItemDataType.Executable,
          },
        }
      })
    const builtinsCompletions = Builtins.LIST.map((builtin) => ({
      label: builtin,
      kind: LSP.CompletionItemKind.Function,
      data: {
        type: types_1.CompletionItemDataType.Builtin,
      },
    }))
    let optionsCompletions = []
    if (word?.startsWith('-')) {
      const commandName = this.analyzer.commandNameAtPoint(
        params.textDocument.uri,
        params.position.line,
        // Go one character back to get completion on the current word
        Math.max(params.position.character - 1, 0),
      )
      if (commandName) {
        optionsCompletions = getCommandOptions(commandName, word).map((option) => ({
          label: option,
          kind: LSP.CompletionItemKind.Constant,
          data: {
            type: types_1.CompletionItemDataType.Symbol,
          },
          textEdit: {
            newText: option.slice(word.length),
            range: {
              start: {
                character: params.position.character,
                line: params.position.line,
              },
              end: {
                character: params.position.character,
                line: params.position.line,
              },
            },
          },
        }))
      }
    }
    const supportsSnippets =
      this.clientCapabilities.textDocument?.completion?.completionItem?.snippetSupport ===
      true
    const allCompletions = [
      ...reservedWordsCompletions,
      ...symbolCompletions,
      ...programCompletions,
      ...builtinsCompletions,
      ...optionsCompletions,
      ...(supportsSnippets ? snippets_1.SNIPPETS : []),
    ]
    if (word) {
      // Filter to only return suffixes of the current word
      return allCompletions.filter((item) => item.label.startsWith(word))
    }
    return allCompletions
  }
  async onCompletionResolve(item) {
    const {
      label,
      data: { type },
    } = item
    logger_1.logger.debug(`onCompletionResolve label=${label} type=${type}`)
    try {
      let documentation = null
      if (
        type === types_1.CompletionItemDataType.Executable ||
        type === types_1.CompletionItemDataType.Builtin ||
        type === types_1.CompletionItemDataType.ReservedWord
      ) {
        documentation = await (0, sh_1.getShellDocumentation)({ word: label })
      }
      return documentation
        ? {
            ...item,
            documentation: getMarkdownContent(documentation, 'man'),
          }
        : item
    } catch (error) {
      return item
    }
  }
  onDefinition(params) {
    const word = this.analyzer.wordAtPointFromTextPosition(params)
    this.logRequest({ request: 'onDefinition', params, word })
    if (!word) {
      return null
    }
    return this.analyzer.findDeclarationLocations({
      position: params.position,
      uri: params.textDocument.uri,
      word,
    })
  }
  onDocumentHighlight(params) {
    const word = this.analyzer.wordAtPointFromTextPosition(params)
    this.logRequest({ request: 'onDocumentHighlight', params, word })
    if (!word) {
      return []
    }
    return this.analyzer
      .findOccurrences(params.textDocument.uri, word)
      .map((n) => ({ range: n.range }))
  }
  onDocumentSymbol(params) {
    // TODO: ideally this should return LSP.DocumentSymbol[] instead of LSP.SymbolInformation[]
    // which is a hierarchy of symbols.
    // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol
    logger_1.logger.debug(`onDocumentSymbol`)
    return this.analyzer.getDeclarationsForUri({ uri: params.textDocument.uri })
  }
  async onHover(params) {
    const word = this.analyzer.wordAtPointFromTextPosition(params)
    const currentUri = params.textDocument.uri
    this.logRequest({ request: 'onHover', params, word })
    if (!word || word.startsWith('#')) {
      return null
    }
    const isVariable =
      this.analyzer.symbolAtPointFromTextPosition(params)?.kind ===
      LSP.SymbolKind.Variable
    const { explainshellEndpoint } = this.config
    if (explainshellEndpoint && !isVariable) {
      try {
        const { helpHTML } = await this.analyzer.getExplainshellDocumentation({
          params,
          endpoint: explainshellEndpoint,
        })
        if (helpHTML) {
          return {
            contents: {
              kind: 'markdown',
              value: new turndown_1.default().turndown(helpHTML),
            },
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : error
        logger_1.logger.warn(
          `getExplainshellDocumentation exception: ${String(errorMessage)}`,
        )
      }
    }
    const symbolsMatchingWord = this.analyzer.findDeclarationsMatchingWord({
      exactMatch: true,
      uri: currentUri,
      word,
      position: params.position,
    })
    if (
      !isVariable &&
      (ReservedWords.isReservedWord(word) ||
        Builtins.isBuiltin(word) ||
        (symbolsMatchingWord.length == 0 && (await this.executables.isExecutable(word))))
    ) {
      logger_1.logger.debug(
        `onHover: getting shell documentation for reserved word or builtin or executable`,
      )
      const shellDocumentation = await (0, sh_1.getShellDocumentation)({ word })
      if (shellDocumentation) {
        return { contents: getMarkdownContent(shellDocumentation, 'man') }
      }
    } else {
      const symbolDocumentation = deduplicateSymbols({
        symbols: symbolsMatchingWord,
        currentUri,
      })
        // do not return hover referencing for the current line
        .filter(
          (symbol) =>
            symbol.location.uri !== currentUri ||
            symbol.location.range.start.line !== params.position.line,
        )
        .map((symbol) => this.getDocumentationForSymbol({ currentUri, symbol }))
      if (symbolDocumentation.length === 1) {
        return { contents: symbolDocumentation[0] }
      }
    }
    return null
  }
  onReferences(params) {
    const word = this.analyzer.wordAtPointFromTextPosition(params)
    this.logRequest({ request: 'onReferences', params, word })
    if (!word) {
      return null
    }
    const isCurrentDeclaration = (l) =>
      l.uri === params.textDocument.uri &&
      (0, lsp_1.isPositionIncludedInRange)(params.position, l.range)
    return this.analyzer
      .findReferences(word)
      .filter((l) => params.context.includeDeclaration || !isCurrentDeclaration(l))
  }
  onWorkspaceSymbol(params) {
    logger_1.logger.debug('onWorkspaceSymbol')
    return this.analyzer.findDeclarationsWithFuzzySearch(params.query)
  }
  onPrepareRename(params) {
    const symbol = this.analyzer.symbolAtPointFromTextPosition(params)
    this.logRequest({ request: 'onPrepareRename', params, word: symbol?.word })
    if (
      !symbol ||
      (symbol.kind === LSP.SymbolKind.Variable &&
        (symbol.word === '_' || !/^[a-z_][\w]*$/i.test(symbol.word)))
    ) {
      return null
    }
    return symbol.range
  }
  onRenameRequest(params) {
    const symbol = this.analyzer.symbolAtPointFromTextPosition(params)
    this.logRequest({ request: 'onRenameRequest', params, word: symbol?.word })
    if (!symbol) {
      return null
    }
    if (
      symbol.kind === LSP.SymbolKind.Variable &&
      (params.newName === '_' || !/^[a-z_][\w]*$/i.test(params.newName))
    ) {
      this.throwResponseError('Invalid variable name given.')
    }
    if (symbol.kind === LSP.SymbolKind.Function && params.newName.includes('$')) {
      this.throwResponseError('Invalid function name given.')
    }
    const { declaration, parent } = this.analyzer.findOriginalDeclaration({
      position: params.position,
      uri: params.textDocument.uri,
      word: symbol.word,
      kind: symbol.kind,
    })
    // File-wide rename
    if (!declaration || parent) {
      return {
        changes: {
          [params.textDocument.uri]: this.analyzer
            .findOccurrencesWithin({
              uri: params.textDocument.uri,
              word: symbol.word,
              kind: symbol.kind,
              start: declaration?.range.start,
              scope: parent?.range,
            })
            .map((r) => LSP.TextEdit.replace(r, params.newName)),
        },
      }
    }
    // Workspace-wide rename
    const edits = {}
    edits.changes = {
      [declaration.uri]: this.analyzer
        .findOccurrencesWithin({
          uri: declaration.uri,
          word: symbol.word,
          kind: symbol.kind,
          start: declaration.range.start,
        })
        .map((r) => LSP.TextEdit.replace(r, params.newName)),
    }
    for (const uri of this.analyzer.findAllLinkedUris(declaration.uri)) {
      edits.changes[uri] = this.analyzer
        .findOccurrencesWithin({
          uri,
          word: symbol.word,
          kind: symbol.kind,
        })
        .map((r) => LSP.TextEdit.replace(r, params.newName))
    }
    return edits
  }
  async onDocumentFormatting(params) {
    if (this.formatter) {
      try {
        const document = this.documents.get(params.textDocument.uri)
        if (!document) {
          logger_1.logger.error(`Error getting document: ${params.textDocument.uri}`)
          return null
        }
        return await this.formatter.format(document, params.options, this.config.shfmt)
      } catch (err) {
        logger_1.logger.error(`Error while formatting: ${String(err)}`)
      }
    }
    return null
  }
}
exports.default = BashServer
/**
 * Deduplicate symbols by prioritizing the current file.
 */
function deduplicateSymbols({ symbols, currentUri }) {
  const isCurrentFile = ({ location: { uri } }) => uri === currentUri
  const getSymbolId = ({ name, kind }) => `${name}${kind}`
  const symbolsCurrentFile = symbols.filter((s) => isCurrentFile(s))
  const symbolsOtherFiles = symbols
    .filter((s) => !isCurrentFile(s))
    // Remove identical symbols matching current file
    .filter(
      (symbolOtherFiles) =>
        !symbolsCurrentFile.some(
          (symbolCurrentFile) =>
            getSymbolId(symbolCurrentFile) === getSymbolId(symbolOtherFiles),
        ),
    )
  // NOTE: it might be that uniqueBasedOnHash is not needed anymore
  return (0, array_1.uniqueBasedOnHash)(
    [...symbolsCurrentFile, ...symbolsOtherFiles],
    getSymbolId,
  )
}
function symbolKindToCompletionKind(s) {
  switch (s) {
    case LSP.SymbolKind.File:
      return LSP.CompletionItemKind.File
    case LSP.SymbolKind.Module:
    case LSP.SymbolKind.Namespace:
    case LSP.SymbolKind.Package:
      return LSP.CompletionItemKind.Module
    case LSP.SymbolKind.Class:
      return LSP.CompletionItemKind.Class
    case LSP.SymbolKind.Method:
      return LSP.CompletionItemKind.Method
    case LSP.SymbolKind.Property:
      return LSP.CompletionItemKind.Property
    case LSP.SymbolKind.Field:
      return LSP.CompletionItemKind.Field
    case LSP.SymbolKind.Constructor:
      return LSP.CompletionItemKind.Constructor
    case LSP.SymbolKind.Enum:
      return LSP.CompletionItemKind.Enum
    case LSP.SymbolKind.Interface:
      return LSP.CompletionItemKind.Interface
    case LSP.SymbolKind.Function:
      return LSP.CompletionItemKind.Function
    case LSP.SymbolKind.Variable:
      return LSP.CompletionItemKind.Variable
    case LSP.SymbolKind.Constant:
      return LSP.CompletionItemKind.Constant
    case LSP.SymbolKind.String:
    case LSP.SymbolKind.Number:
    case LSP.SymbolKind.Boolean:
    case LSP.SymbolKind.Array:
    case LSP.SymbolKind.Key:
    case LSP.SymbolKind.Null:
      return LSP.CompletionItemKind.Text
    case LSP.SymbolKind.Object:
      return LSP.CompletionItemKind.Module
    case LSP.SymbolKind.EnumMember:
      return LSP.CompletionItemKind.EnumMember
    case LSP.SymbolKind.Struct:
      return LSP.CompletionItemKind.Struct
    case LSP.SymbolKind.Event:
      return LSP.CompletionItemKind.Event
    case LSP.SymbolKind.Operator:
      return LSP.CompletionItemKind.Operator
    case LSP.SymbolKind.TypeParameter:
      return LSP.CompletionItemKind.TypeParameter
    default:
      return LSP.CompletionItemKind.Text
  }
}
function symbolKindToDescription(s) {
  switch (s) {
    case LSP.SymbolKind.Function:
      return 'Function'
    case LSP.SymbolKind.Variable:
      return 'Variable'
    default:
      return 'Keyword'
  }
}
function getMarkdownContent(documentation, language) {
  return {
    value: language
      ? // oxlint-disable-next-line prefer-template
        ['``` ' + language, documentation, '```'].join('\n')
      : documentation,
    kind: LSP.MarkupKind.Markdown,
  }
}
function getCommandOptions(name, word) {
  // bash-completion may execute the command with --help. Only accept plain
  // command names, never paths or shell syntax taken from the document.
  if (!/^[A-Za-z0-9_]/.test(name) || /[^A-Za-z0-9_.+-]/.test(name)) {
    return []
  }
  const optionsScript = path.join(__dirname, './get-options.sh')
  const options =
    process.platform === 'win32'
      ? (0, node_child_process_1.spawnSync)('bash', [optionsScript, name, word])
      : (0, node_child_process_1.spawnSync)(optionsScript, [name, word])
  if (options.status !== 0) {
    return []
  }
  return options.stdout
    .toString()
    .split('\t')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}
//# sourceMappingURL=server.js.map
