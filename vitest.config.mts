import { configDefaults, defineConfig } from 'vitest/config'

const externalToolSuites = [
  'server/src/__tests__/server.test.ts',
  'server/src/shellcheck/__tests__/index.test.ts',
  'server/src/shellcheck/__tests__/code-actions.test.ts',
  'server/src/shfmt/__tests__/index.test.ts',
  'server/src/util/__tests__/sh.test.ts',
]

export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    include: ['server/src/**/__tests__/*.ts'],
    exclude: [
      ...configDefaults.exclude,
      ...(mode === 'portable' ? externalToolSuites : []),
    ],
    clearMocks: true,
    // Keep integration tests from competing for subprocesses and fixture files.
    fileParallelism: false,
    sequence: { hooks: 'list' },
    coverage: {
      provider: 'v8',
      include: ['server/src/**/*.ts'],
      exclude: ['**/__tests__/**', '**/*.d.ts'],
      reporter: ['text-summary', 'lcov', 'html'],
    },
  },
}))
