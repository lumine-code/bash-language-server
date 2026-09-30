import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TextDocument } from 'vscode-languageserver-textdocument'

export const FIXTURE_FOLDER = path.join(__dirname, './fixtures/')

function getDocument(uri: string) {
  return TextDocument.create(
    uri,
    'shellscript',
    0,
    fs.readFileSync(fileURLToPath(uri), 'utf8'),
  )
}

type FIXTURE_KEY = keyof typeof FIXTURE_URI

export const FIXTURE_URI = {
  BATS_SOURCING: pathToFileURL(path.join(FIXTURE_FOLDER, 'bats', 'sourcing.bats')).href,
  BATS_TEST_HELPER: pathToFileURL(path.join(FIXTURE_FOLDER, 'bats', 'test_helper.bash'))
    .href,
  COMMENT_DOC: pathToFileURL(path.join(FIXTURE_FOLDER, 'comment-doc-on-hover.sh')).href,
  CRASH: pathToFileURL(path.join(FIXTURE_FOLDER, 'crash.zsh')).href,
  INSTALL: pathToFileURL(path.join(FIXTURE_FOLDER, 'install.sh')).href,
  ISSUE101: pathToFileURL(path.join(FIXTURE_FOLDER, 'issue101.sh')).href,
  ISSUE206: pathToFileURL(path.join(FIXTURE_FOLDER, 'issue206.sh')).href,
  MISSING_EXTENSION: pathToFileURL(path.join(FIXTURE_FOLDER, 'extension')).href,
  EXTENSION_INC: pathToFileURL(path.join(FIXTURE_FOLDER, 'extension.inc')).href,
  MISSING_NODE: pathToFileURL(path.join(FIXTURE_FOLDER, 'missing-node.sh')).href,
  OPTIONS: pathToFileURL(path.join(FIXTURE_FOLDER, 'options.sh')).href,
  OVERRIDE_SYMBOL: pathToFileURL(
    path.join(FIXTURE_FOLDER, 'override-executable-symbol.sh'),
  ).href,
  PARSE_PROBLEMS: pathToFileURL(path.join(FIXTURE_FOLDER, 'parse-problems.sh')).href,
  SCOPE: pathToFileURL(path.join(FIXTURE_FOLDER, 'scope.sh')).href,
  SHELLCHECK_SOURCE: pathToFileURL(path.join(FIXTURE_FOLDER, 'shellcheck', 'source.sh'))
    .href,
  SHELLCHECK_SHELL_DIRECTIVE: pathToFileURL(
    path.join(FIXTURE_FOLDER, 'shellcheck', 'shell-directive.bash'),
  ).href,
  SHFMT: pathToFileURL(path.join(FIXTURE_FOLDER, 'shfmt.sh')).href,
  SOURCING: pathToFileURL(path.join(FIXTURE_FOLDER, 'sourcing.sh')).href,
  SOURCING2: pathToFileURL(path.join(FIXTURE_FOLDER, 'sourcing2.sh')).href,
  RENAMING: pathToFileURL(path.join(FIXTURE_FOLDER, 'renaming.sh')).href,
  RENAMING_READ: pathToFileURL(path.join(FIXTURE_FOLDER, 'renaming-read.sh')).href,
}

export const FIXTURE_DOCUMENT: Record<FIXTURE_KEY, TextDocument> = (
  Object.keys(FIXTURE_URI) as Array<FIXTURE_KEY>
).reduce((acc, cur: FIXTURE_KEY) => {
  acc[cur] = getDocument(FIXTURE_URI[cur])
  return acc
}, {} as any)

export const REPO_ROOT_FOLDER = path.resolve(path.join(FIXTURE_FOLDER, '../..'))

function normalizeSnapshotUri(uri: string): string {
  return uri
    .replace(pathToFileURL(REPO_ROOT_FOLDER).href, 'file://__REPO_ROOT_FOLDER__')
    .replace(REPO_ROOT_FOLDER, '__REPO_ROOT_FOLDER__')
    .replaceAll('\\', '/')
}

export function updateSnapshotUris<
  T extends Record<string, any> | Array<any> | null | undefined | void,
>(data: T): T {
  if (data != null) {
    if (Array.isArray(data)) {
      data.forEach((el) => updateSnapshotUris(el))
      return data
    }

    if (typeof data === 'object') {
      if (data.changes) {
        for (const key in data.changes) {
          data.changes[normalizeSnapshotUri(key)] = data.changes[key]
          delete data.changes[key]
        }

        return data
      }

      if (data.uri) {
        data.uri = normalizeSnapshotUri(data.uri)
      }
      Object.values(data).forEach((child) => {
        if (Array.isArray(child)) {
          child.forEach((el) => updateSnapshotUris(el))
        } else if (typeof child === 'object' && child != null) {
          updateSnapshotUris(child)
        }
      })
    }
  }

  return data
}
