#!/usr/bin/env node
'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.runCli = runCli
exports.listen = listen
const LSP = require('vscode-languageserver/node')
const server_1 = require('./server')
const logger_1 = require('./util/logger')
const packageJson = require('../../package')
const repositoryUrl =
  typeof packageJson.repository === 'string'
    ? packageJson.repository
    : packageJson.repository.url
const PADDING = 38
const commandsAndFlags = {
  start: 'Start listening on stdin/stdout',
  '-h, --help': 'Display this help and exit',
  '-v, --version': 'Print the version and exit',
}
function printHelp() {
  console.log(`Usage:
${Object.entries(commandsAndFlags)
  .map(
    ([k, description]) =>
      `  ${`bash-language-server ${k}`.padEnd(PADDING)} ${description}`,
  )
  .join('\n')}

Environment variables:
  ${logger_1.LOG_LEVEL_ENV_VAR.padEnd(PADDING)} Set the log level (default: ${logger_1.DEFAULT_LOG_LEVEL})

Further documentation: ${repositoryUrl}`)
}
function runCli() {
  const args = process.argv.slice(2)
  const start = args.find((s) => s == 'start')
  const version = args.find((s) => s == '-v' || s == '--version')
  const help = args.find((s) => s == '-h' || s == '--help')
  if (start) {
    listen()
  } else if (version) {
    console.log(packageJson.version)
  } else if (help) {
    printHelp()
  } else {
    if (args.length > 0) {
      console.error(`Unknown command '${args.join(' ')}'.`)
    }
    printHelp()
  }
}
function listen() {
  // Create a connection for the server.
  // The connection uses stdin/stdout for communication.
  const connection = LSP.createConnection(
    new LSP.StreamMessageReader(process.stdin),
    new LSP.StreamMessageWriter(process.stdout),
  )
  connection.onInitialize(async (params) => {
    const server = await server_1.default.initialize(connection, params)
    server.register(connection)
    return {
      capabilities: server.capabilities(),
    }
  })
  connection.listen()
}
if (require.main === module) {
  runCli()
}
//# sourceMappingURL=cli.js.map
