import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TextDocument } from 'vscode-languageserver-textdocument'

import { getMockConnection } from '../../../testing/mocks'
import LspServer from '../server'
import * as sh from '../util/sh'

it('looks up documentation for commands invoked by absolute path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bash-lsp-absolute-command-'))
  const command = join(
    directory,
    process.platform === 'win32' ? 'test.cmd' : 'test',
  ).replaceAll('\\', '/')
  const missingCommand = join(directory, 'does-not-exist', 'test').replaceAll('\\', '/')
  await writeFile(command, '#!/bin/sh\n', { mode: 0o755 })
  const documentation = vi
    .spyOn(sh, 'getShellDocumentation')
    .mockResolvedValue('test manual')
  try {
    const connection = getMockConnection()
    const server = await LspServer.initialize(connection, {
      rootUri: null,
      processId: null,
      capabilities: {},
      initializationOptions: { shellcheckPath: '' },
    })
    server.register(connection)
    await connection.onInitialized.mock.calls[0][0]({})
    const document = TextDocument.create(
      pathToFileURL('/absolute-hover.sh').href,
      'shellscript',
      1,
      `${command} -f file\n${missingCommand}`,
    )
    await server.analyzeAndLintDocument(document)
    const hover = (line: number) =>
      connection.onHover.mock.calls[0][0](
        {
          textDocument: { uri: document.uri },
          position: { line, character: 2 },
        },
        {} as any,
        {} as any,
      )
    expect(await hover(0)).toEqual({
      contents: { kind: 'markdown', value: expect.stringContaining('test manual') },
    })
    expect(documentation).toHaveBeenCalledWith({ word: command })
    documentation.mockClear()
    expect(await hover(1)).toBeNull()
    expect(documentation).not.toHaveBeenCalled()
  } finally {
    documentation.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
})

it.skipIf(process.platform === 'win32')(
  'documents a quoted command path containing spaces',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bash-lsp tools-'))
    try {
      const command = join(directory, 'ls')
      await symlink('/bin/ls', command)
      const connection = getMockConnection()
      const server = await LspServer.initialize(connection, {
        rootUri: null,
        processId: null,
        capabilities: {},
      })
      server.register(connection)
      const document = TextDocument.create(
        pathToFileURL('/quoted-command.sh').href,
        'shellscript',
        1,
        `"${command}"`,
      )
      await server.analyzeAndLintDocument(document)
      const result = await connection.onHover.mock.calls[0][0](
        { textDocument: { uri: document.uri }, position: { line: 0, character: 3 } },
        {} as any,
        {} as any,
      )
      expect(result).toEqual({
        contents: {
          kind: 'markdown',
          value: expect.stringContaining('list directory contents'),
        },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)
