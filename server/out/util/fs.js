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
exports.untildify = untildify
exports.getFilePaths = getFilePaths
const fs = __importStar(require('node:fs'))
const os = __importStar(require('node:os'))
const path = __importStar(require('node:path'))
const node_url_1 = require('node:url')
const fastGlob = __importStar(require('fast-glob'))
const MAX_DISCOVERY_DIRECTORIES = 10000
const DISCOVERY_TIMEOUT_MS = 10000
// from https://github.com/sindresorhus/untildify/blob/f85a087418aeaa2beb56fe2684fe3b64fc8c588d/index.js#L11
function untildify(pathWithTilde) {
  const homeDirectory = os.homedir()
  return homeDirectory
    ? pathWithTilde.replace(/^~(?=$|\/|\\)/, homeDirectory)
    : pathWithTilde
}
/**
 * Create a file system adapter for `fast-glob` that stops walking a directory
 * when it links back to one of its own ancestors.
 *
 * `fast-glob` follows symbolic links by default and, like `node-glob`, walks a
 * cyclic symbolic link forever until the process runs out of memory. Upstream
 * tracks this as a known limitation with no fix, and the suggested workarounds
 * (`followSymbolicLinks: false` or a `deep` limit) either drop symlink support
 * or truncate deep trees — see https://github.com/mrmlnc/fast-glob/issues/74.
 *
 * Only the directories that are symbolic links are checked: the walk can only
 * descend, so every cycle has to be entered through a symbolic link, and a
 * plain directory can never link back to an ancestor. Directories are listed
 * with `withFileTypes`, which is what `fast-glob` does on supported Node
 * versions, so the common case does not pay for a `realpath` call at all.
 */
function createCycleSafeFileSystemAdapter(
  canReadDirectory,
  isStopped,
  skipHiddenEntries,
) {
  // Symbolic links to directories, by normalized path.
  const symlinkedDirectories = new Set()
  // Real paths of the directories that had to be checked, by normalized path.
  const realPaths = new Map()
  // `readdir` without `withFileTypes` cannot report symbolic links, and from
  // that point on every directory has to be checked.
  let canDetectSymlinks = true
  const realPathOf = (directoryPath) => {
    let realPath = realPaths.get(directoryPath)
    if (realPath === undefined) {
      try {
        // The native implementation resolves paths in a single system call,
        // which is considerably cheaper than the JavaScript fallback.
        realPath = fs.realpathSync.native(directoryPath)
      } catch {
        realPath = directoryPath
      }
      realPaths.set(directoryPath, realPath)
    }
    return realPath
  }
  const linksBackToAncestor = (directoryPath) => {
    const realPath = realPathOf(directoryPath)
    let parentPath = path.dirname(directoryPath)
    while (parentPath !== directoryPath) {
      if (realPathOf(parentPath) === realPath) {
        return true
      }
      directoryPath = parentPath
      parentPath = path.dirname(directoryPath)
    }
    return false
  }
  const isCycle = (directoryPath) => {
    const normalizedPath = path.normalize(directoryPath)
    if (canDetectSymlinks && !symlinkedDirectories.has(normalizedPath)) {
      return false
    }
    return linksBackToAncestor(normalizedPath)
  }
  const recordEntries = (directoryPath, entries) => {
    if (!Array.isArray(entries)) {
      canDetectSymlinks = false
      return
    }
    for (const entry of entries) {
      if (typeof entry === 'string') {
        canDetectSymlinks = false
        return
      }
      const dirent = entry
      if (typeof dirent?.isSymbolicLink === 'function' && dirent.isSymbolicLink()) {
        symlinkedDirectories.add(path.normalize(path.join(directoryPath, dirent.name)))
      }
    }
  }
  const filterEntries = (entries) => {
    if (!skipHiddenEntries || !Array.isArray(entries)) return entries
    return entries.filter((entry) => {
      const name = typeof entry === 'string' ? entry : entry.name
      return typeof name !== 'string' || !name.startsWith('.')
    })
  }
  return {
    readdir: (directoryPath, optionsOrCallback, callback) => {
      const options =
        typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback
      const done = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
      if (!canReadDirectory() || isCycle(directoryPath)) {
        done(null, [])
        return
      }
      const onRead = (error, entries) => {
        // A pending readdir may finish after the walker is destroyed. Do not
        // pass its entries on: fs.scandir would still stat every symbolic link.
        if (isStopped()) {
          done(null, [])
          return
        }
        if (error != null) {
          done(error)
          return
        }
        const filtered = filterEntries(entries)
        recordEntries(directoryPath, filtered)
        done(null, filtered)
      }
      if (options == null) {
        fs.readdir(directoryPath, onRead)
      } else {
        fs.readdir(directoryPath, options, onRead)
      }
    },
    readdirSync: (directoryPath, options) => {
      if (!canReadDirectory() || isCycle(directoryPath)) {
        return []
      }
      const entries = filterEntries(
        options == null
          ? fs.readdirSync(directoryPath)
          : fs.readdirSync(directoryPath, options),
      )
      recordEntries(directoryPath, entries)
      return entries
    },
  }
}
async function getFilePaths({
  globPattern,
  rootPath,
  maxItems,
  maxDirectories = MAX_DISCOVERY_DIRECTORIES,
  timeoutMs = DISCOVERY_TIMEOUT_MS,
  ignore = [],
  skipHiddenEntries = false,
  signal,
  onLimit,
}) {
  if (maxItems <= 0 || signal?.aborted) {
    return []
  }
  if (rootPath.startsWith('file://')) {
    rootPath = (0, node_url_1.fileURLToPath)(rootPath)
  }
  return new Promise((resolve, reject) => {
    const files = []
    let directoriesRead = 0
    let finished = false
    let stream
    const deadline = Date.now() + timeoutMs
    const finish = (error, limit) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      // Destroying the merged stream closes fast-glob's underlying walkers.
      stream?.destroy()
      if (limit) onLimit?.(limit)
      if (error) reject(error)
      else resolve(files)
    }
    const abort = () => finish()
    const timer = setTimeout(() => finish(undefined, 'time'), timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    const canReadDirectory = () => {
      if (finished) return false
      if (Date.now() >= deadline) {
        finish(undefined, 'time')
        return false
      }
      if (directoriesRead >= maxDirectories) {
        finish(undefined, 'directories')
        return false
      }
      directoriesRead++
      return true
    }
    try {
      stream = fastGlob.stream([globPattern], {
        absolute: true,
        onlyFiles: true,
        cwd: rootPath,
        followSymbolicLinks: true,
        fs: createCycleSafeFileSystemAdapter(
          canReadDirectory,
          () => finished,
          skipHiddenEntries,
        ),
        suppressErrors: true,
        ignore,
        concurrency: 16,
      })
      stream.on('error', (error) => finish(error))
      stream.on('end', () => finish())
      stream.on('data', (fileEntry) => {
        if (finished) return
        files.push(fileEntry.toString())
        if (files.length >= maxItems) finish()
      })
      // A synchronous adapter callback may have reached a budget while the
      // stream was being constructed.
      if (finished) stream.destroy()
    } catch (error) {
      finish(error)
    }
  })
}
//# sourceMappingURL=fs.js.map
