'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const fs = require('fs')
const node_path_1 = require('node:path')
const ArrayUtil = require('./util/array')
const FsUtil = require('./util/fs')
/**
 * Provides information based on the programs on your PATH
 */
class Executables {
  executables
  constructor(executables) {
    this.executables = new Set(executables)
  }
  /**
   * @param pathValue is expected to use the platform PATH delimiter.
   */
  static fromPath(pathValue) {
    const paths = pathValue.split(node_path_1.delimiter)
    const promises = paths.map((x) => findExecutablesInPath(x))
    return Promise.all(promises)
      .then(ArrayUtil.flattenArray)
      .then(ArrayUtil.uniq)
      .then((executables) => new Executables(executables))
  }
  /**
   * Find all programs in your PATH
   */
  list() {
    return Array.from(this.executables.values())
  }
  /**
   * Check if the the given {{executable}} exists on the PATH
   */
  isExecutableOnPATH(executable) {
    return this.executables.has(executable)
  }
}
exports.default = Executables
/**
 * Only returns direct children, or the path itself if it's an executable.
 */
async function findExecutablesInPath(path) {
  path = FsUtil.untildify(path)
  try {
    const pathStats = await fs.promises.lstat(path)
    if (pathStats.isDirectory()) {
      const childrenPaths = await fs.promises.readdir(path)
      const files = []
      for (const childrenPath of childrenPaths) {
        try {
          const stats = await fs.promises.lstat((0, node_path_1.join)(path, childrenPath))
          if (isExecutableFile(stats)) {
            files.push(executableName(childrenPath))
          }
        } catch {
          // Ignore error
        }
      }
      return files
    } else if (isExecutableFile(pathStats)) {
      return [executableName(path)]
    }
  } catch {
    // Ignore error
  }
  return []
}
function isExecutableFile(stats) {
  if (process.platform === 'win32') {
    return stats.isFile()
  }
  const isExecutable = !!(1 & parseInt((stats.mode & parseInt('777', 8)).toString(8)[0]))
  return stats.isFile() && isExecutable
}
function executableName(filePath) {
  const name = (0, node_path_1.basename)(filePath)
  if (process.platform !== 'win32') {
    return name
  }
  const extension = (0, node_path_1.extname)(name)
  const executableExtensions = new Set(
    (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .map((value) => value.toLowerCase()),
  )
  return executableExtensions.has(extension.toLowerCase())
    ? name.slice(0, -extension.length)
    : name
}
//# sourceMappingURL=executables.js.map
