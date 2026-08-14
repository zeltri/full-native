# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- `env` module: load (with `${VAR}` interpolation via `util.parseEnv`), get, require.
- 150 tests covering all modules.
- JSDoc in Spanish across all public APIs.