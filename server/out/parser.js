'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.initializeParser = initializeParser
const Parser = require('web-tree-sitter')
async function initializeParser() {
  await Parser.init()
  const parser = new Parser()
  /**
   * See https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web#generate-wasm-language-files
   *
   * To compile and use a new tree-sitter-bash version:
   *    sh scripts/upgrade-tree-sitter.sh
   */
  const lang = await Parser.Language.load(`${__dirname}/../tree-sitter-bash.wasm`)
  parser.setLanguage(lang)
  return parser
}
//# sourceMappingURL=parser.js.map
