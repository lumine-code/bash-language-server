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
exports.logger =
  exports.Logger =
  exports.DEFAULT_LOG_LEVEL =
  exports.LOG_LEVELS =
  exports.LOG_LEVEL_ENV_VAR =
    void 0
exports.setLogConnection = setLogConnection
exports.setLogLevel = setLogLevel
exports.getLogLevelFromEnvironment = getLogLevelFromEnvironment
const LSP = __importStar(require('vscode-languageserver'))
exports.LOG_LEVEL_ENV_VAR = 'BASH_IDE_LOG_LEVEL'
exports.LOG_LEVELS = ['debug', 'info', 'warning', 'error']
exports.DEFAULT_LOG_LEVEL = 'info'
const LOG_LEVELS_TO_MESSAGE_TYPES = {
  debug: LSP.MessageType.Log,
  info: LSP.MessageType.Info,
  warning: LSP.MessageType.Warning,
  error: LSP.MessageType.Error,
}
// Singleton madness to allow for logging from anywhere in the codebase
let _connection = null
let _logLevel = getLogLevelFromEnvironment()
/**
 * Set the log connection. Should be done at startup.
 */
function setLogConnection(connection) {
  _connection = connection
}
/**
 * Set the minimum log level.
 */
function setLogLevel(logLevel) {
  _logLevel = LOG_LEVELS_TO_MESSAGE_TYPES[logLevel]
}
class Logger {
  prefix
  constructor({ prefix = '' } = {}) {
    this.prefix = prefix
  }
  static MESSAGE_TYPE_TO_LOG_LEVEL_MSG = {
    [LSP.MessageType.Error]: 'ERROR ⛔️',
    [LSP.MessageType.Warning]: 'WARNING ⛔️',
    [LSP.MessageType.Info]: 'INFO',
    [LSP.MessageType.Log]: 'DEBUG',
    [LSP.MessageType.Debug]: 'DEBUG',
  }
  log(severity, messageObjects) {
    if (_logLevel < severity) {
      return
    }
    if (!_connection) {
      console.warn(`The logger's LSP Connection is not set. Dropping messages`)
      return
    }
    const formattedMessage = messageObjects
      .map((p) => {
        if (p instanceof Error) {
          return p.stack || p.message
        }
        if (typeof p === 'object') {
          return JSON.stringify(p, null, 2)
        }
        return p
      })
      .join(' ')
    const level = Logger.MESSAGE_TYPE_TO_LOG_LEVEL_MSG[severity]
    const prefix = this.prefix ? `${this.prefix} - ` : ''
    const time = new Date().toISOString().substring(11, 23)
    const message = `${time} ${level} ${prefix}${formattedMessage}`
    _connection.sendNotification(LSP.LogMessageNotification.type, {
      type: severity,
      message,
    })
  }
  debug(message, ...additionalArgs) {
    this.log(LSP.MessageType.Log, [message, ...additionalArgs])
  }
  info(message, ...additionalArgs) {
    this.log(LSP.MessageType.Info, [message, ...additionalArgs])
  }
  warn(message, ...additionalArgs) {
    this.log(LSP.MessageType.Warning, [message, ...additionalArgs])
  }
  error(message, ...additionalArgs) {
    this.log(LSP.MessageType.Error, [message, ...additionalArgs])
  }
}
exports.Logger = Logger
/**
 * Default logger.
 */
exports.logger = new Logger()
/**
 * Get the log level from the environment, before the server initializes.
 * Should only be used internally.
 */
function getLogLevelFromEnvironment() {
  const logLevelFromEnvironment = process.env[exports.LOG_LEVEL_ENV_VAR]
  if (logLevelFromEnvironment) {
    const logLevel = LOG_LEVELS_TO_MESSAGE_TYPES[logLevelFromEnvironment]
    if (logLevel) {
      return logLevel
    }
    console.warn(
      `Invalid ${exports.LOG_LEVEL_ENV_VAR} "${logLevelFromEnvironment}", expected one of: ${Object.keys(LOG_LEVELS_TO_MESSAGE_TYPES).join(', ')}`,
    )
  }
  return LOG_LEVELS_TO_MESSAGE_TYPES[exports.DEFAULT_LOG_LEVEL]
}
//# sourceMappingURL=logger.js.map
