# Changelog

## 6.0.0 - 2026-08-11

- Renamed the maintained package to `@lumine-code/bash-language-server`.
- Upgraded `editorconfig` to 3.0.2, removing the vulnerable `minimatch` dependency chain.
- Added Node.js 24 support and npm-based cross-platform CI.
- Fixed Windows PATH parsing, executable discovery, and file URI handling.
- Preserved `globalThis.fetch` while initializing Tree-sitter on supported Node.js releases.
- Made Bash command-option discovery portable by invoking its helper through Bash explicitly.
- Removed the unrelated VS Code client from the server-focused fork.
