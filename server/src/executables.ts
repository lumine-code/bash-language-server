import * as fs from 'fs'
import { basename, delimiter, extname, join } from 'node:path'

import * as ArrayUtil from './util/array'
import * as FsUtil from './util/fs'

/**
 * Provides information based on the programs on your PATH
 */
export default class Executables {
  private executables: Set<string>

  private constructor(executables: string[]) {
    this.executables = new Set(executables)
  }

  /**
   * @param pathValue is expected to use the platform PATH delimiter.
   */
  public static fromPath(pathValue: string): Promise<Executables> {
    const paths = pathValue.split(delimiter)
    const promises = paths.map((x) => findExecutablesInPath(x))
    return Promise.all(promises)
      .then(ArrayUtil.flattenArray)
      .then(ArrayUtil.uniq)
      .then((executables) => new Executables(executables))
  }

  /**
   * Find all programs in your PATH
   */
  public list(): string[] {
    return Array.from(this.executables.values())
  }

  /**
   * Check if the the given {{executable}} exists on the PATH
   */
  public isExecutableOnPATH(executable: string): boolean {
    return this.executables.has(executable)
  }
}

/**
 * Only returns direct children, or the path itself if it's an executable.
 */
async function findExecutablesInPath(path: string): Promise<string[]> {
  path = FsUtil.untildify(path)

  try {
    const pathStats = await fs.promises.lstat(path)

    if (pathStats.isDirectory()) {
      const childrenPaths = await fs.promises.readdir(path)

      const files = []

      for (const childrenPath of childrenPaths) {
        try {
          const stats = await fs.promises.lstat(join(path, childrenPath))
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

function isExecutableFile(stats: fs.Stats): boolean {
  if (process.platform === 'win32') {
    return stats.isFile()
  }

  const isExecutable = !!(1 & parseInt((stats.mode & parseInt('777', 8)).toString(8)[0]))
  return stats.isFile() && isExecutable
}

function executableName(filePath: string): string {
  const name = basename(filePath)
  if (process.platform !== 'win32') {
    return name
  }

  const extension = extname(name)
  const executableExtensions = new Set(
    (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .map((value) => value.toLowerCase()),
  )
  return executableExtensions.has(extension.toLowerCase())
    ? name.slice(0, -extension.length)
    : name
}
