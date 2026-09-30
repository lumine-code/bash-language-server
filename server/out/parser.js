'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.initializeParser = initializeParser
const promises_1 = require('fs/promises')
const web_tree_sitter_1 = require('web-tree-sitter')
async function initializeParser() {
  await web_tree_sitter_1.Parser.init()
  const parser = new web_tree_sitter_1.Parser()
  /**
   * See https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web#generate-wasm-language-files
   *
   * To compile and use a new tree-sitter-bash version:
   *    bash scripts/upgrade-tree-sitter.sh
   */
  const wasm = await (0, promises_1.readFile)(`${__dirname}/../tree-sitter-bash.wasm`)
  const lang = await web_tree_sitter_1.Language.load(wasm)
  parser.setLanguage(lang)
  return parser
}
//# sourceMappingURL=parser.js.map
