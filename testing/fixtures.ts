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
  COMMENT_DOC: fixtureUri('comment-doc-on-hover.sh'),
  CRASH: fixtureUri('crash.zsh'),
  INSTALL: fixtureUri('install.sh'),
  ISSUE101: fixtureUri('issue101.sh'),
  ISSUE206: fixtureUri('issue206.sh'),
  MISSING_EXTENSION: fixtureUri('extension'),
  EXTENSION_INC: fixtureUri('extension.inc'),
  MISSING_NODE: fixtureUri('missing-node.sh'),
  OPTIONS: fixtureUri('options.sh'),
  OVERRIDE_SYMBOL: fixtureUri('override-executable-symbol.sh'),
  PARSE_PROBLEMS: fixtureUri('parse-problems.sh'),
  SCOPE: fixtureUri('scope.sh'),
  SHELLCHECK_SOURCE: fixtureUri('shellcheck', 'source.sh'),
  SHELLCHECK_SHELL_DIRECTIVE: fixtureUri('shellcheck', 'shell-directive.bash'),
  SHFMT: fixtureUri('shfmt.sh'),
  SOURCING: fixtureUri('sourcing.sh'),
  SOURCING2: fixtureUri('sourcing2.sh'),
  RENAMING: fixtureUri('renaming.sh'),
  RENAMING_READ: fixtureUri('renaming-read.sh'),
}

export const FIXTURE_DOCUMENT: Record<FIXTURE_KEY, TextDocument> = (
  Object.keys(FIXTURE_URI) as Array<FIXTURE_KEY>
).reduce((acc, cur: FIXTURE_KEY) => {
  acc[cur] = getDocument(FIXTURE_URI[cur])
  return acc
}, {} as any)

export const REPO_ROOT_FOLDER = path.resolve(path.join(FIXTURE_FOLDER, '../..'))
const REPO_ROOT_URI = pathToFileURL(REPO_ROOT_FOLDER).href.replace(/\/$/, '')

function fixtureUri(...segments: string[]): string {
  return pathToFileURL(path.join(FIXTURE_FOLDER, ...segments)).href
}

export function updateSnapshotUris<
  T extends Record<string, any> | Array<any> | null | undefined,
>(data: T): T {
  if (data != null) {
    if (Array.isArray(data)) {
      data.forEach((el) => updateSnapshotUris(el))
      return data
    }

    if (typeof data === 'object') {
      if (data.changes) {
        for (const key in data.changes) {
          data.changes[key.replace(REPO_ROOT_URI, 'file://__REPO_ROOT_FOLDER__')] =
            data.changes[key]
          delete data.changes[key]
        }

        return data
      }

      if (data.uri) {
        data.uri = data.uri.replace(REPO_ROOT_URI, 'file://__REPO_ROOT_FOLDER__')
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
