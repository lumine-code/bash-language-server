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
const fs = __importStar(require('fs'))
const path_1 = require('path')
const ArrayUtil = __importStar(require('./util/array'))
const FsUtil = __importStar(require('./util/fs'))
/**
 * Provides information based on the programs on your PATH
 */
class Executables {
  executables
  constructor(executables) {
    this.executables = new Set(executables)
  }
  /**
   * @param path uses the current platform's PATH delimiter.
   */
  static fromPath(path) {
    const paths = path.split(path_1.delimiter)
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
  /**
   * Recognize commands invoked by their absolute path as well as names on PATH.
   */
  async isExecutable(executable) {
    // Probing UNC or device paths can trigger network authentication on Windows.
    if (process.platform === 'win32' && /^(?:[\\/]{2}|[\\/]\?\?[\\/])/.test(executable)) {
      return false
    }
    if (!(0, path_1.isAbsolute)(executable)) {
      return this.isExecutableOnPATH(executable)
    }
    try {
      const stats = await fs.promises.stat(executable)
      if (!stats.isFile()) {
        return false
      }
      await fs.promises.access(executable, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }
}
exports.default = Executables
/**
 * Only returns direct children, or the path itself if it's an executable.
 */
async function findExecutablesInPath(path) {
  path = FsUtil.untildify(path)
  try {
    const pathStats = await fs.promises.stat(path)
    if (pathStats.isDirectory()) {
      const childrenPaths = await fs.promises.readdir(path)
      const files = []
      for (const childrenPath of childrenPaths) {
        try {
          const stats = await fs.promises.stat((0, path_1.join)(path, childrenPath))
          if (isExecutableFile((0, path_1.join)(path, childrenPath), stats)) {
            files.push(executableName(childrenPath))
          }
        } catch (error) {
          // Ignore error
        }
      }
      return files
    } else if (isExecutableFile(path, pathStats)) {
      return [executableName(path)]
    }
  } catch (error) {
    // Ignore error
  }
  return []
}
function executableExtensions() {
  return new Set(
    (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .map((extension) => extension.toLowerCase()),
  )
}
function isExecutableFile(filePath, stats) {
  if (process.platform === 'win32') {
    return (
      stats.isFile() &&
      executableExtensions().has((0, path_1.extname)(filePath).toLowerCase())
    )
  }
  const isExecutable = !!(1 & parseInt((stats.mode & parseInt('777', 8)).toString(8)[0]))
  return stats.isFile() && isExecutable
}
function executableName(filePath) {
  const name = (0, path_1.basename)(filePath)
  if (process.platform !== 'win32') return name
  const extension = (0, path_1.extname)(name)
  return executableExtensions().has(extension.toLowerCase())
    ? name.slice(0, -extension.length)
    : name
}
//# sourceMappingURL=executables.js.map
