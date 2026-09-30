# Releasing

This fork contains one server package, `@lumine-code/bash-language-server`, declared in the root `package.json`. It has no VS Code extension or client release. Its [GitHub releases](https://github.com/lumine-code/bash-language-server/releases) and `ci.yml` and `publish.yml` workflows belong to the fork.

## Validate the source

Run from the repository root with the full suite's external tools installed:

```sh
npm ci --ignore-scripts
npm run verify
npm audit --omit=dev --audit-level=high
```

The CI workflow checks the portable suite, lint, formatting, type checking, build, package contents, and production dependencies on Windows, macOS, and Linux. Its Linux integration job runs the complete suite with ShellCheck and shfmt available. Wait for these jobs to pass before releasing or advancing a consumer pin.

## Create a release

Choose the release version from the completed changes and update the root manifest, lockfile through npm, and `CHANGELOG.md` together. An initial `v1.0.0` release uses the existing `1.0.0` version; the version field alone does not indicate that a release has already happened. Commit the release and tag that exact commit as `vX.Y.Z`, then push the branch and tag.

Create a GitHub release for the tag. The `publish.yml` workflow runs CI before building and publishing the scoped npm package with public access and provenance. Do not use the upstream monorepo's client/server release scripts or `server-<version>` tags. Inspect the publish run and verify the published package version and contents.

## Advance a source consumer

Lumine's `ide-bash` adapter consumes the fork by immutable Git commit rather than by npm version. A validated source update therefore needs no npm release: push the server commit first, then advance the adapter's dependency pin and run npm to regenerate its lockfile. Never substitute a SHA directly into the lockfile, because its integrity and transitive dependency records belong to the previous commit.

Run the adapter's spec suite and real-window language-server matrix against the installed dependency, then push the adapter commit and verify its CI. In the Lumine workspace, `lem repin` manages dependency pin changes separately from authoring the server.
