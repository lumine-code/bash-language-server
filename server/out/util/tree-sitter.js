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
exports.forEach = forEach
exports.range = range
exports.isDefinition = isDefinition
exports.isReference = isReference
exports.isVariableInReadCommand = isVariableInReadCommand
exports.isExpansion = isExpansion
exports.findParent = findParent
exports.findParentOfType = findParentOfType
exports.resolveStaticString = resolveStaticString
const LSP = __importStar(require('vscode-languageserver/node'))
/**
 * Recursively iterate over all nodes in a tree.
 *
 * @param node The node to start iterating from
 * @param callback The callback to call for each node. Return false to stop following children.
 */
function forEach(node, callback) {
  const followChildren = callback(node) !== false
  if (followChildren && node.children.length) {
    node.children.forEach((n) => forEach(n, callback))
  }
}
function range(n) {
  return LSP.Range.create(
    n.startPosition.row,
    n.startPosition.column,
    n.endPosition.row,
    n.endPosition.column,
  )
}
function isDefinition(n) {
  switch (n.type) {
    case 'variable_assignment':
    case 'function_definition':
      return true
    default:
      return false
  }
}
function isReference(n) {
  switch (n.type) {
    case 'variable_name':
    case 'command_name':
      return true
    default:
      return false
  }
}
function isVariableInReadCommand(n) {
  if (
    n.type === 'word' &&
    n.parent?.type === 'command' &&
    n.parent.firstChild?.text === 'read' &&
    !n.text.startsWith('-') &&
    !/^-.*[dinNptu]$/.test(n.previousSibling?.text ?? '')
  ) {
    return true
  }
  return false
}
function isExpansion(n) {
  switch (n.type) {
    case 'expansion':
    case 'simple_expansion':
      return true
    default:
      return false
  }
}
function findParent(start, predicate) {
  let node = start.parent
  while (node !== null) {
    if (predicate(node)) {
      return node
    }
    node = node.parent
  }
  return null
}
function findParentOfType(start, type) {
  if (typeof type === 'string') {
    return findParent(start, (n) => n.type === type)
  }
  return findParent(start, (n) => type.includes(n.type))
}
/**
 * Resolves the full string value of a node
 * Returns null if the value can't be statically determined (ie, it contains a variable or command substition).
 * Supports: word, string, raw_string, and concatenation
 */
function resolveStaticString(node) {
  if (node.type === 'concatenation') {
    const values = []
    for (const child of node.namedChildren) {
      const value = resolveStaticString(child)
      if (value === null) return null
      values.push(value)
    }
    return values.join('')
  }
  if (node.type === 'word') return node.text
  if (node.type === 'string' || node.type === 'raw_string') {
    if (node.namedChildCount === 0) return node.text.slice(1, -1)
    const children = node.namedChildren
    if (children.length === 1 && children[0].type === 'string_content')
      return children[0].text
    return null
  }
  return null
}
//# sourceMappingURL=tree-sitter.js.map
