const childProcess = require('node:child_process')

if (!process.env.npm_execpath) {
  throw new Error('verify-package must be run through npm')
}

const result = childProcess.spawnSync(
  process.execPath,
  [process.env.npm_execpath, 'pack', '--dry-run', '--json'],
  {
    encoding: 'utf8',
  },
)

if (result.status !== 0) {
  process.stderr.write(
    result.error?.stack || result.stderr || result.stdout || 'npm pack failed',
  )
  process.exit(result.status || 1)
}

const [pack] = JSON.parse(result.stdout)
const files = new Set(pack.files.map(({ path }) => path.replaceAll('\\', '/')))
const required = [
  'package.json',
  'server/out/cli.js',
  'server/out/get-options.sh',
  'server/out/server.js',
  'server/tree-sitter-bash.wasm',
]
const missing = required.filter((file) => !files.has(file))

if (missing.length) {
  throw new Error(`Packed server is missing: ${missing.join(', ')}`)
}

console.log(`Verified ${pack.entryCount} packed files, including the parser WASM.`)
