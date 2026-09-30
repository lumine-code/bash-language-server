import { expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'

const workspacePath = path.resolve('/project')
const libraryPath = path.join(workspacePath, 'libs', 'lib.sh')

import { initializeParser } from '../../parser'
import { getSourceCommands } from '../sourcing'

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
}))

it.each([
  '"${PROJECT_DIR}/libs/lib.sh"',
  '"$PROJECT_DIR/libs/lib.sh"',
  '"${PROJECT_DIR}/libs"/lib.sh',
  '"$PROJECT_DIR"/libs/lib.sh',
])('resolves a leading dynamic directory with a static suffix: %s', async (argument) => {
  const parser = await initializeParser()
  const exists = vi
    .spyOn(fs, 'existsSync')
    .mockImplementation((filePath) => filePath === libraryPath)
  try {
    const sources = getSourceCommands({
      fileUri: pathToFileURL(path.join(workspacePath, 'main.sh')).href,
      rootPath: workspacePath,
      tree: parser.parse(`PROJECT_DIR="/project"\nsource ${argument}\nhello`)!,
    })
    expect(sources.map(({ uri, error }) => ({ uri, error }))).toEqual([
      { uri: pathToFileURL(libraryPath).href, error: null },
    ])
  } finally {
    exists.mockRestore()
  }
})

it.each([
  '"${PROJECT_DIR}/${OTHER}/lib.sh"',
  '"${PROJECT_DIR}/libs"/$OTHER',
  '"prefix${PROJECT_DIR}/libs/lib.sh"',
  '"$(pwd)/libs/lib.sh"',
])('does not guess a path with additional dynamic content: %s', async (argument) => {
  const parser = await initializeParser()
  const sources = getSourceCommands({
    fileUri: pathToFileURL(path.join(workspacePath, 'main.sh')).href,
    rootPath: workspacePath,
    tree: parser.parse(`source ${argument}`)!,
  })
  expect(sources[0].uri).toBeNull()
  expect(sources[0].error).toBe('non-constant source not supported')
})
