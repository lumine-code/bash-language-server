# bash-language-server

Bash language server maintained by lumine-code.

This is a source-maintained fork of [bash-lsp/bash-language-server](https://github.com/bash-lsp/bash-language-server). It brings an IDE-like experience to Bash scripts using the [Tree Sitter parser][tree-sitter-bash], with optional [explainshell][explainshell], [shellcheck][shellcheck], and [shfmt][shfmt] integration. The server source, parser, and tests are synchronized with [upstream commit eee7729](https://github.com/bash-lsp/bash-language-server/commit/eee772929fb300e4798f3aa55428aafa66217a54), retaining a small compatibility layer for Windows and the supported Node.js runtime.

Documentation around configuration variables can be found in [config.ts](https://github.com/lumine-code/bash-language-server/blob/master/server/src/config.ts).

## Features

- **Completion**: offers symbols, shell builtins, executable names, snippets, and command options.
- **Navigation**: finds declarations, references, and matching occurrences.
- **Symbols**: lists document and workspace symbols.
- **Rename**: prepares and applies symbol renames.
- **Diagnostics**: reports parser findings and optional ShellCheck diagnostics.
- **Quick fixes**: supplies ShellCheck fixes through LSP code actions.
- **Formatting**: formats scripts with optional shfmt and EditorConfig settings.
- **Hover**: shows symbol comments and command documentation, with optional explainshell integration.

## Installation

The [ide-bash][ide-bash] adapter supplies this server as an immutable Git dependency. The fork has no published npm release yet. To run it independently, install and build a source checkout:

```sh
npm ci --ignore-scripts
npm run build
node server/out/cli.js --help
```

To expose the `bash-language-server` command for another LSP client, link the built checkout:

```sh
npm link
```

Start the server over standard input and output with:

```sh
bash-language-server start
```

Node.js 24 or newer is required.

### Optional tools

Install [ShellCheck][shellcheck] to enable linting. When it is available, bash-language-server calls it after each debounced document update.

Install [shfmt][shfmt] for document formatting. Editors can invoke it explicitly or on save.

On Windows, executable completion reads the platform PATH separator and PATHEXT extensions, and treats extensionless names such as `git` as aliases for discovered executables such as `git.exe`. Command-option completion uses Bash explicitly; install Bash on PATH to enable that optional feature. Missing documentation or completion tools leave the rest of the server available.

### Clients

The following editors and IDEs have available clients:

- Lumine ([ide-bash][ide-bash])
- Eclipse ([ShellWax](https://marketplace.eclipse.org/content/shellwax))
- Emacs ([see below](#emacs))
- [Helix](https://helix-editor.com/) (built-in support)
- JupyterLab ([jupyterlab-lsp][jupyterlab-lsp])
- Neovim ([see below](#neovim))
- Sublime Text ([LSP-bash][sublime-text-lsp])
- Vim ([see below](#vim))
- Visual Studio Code ([Bash IDE][vscode-marketplace])
- [Oni](https://github.com/onivim/oni) ([see below](#oni))

#### Vim

For Vim 8 or later install the plugin [prabirshrestha/vim-lsp][vim-lsp] and add the following configuration to `.vimrc`:

```vim
if executable('bash-language-server')
  au User lsp_setup call lsp#register_server({
        \ 'name': 'bash-language-server',
        \ 'cmd': {server_info->['bash-language-server', 'start']},
        \ 'allowlist': ['sh', 'bash'],
        \ })
endif
```

For Vim 8 or Neovim using [YouCompleteMe](https://github.com/ycm-core/YouCompleteMe), add the following to `.vimrc`:

```vim
let g:ycm_language_server =
            \ [
            \   {
            \       'name': 'bash',
            \       'cmdline': [ 'bash-language-server', 'start' ],
            \       'filetypes': [ 'sh' ],
            \   }
            \ ]
```

For Vim 8 or Neovim using [neoclide/coc.nvim][coc.nvim], according to [it's Wiki article](https://github.com/neoclide/coc.nvim/wiki/Language-servers#bash), add the following to your `coc-settings.json`:

```jsonc
  "languageserver": {
    "bash": {
      "command": "bash-language-server",
      "args": ["start"],
      "filetypes": ["sh"],
      "ignoredRootPaths": ["~"]
    }
  }
```

For Vim 8 or NeoVim using [dense-analysis/ale][vim-ale] add the following configuration to your `.vimrc`:

```vim
let g:ale_linters = {
    \ 'sh': ['language_server'],
    \ }
```

For Vim8/NeoVim v0.5 using [jayli/vim-easycomplete](https://github.com/jayli/vim-easycomplete). Execute `:InstallLspServer sh` and config nothing. Maybe it's the easiest way to use bash-language-server in vim/nvim.

#### Neovim

For Neovim 0.11+ with [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig)

```lua
vim.lsp.enable 'bashls'
```

For Neovim 0.11+ without plugins

```lua
vim.lsp.config.bashls = {
  cmd = { 'bash-language-server', 'start' },
  filetypes = { 'bash', 'sh' }
}
vim.lsp.enable 'bashls'
```

For Neovim 0.10 or lower with [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig)

```lua
require 'lspconfig'.bashls.setup {}
```

#### Oni

On the config file (`File -> Preferences -> Edit Oni config`) add the following configuration:

```javascript
"language.bash.languageServer.command": "bash-language-server",
"language.bash.languageServer.arguments": ["start"],
```

#### Emacs

[Lsp-mode](https://github.com/emacs-lsp/lsp-mode) has a built-in client, can be installed by `use-package`. Add the configuration to your `.emacs.d/init.el`

```emacs-lisp
(use-package lsp-mode
  :commands lsp
  :hook
  (sh-mode . lsp))
```

Using the built-in `eglot` lsp mode:

```emacs-lisp
(use-package eglot
  :config
  (add-to-list 'eglot-server-programs '((sh-mode bash-ts-mode) . ("bash-language-server" "start")))

  :hook
  (sh-mode . eglot-ensure)
  (bash-ts-mode . eglot-ensure))
```

## `shfmt` integration

The indentation used by `shfmt` is whatever has been configured for the current editor session, so there is no `shfmt`-specific configuration variable for this. If your editor is configured for two-space indents then that's what it will use. If you're using tabs for indentation then `shfmt` will use that.

The `shfmt` integration also supports configuration via `.editorconfig`. If any `shfmt`-specific configuration properties are found in `.editorconfig` then the config in `.editorconfig` will be used and the language server config will be ignored. This follows `shfmt`'s approach of using either `.editorconfig` or command line flags, but not both. Note that only `shfmt`-specific configuration properties are read from `.editorconfig` - indentation preferences are still provided by the editor, so to format using the indentation specified in `.editorconfig` make sure your editor is also configured to read `.editorconfig`. It is possible to disable `.editorconfig` support and always use the language server config by setting the "Ignore Editorconfig" configuration variable.

## Logging

The minimum logging level for the server can be adjusted using the `BASH_IDE_LOG_LEVEL` environment variable and through the general [workspace configuration](https://github.com/lumine-code/bash-language-server/blob/master/server/src/config.ts).

## Development Guide

See the [development guide][dev-guide] for source layout, npm workflows, portable tests, and testing through the editor. The [release guide](docs/releasing.md) describes the fork's single-package release process.

[tree-sitter]: https://github.com/tree-sitter/tree-sitter
[tree-sitter-bash]: https://github.com/tree-sitter/tree-sitter-bash
[vscode-marketplace]: https://marketplace.visualstudio.com/items?itemName=mads-hartmann.bash-ide-vscode
[dev-guide]: docs/development-guide.md
[ide-bash]: https://github.com/lumine-code/ide-bash
[sublime-text-lsp]: https://packagecontrol.io/packages/LSP-bash
[explainshell]: https://explainshell.com/
[shellcheck]: https://www.shellcheck.net/
[shfmt]: https://github.com/mvdan/sh#shfmt
[languageclient-neovim]: https://github.com/autozimu/LanguageClient-neovim
[nvim-lspconfig]: https://github.com/neovim/nvim-lspconfig
[vim-lsp]: https://github.com/prabirshrestha/vim-lsp
[vim-ale]: https://github.com/dense-analysis/ale
[coc.nvim]: https://github.com/neoclide/coc.nvim
[jupyterlab-lsp]: https://github.com/krassowski/jupyterlab-lsp

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
