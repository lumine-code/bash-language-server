#!/usr/bin/env node
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
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
exports.runCli = runCli
exports.listen = listen
const LSP = __importStar(require('vscode-languageserver/node'))
const server_1 = __importDefault(require('./server'))
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
