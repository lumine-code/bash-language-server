# Changelog

## Unreleased

- Synchronized server source, tests, and the Bash parser with upstream commit `eee772929fb300e4798f3aa55428aafa66217a54` from 2026-09-29; upstream changes remain recorded in `server/CHANGELOG.md`.
- Preserved Windows PATH and PATHEXT executable discovery, extensionless executable aliases, native absolute sourced paths, and explicit Bash invocation for command-option completion on Windows.
- Adopted upstream parser byte loading and file URI decoding, keeping the existing `globalThis.fetch` implementation available.
- Kept CLI metadata resolution aligned with the fork's single root manifest.
- Adopted upstream Vitest tests with npm, ESLint, Prettier, and server-only build and release workflows.

## 6.0.0 - 2026-08-11

- Renamed the maintained package to `@lumine-code/bash-language-server`.
- Upgraded `editorconfig` to 3.0.2, removing the vulnerable `minimatch` dependency chain.
- Added Node.js 24 support and npm-based cross-platform CI.
- Fixed Windows PATH parsing, executable discovery, and file URI handling.
- Preserved `globalThis.fetch` while initializing Tree-sitter on supported Node.js releases.
- Made Bash command-option discovery portable by invoking its helper through Bash explicitly.
- Removed the unrelated VS Code client from the server-focused fork.
