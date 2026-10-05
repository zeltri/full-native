# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-05

First stable release. The public API is now frozen: from here on, breaking changes require a major version.

### Breaking changes

- **`File.moveTo`, `File.moveInto`, `File.rename`, `Folder.moveTo`, `Folder.moveInto`, `Folder.rename` no longer mutate the instance.** They move/rename the file or folder on disk and return a **new** instance (`Promise<File>` / `Promise<Folder>`) pointing at the new path; the original instance keeps its old path. This unifies their semantics with `copyTo`/`copyInto`, which already returned new instances, and removes the aliasing bugs caused by silent `this.path` mutation. (`File.moveTo`/`rename` returned `this`; `Folder.moveTo`/`rename` returned `this`.)
- **`Result.lines` now returns all lines** of stdout as `stdout.split(/\r?\n/)`, **including empty lines** — an output ending with a newline produces a final empty line. The previous behavior (empty lines filtered out) is still available in the new `Result.nonEmptyLines` getter.
- **`ShellConfig.shell` was removed.** It was dead configuration: the actual shell is chosen internally by the library (`/bin/sh` on Unix, `cmd.exe` on Windows). Remove the field from your `Shell` options — there is no replacement.

### Added

- `File.absolute` getter: absolute path resolved against `process.cwd()` (parity with `Folder.absolute`).
- `Result.nonEmptyLines` getter: stdout split into lines with empty lines filtered out (the pre-1.0 `lines` behavior).
- `Command.withAbort(signal)`: immutable builder method that associates an `AbortSignal` with the command. On abort the process is killed with `SIGTERM`, `LiveProcess` ends with `stopped === true`, and `wait()` resolves with a normal `Result` (never rejects with `AbortError`). The signal is deliberately not passed to the native `spawn()`, which would emit an `error` event with `AbortError`.
- `env.load()` options: accepts `string | { path?: string; override?: boolean }` (`LoadOptions`, default `".env"`). With `override: true` the file's variables overwrite existing `process.env` entries; by default the real environment always wins (unchanged semantics). The string signature `load("./file.env")` keeps working.
- `env.load()` now returns `Promise<Record<string, string>>` with the variables actually applied by the call: in normal mode only the keys that weren't already in `process.env`, with `override: true` every resolved variable.
- New `utils` module: `sleep(ms)` (promise-based pause), `timeout(promise, ms, message?)` (deadline for any promise, rejects with the new `TimeoutError` class — `name === "TimeoutError"`, default message includes the ms), and `tempDir({ prefix?, keep? })` returning a `TempDir` instance (`extends Folder`, with `dispose()`); created with `fs.mkdtemp` under `os.tmpdir()` (default prefix `"fullnative-"`), auto-removed at process exit via a single global `exit` hook unless `keep: true`. Types `LoadOptions` and `TempDirOptions` are exported.

### Fixed

- `Folder.delete(recursive)` uses `fs.rm(path, { recursive, force: true })` instead of the deprecated `fs.rmdir` (`DEP0147`, deprecated since Node 22 and slated for removal). Return semantics unchanged: `true` if it existed and was deleted.
- `Folder.tree()` rendering: subdirectories were painted twice, indentation was duplicated after each level, and non-last-child directories were forced to the `└──` connector. Now every entry is rendered exactly once, with correct `├──`/`└──` connectors and child prefixes `│   ` (not-last) / `    ` (last).
- `Shell.cd(target)` resolves relative paths against the session's current cwd (`path.resolve`) and adopts absolute paths as-is. Before, the literal string was stored, producing a silently invalid `cwd` that exploded later on the first command.
- `Shell.pipe()` hardened: validates that `stdout`/`stdin` exist at every hop (clear `TypeError` when missing) and attaches safe error listeners to piped streams so stream errors (`EPIPE`, e.g. when an intermediate command dies) resolve as a failed `Result` instead of crashing the host process with unhandled errors.

### Documented

- The `$` tagged template generates POSIX-style quoting (`sh`/`bash`), which is **not** safe for `cmd.exe` on Windows. Windows-safe quoting is a future feature.

## [0.1.0] - 2026-08-14

### Added

- `File` class: read, write, JSON, hash, streams, copy, move, rename, replace, replaceMany, permissions, truncate, touch.
- `Folder` class: list, walk, walkIter, walkFilesIter, tree, find, matchFiles, watch, copy, move, rename, create, delete, clear.
- `Process` facade: run, output, shell, spawn, spawnWith, spawnScript, exists, which.
- `Command` builder: withArgs, in, withEnv, withTimeout, withInput, throwOnError, run, output, spawn.
- `LiveProcess` handle: stdin/stdout/stderr, kill, forceKill, wait, onOutput, onStdout, onStderr, onExit, elapsed, stopped.
- `Result` class: stdout, stderr, output, lines, json, ok, failed, exitCode, signal, throwIfFailed.
- `ProcessError` class: structured error with command, args, kind, exitCode, signal, stderr, cause.
- `Shell` session: run, $ tagged template, pipe, chain, ifOk, ifFail, bg, jobs registry, killAll, cd, set/unset, alias/unalias, history.
- `Job` class: name, autoRestart, restartCount, onRestart, kill, wait, result, full LiveProcess forwarding.
- `env` module: load (with `${VAR}` interpolation via `util.parseEnv`), get, requireEnv.
- 150 tests covering all modules.
- JSDoc in Spanish across all public APIs.