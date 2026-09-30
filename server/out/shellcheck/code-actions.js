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
exports.getCodeActions = getCodeActions
const LSP = __importStar(require('vscode-languageserver/node'))
const directive_1 = require('./directive')
const COMMAND_TYPES = new Set([
  'command',
  'declaration_command',
  'unset_command',
  'variable_assignment',
  'test_command',
  'negated_command',
  'pipeline',
  'list',
  'redirected_statement',
  'compound_statement',
  'subshell',
  'if_statement',
  'while_statement',
  'for_statement',
  'c_style_for_statement',
  'case_statement',
  'function_definition',
])
// These nodes contain complete commands. Other parents require climbing out of
// an expression, pipeline, redirection, or function declaration first.
const COMMAND_CONTAINERS = new Set([
  'program',
  'compound_statement',
  'subshell',
  'if_statement',
  'elif_clause',
  'else_clause',
  'while_statement',
  'do_group',
  'case_item',
  'command_substitution',
  'process_substitution',
])
/** Add suppression actions to ShellCheck's fixes using the already analyzed tree. */
function getCodeActions({ document, rootNode, result }) {
  const actions = {}
  const text = document.getText()
  const lines = text.split(/\r\n|\n|\r/)
  const newline = text.match(/\r\n|\n|\r/)?.[0] || '\n'
  const headerComments = []
  let firstCommand
  for (const node of rootNode?.namedChildren || []) {
    if (node.type !== 'comment') {
      firstCommand = node
      break
    }
    headerComments.push(node)
  }
  for (const diagnostic of result.diagnostics) {
    const { id } = diagnostic.data
    const fix = result.codeActions[id]
    actions[id] = fix ? [fix] : []
    const code = String(diagnostic.code)
    if (!/^SC\d+$/.test(code)) continue
    const addAction = (scope, edit) => {
      if (!edit) return
      actions[id].push({
        title: `Disable ShellCheck rule ${code} for ${scope}`,
        kind: LSP.CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: { changes: { [document.uri]: [edit] } },
      })
    }
    const command = rootNode && findCommand(rootNode, diagnostic.range.start, lines)
    // Before the first top-level command, ShellCheck directives are file-wide.
    // Never present that edit as a command-local suppression.
    if (command && command.id !== firstCommand?.id) {
      const comments = []
      let previous = command.previousNamedSibling
      while (previous?.type === 'comment') {
        comments.unshift(previous)
        previous = previous.previousNamedSibling
      }
      const line = command.startPosition.row
      const indentation = lines[line].match(/^[ \t]*/)?.[0] || ''
      addAction('this command', disableEdit(code, comments, line, indentation))
    }
    const fileLine = lines[0].startsWith('#!') ? 1 : 0
    addAction('the entire file', disableEdit(code, headerComments, fileLine, ''))
  }
  return actions
  function disableEdit(code, comments, insertLine, indentation) {
    for (const comment of comments) {
      const line = comment.startPosition.row
      // Do not rewrite trailing comments or continued directives.
      if (!/^[ \t]*$/.test(lines[line].slice(0, comment.startPosition.column))) continue
      const updated = (0, directive_1.addDisabledRule)(lines[line], code)
      if (updated === lines[line]) return null
      if (updated !== null) {
        return LSP.TextEdit.replace(
          LSP.Range.create(line, 0, line, lines[line].length),
          updated,
        )
      }
    }
    // A shebang-only document may not yet have a trailing newline.
    const position =
      insertLine < lines.length
        ? LSP.Position.create(insertLine, 0)
        : document.positionAt(text.length)
    const prefix = insertLine < lines.length ? '' : newline
    return LSP.TextEdit.insert(
      position,
      `${prefix}${indentation}# shellcheck disable=${code}${newline}`,
    )
  }
}
function findCommand(rootNode, position, lines) {
  let node = rootNode.descendantForPosition({
    row: position.line,
    column: position.character,
  })
  while (node && node.type !== 'program') {
    if (
      COMMAND_TYPES.has(node.type) &&
      !node.hasError &&
      COMMAND_CONTAINERS.has(node.parent?.type || '') &&
      /^[ \t]*$/.test(lines[node.startPosition.row].slice(0, node.startPosition.column))
    ) {
      return node
    }
    node = node.parent
  }
  return null
}
//# sourceMappingURL=code-actions.js.map
