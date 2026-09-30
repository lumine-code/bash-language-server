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
Object.defineProperty(exports, '__esModule', { value: true })
exports.getInputVariableDeclarations = getInputVariableDeclarations
exports.getInputVariableDeclaration = getInputVariableDeclaration
exports.variableNameRange = variableNameRange
const LSP = __importStar(require('vscode-languageserver/node'))
const TreeSitterUtil = __importStar(require('./tree-sitter'))
/** Literal destinations only: no implicit REPLY/MAPFILE or runtime word expansion. */
function getInputVariableDeclarations(command) {
  const builtin = command.childForFieldName('name')?.text
  if (
    command.type !== 'command' ||
    !['read', 'readarray', 'mapfile'].includes(builtin ?? '')
  )
    return []
  // Do not invent declarations in execution contexts the lexical scope engine
  // cannot distinguish (in particular, separate pipeline stages).
  if (
    command.nextSibling?.type === '&' ||
    TreeSitterUtil.findParent(
      command,
      (parent) =>
        ['pipeline', 'command_substitution', 'process_substitution'].includes(
          parent.type,
        ) || parent.nextSibling?.type === '&',
    )
  )
    return []
  const isRead = builtin === 'read'
  const arguments_ = command.childrenForFieldName('argument')
  const flags = isRead ? 'ersE' : 't'
  const optionsWithValues = isRead ? 'adinNptu' : 'dnOscuC'
  const scope = TreeSitterUtil.findParentOfType(command, [
    'function_definition',
    'subshell',
    'program',
  ])
  const declarations = []
  let array
  let options = true
  function destination(node, offset = 0) {
    const value = TreeSitterUtil.resolveStaticString(node)
    const name = value?.slice(offset)
    if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return null
    // Restrict edits to a literal token (possibly wholly quoted), not concatenations.
    const quote = ['string', 'raw_string'].includes(node.type) ? 1 : 0
    if (
      !['word', 'string', 'raw_string'].includes(node.type) ||
      node.text.slice(quote, quote ? -1 : undefined) !== value
    )
      return null
    const start = node.startPosition.column + quote + offset
    return {
      name,
      node,
      scope,
      availableFrom: command.endIndex,
      range: LSP.Range.create(
        node.startPosition.row,
        start,
        node.startPosition.row,
        start + name.length,
      ),
    }
  }
  for (let i = 0; i < arguments_.length; i++) {
    const argument = arguments_[i]
    const value = TreeSitterUtil.resolveStaticString(argument)
    if (options) {
      if (value === null) return [] // An expansion might change the option layout.
      if (value === '--') {
        options = false
        continue
      }
      if (value.startsWith('-') && value.length > 1) {
        for (let j = 1; j < value.length; j++) {
          const option = value[j]
          if (flags.includes(option)) continue
          if (!optionsWithValues.includes(option)) return []
          const attached = j + 1 < value.length
          const operand = attached ? argument : arguments_[++i]
          if (
            !operand ||
            (operand.type !== 'number' &&
              TreeSitterUtil.resolveStaticString(operand) === null)
          )
            return []
          if (option === 'a' && isRead) array = destination(operand, attached ? j + 1 : 0)
          break
        }
        continue
      }
      options = false
    }
    if (array !== undefined) continue // read -a ignores positional destinations.
    const declaration = destination(argument)
    if (!declaration) break
    declarations.push(declaration)
    if (!isRead) break // mapfile/readarray have one array destination.
  }
  return array === undefined ? declarations : array ? [array] : []
}
function getInputVariableDeclaration(node) {
  if (node.parent?.type !== 'command') return undefined
  return getInputVariableDeclarations(node.parent).find((declaration) =>
    declaration.node.equals(node),
  )
}
function variableNameRange(node) {
  return getInputVariableDeclaration(node)?.range ?? TreeSitterUtil.range(node)
}
//# sourceMappingURL=input-declarations.js.map
