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
exports.getLocalVariableDeclarations = getLocalVariableDeclarations
exports.getUnconditionalLocals = getUnconditionalLocals
const TreeSitterUtil = __importStar(require('./tree-sitter'))
function getLocalVariableDeclarations(command) {
  const scope = TreeSitterUtil.findParentOfType(command, 'function_definition')
  if (
    !scope ||
    command.type !== 'declaration_command' ||
    !['local', 'declare', 'typeset'].includes(command.firstChild?.text ?? '')
  ) {
    return []
  }
  const declarations = []
  let parsingOptions = true
  for (const argument of command.namedChildren) {
    let name =
      argument.type === 'variable_name' ? argument : argument.childForFieldName('name')
    if (name?.type === 'subscript') name = name.childForFieldName('name')
    if (parsingOptions) {
      const option = TreeSitterUtil.resolveStaticString(argument)
      if (option === '--') {
        parsingOptions = false
        continue
      }
      if (option && /^[-+]./.test(option)) {
        // Only known declaring modes can establish locality. -g is global;
        // print/function modes and unsupported options do not declare a local.
        if (!/^[-+][aAgiIlnrtux]+$/.test(option) || /^-.*g/.test(option)) return []
        continue
      }
      // An unresolved leading word might expand to an option such as -g.
      if (!name) return []
      parsingOptions = false
    }
    if (name?.type === 'variable_name') {
      declarations.push({
        name: name.text,
        node: name,
        scope,
        availableFrom: command.endIndex,
      })
    }
  }
  return declarations
}
/**
 * Only unconditional statements directly in the function body prove locality.
 * Conditional declarations, pipelines and runtime shell options remain unknown.
 */
function getUnconditionalLocals(body) {
  const locals = new Map()
  for (const statement of body.namedChildren) {
    if (statement.nextSibling?.type === '&') continue
    for (const declaration of getLocalVariableDeclarations(statement)) {
      if (!locals.has(declaration.name)) {
        locals.set(declaration.name, declaration.availableFrom)
      }
    }
  }
  return locals
}
//# sourceMappingURL=variable-declarations.js.map
