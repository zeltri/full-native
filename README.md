![logo](/logo.png)

# Full Native

TypeScript toolchain for Node.js — files, folders, processes, shell sessions, environment variables, and promise utilities with a clean, object-oriented API for stateful resources and functional utilities for the rest.

[![npm](https://img.shields.io/npm/v/fullnative.svg)](https://www.npmjs.com/package/fullnative)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Why

Node's built-in modules are powerful but verbose. `fullnative` wraps them in simple objects that are pleasant to use in scripts, CLIs, and build tools — no callbacks, no boilerplate, just objects.

- **Zero dependencies** — uses only Node.js built-ins (`fs`, `child_process`, `crypto`, `util.parseEnv`)
- **Fully typed** — ships with `.d.ts` declarations for every module
- **Object-oriented for stateful resources** (`File`, `Folder`, `Process`, `Shell` are classes you instantiate and chain), **functional utilities for the rest** (`env` and `utils` modules are plain functions)
- **Immutable movement semantics** — `moveTo()`, `moveInto()` and `rename()` return a **new** instance pointing at the new path, like `copyTo()`; the original instance never mutates (`File`, `Folder`)
- **Node.js >= 20.12** — takes advantage of native `util.parseEnv` for `.env` parsing
- **ESM only** — ships as `"type": "module"` with `import`/`export`. No CJS support.

## Install

```bash
npm install fullnative
# or
pnpm add fullnative
# or
yarn add fullnative
```

> **Upgrading from 0.x?** 1.0 is the first stable release and ships intentional breaking changes (immutable `moveTo()`/`rename()`, `Result.lines` split semantics, removed `ShellConfig.shell`). See [MIGRATION.md](./MIGRATION.md) for a step-by-step guide.

## Quick start

```ts
import { File, Folder, Process, Shell, load, sleep, tempDir } from "fullnative";

// Load .env variables with ${VAR} interpolation
const applied = await load();   // record of the variables actually applied

// Work with files
const config = new File("./config.json");
await config.writeJson({ port: 3000 });

// Run commands
const proc = new Process();
const result = await proc.run("git", "log", "--oneline");
console.log(result.stdout);

// Promise utilities: auto-cleaned temp dir + readable pause
const tmp = await tempDir();
await tmp.file("scratch.txt").write("working...");
await sleep(500);
```

---

## Table of Contents

- [File](#file)
- [Folder](#folder)
- [Process](#process)
- [Command](#command-immutable-builder)
- [LiveProcess](#liveprocess-interactive-handle)
- [Result](#result-finished-command)
- [ProcessError](#processerror)
- [Shell](#shell)
- [Job](#job)
- [env](#env)
- [utils](#utils)
- [API Reference](#api-reference)
- [Migration guide](./MIGRATION.md)
- [Requirements](#requirements)
- [Roadmap](#roadmap)

---

## File

Represents a single file on disk. All operations are lazy — they read/write only when invoked.

```ts
import { File } from "fullnative";

const file = new File("./data.txt");

// Read & write
await file.write("hello world");
const text = await file.read();           // "hello world"

// JSON
const cfg = new File("./config.json");
await cfg.writeJson({ port: 3000, host: "0.0.0.0" });
const { port, host } = await cfg.readJson<{ port: number; host: string }>();

// Append & prepend
await file.append("\nsecond line");
await file.prepend("first line\n");

// Replace (first match) and replaceMany (multiple in sequence)
await file.replace("old", "new");
await file.replaceMany([
  { search: "v1", replacement: "v2" },
  { search: "alpha", replacement: "beta" },
]);

// Hash & compare
const hash = await file.hash("sha256");
const same = await file.equals(new File("./other.txt"));
const matches = await file.contentEquals("exact content");

// Copy & move return a NEW instance; the original never mutates
const copy = await file.copyTo("./backup/data.txt");   // new File at "./backup/data.txt"
const moved = await file.moveTo("./archive/data.txt");  // new File at "./archive/data.txt"
const renamed = await file.rename("renamed.txt");       // new File at "./archive/renamed.txt"
const tucked = await file.moveInto("./archive");        // new File at "./archive/data.txt" (keeps name)

// file.path is still "./data.txt" — only the returned instances point elsewhere

// Streams
const readable = file.readStream();   // Readable stream
const writable = file.writeStream();   // Writable stream

// Metadata
const size = await file.size();           // bytes
const empty = await file.isEmpty();       // true if 0 bytes
const exists = await file.exists();
const stat = await file.stat();            // fs.Stats
const abs = file.absolute;                 // absolute path resolved against process.cwd()

// Delete
await file.delete();  // returns true if existed
```

**Key behaviors:**
- `write()`, `append()`, `prepend()` create parent directories automatically.
- `copyTo()`, `copyInto()`, `moveTo()`, `moveInto()` and `rename()` return a **new** `File` instance; the original instance keeps its old path.
- `absolute` resolves the instance path against `process.cwd()`.

---

## Folder

Represents a directory. Supports navigation, recursive listing, streaming walks, copying, moving, and file tree visualization.

```ts
import { Folder } from "fullnative";

const project = new Folder("./my-app");

// Lifecycle
await project.ensure();                  // create if missing
await project.create();                  // mkdir -p
await project.clear();                    // empty contents
await project.delete(true);               // recursive delete (fs.rm with force)

// Navigation (returns references, doesn't check existence)
const entry: File = project.file("index.ts");
const sub: Folder = project.dir("src");
await project.hasFile("package.json");   // true/false
await project.hasDir("node_modules");    // true/false

// Listing (direct children only)
const items = await project.list();      // (File | Folder)[]
const files = await project.listFiles(); // File[]
const dirs = await project.listDirs();   // Folder[]
const tsFiles = await project.listByExt("ts");

// Recursive walk (returns arrays)
const all = await project.walk();         // everything, recursively
const allFiles = await project.walkFiles();
const allDirs = await project.walkDirs();

// Streaming walk (async generators — memory-efficient for large trees)
for await (const item of project.walkIter()) {
  console.log(item.path);
}
for await (const f of project.walkFilesIter()) {
  console.log(f.name);
}

// Search
const found = await project.find("index.ts");         // File | undefined
const subdir = await project.findDir("components");   // Folder | undefined
const matched = await project.matchFiles(/\.test\.ts$/); // File[]

// Create inside
const newFile = await project.createFile("note.txt", "hello");
const newDir = await project.createDir("utils");

// Copy & move return a NEW instance; the original never mutates
const copy = await project.copyTo("./backup/my-app");   // new Folder at "./backup/my-app"
const moved = await project.moveTo("./archive/my-app");  // new Folder at "./archive/my-app"
const renamed = await project.rename("renamed-app");     // new Folder at "./renamed-app"
const tucked = await project.moveInto("./archive");      // new Folder at "./archive/my-app" (keeps name)

// project.path is still "./my-app" — only the returned instances point elsewhere

// Tree visualization
const tree = await project.tree();
console.log(tree);
// my-app/
// ├── index.ts
// ├── src/
// │   └── utils.ts
// └── package.json
```

---

## Process

Facade for executing native commands with a comfortable API.

```ts
import { Process } from "fullnative";

const proc = new Process();

// Simple execution
const result = await proc.run("git", "log", "--oneline");
console.log(result.stdout);      // captured output
console.log(result.ok);           // true if exitCode === 0
console.log(result.exitCode);     // 0
console.log(result.lines);        // stdout split into lines (includes empty lines)
console.log(result.nonEmptyLines); // stdout split into lines (empty lines filtered)
console.log(result.durationMs);   // execution time in ms

// Get stdout only (trimmed)
const branch = await proc.output("git", "rev-parse", "--abbrev-ref", "HEAD");

// Shell-interpreted execution
const r = await proc.shell("echo hello && ls -la");

// Check if a binary exists
if (await proc.exists("docker")) {
  await proc.run("docker", "compose", "up", "-d");
}

// Resolve binary path
const nodePath = await proc.which("node");  // "/usr/local/bin/node" | null
```

### Command (immutable builder)

Build a command fluently before executing it. Each method returns a **new** `Command`.

```ts
const cmd = proc
  .cmd("npm")
  .withArgs("test", "--coverage")
  .in("/my/project")                        // set cwd
  .withEnv({ CI: "true" })                  // merge env vars
  .withTimeout(30000)                       // kill after 30s
  .withAbort(controller.signal)              // kill with SIGTERM when the signal aborts
  .withInput("stdin data\n")                 // pipe to stdin
  .throwOnError();                           // reject on non-zero exit

const result = await cmd.run();              // execute, returns Result
const out = await cmd.output();              // stdout.trim()
const handle = cmd.spawn();                  // returns LiveProcess
```

`withAbort(signal)` associates an `AbortSignal` with the command — the same primitive used by `fetch`, `fs` and timers, so it integrates with any framework that already uses `AbortController`. Notes:

- The signal is **not** passed to the native `spawn()`. On abort, the process is killed with `SIGTERM`, the `LiveProcess` ends with `stopped === true`, and `wait()` resolves with a normal `Result` — it never rejects with an `AbortError`.
- `withTimeout(ms)` kills the process with `SIGTERM` after the deadline, exactly like before.

### LiveProcess (interactive handle)

A running process you can interact with in real time.

```ts
const repl = proc.spawn("node", "-i");

// Send input
repl.sendLine("1 + 1");
repl.sendLine("process.exit()");
repl.endInput();

// Read output
repl.onStdout((chunk) => process.stdout.write(chunk));
repl.onStderr((chunk) => process.stderr.write(chunk));
repl.onOutput((chunk) => console.log(chunk.toString()));  // stdout + stderr combined

// Lifecycle
console.log(repl.running);    // true
console.log(repl.pid);        // number
console.log(repl.elapsed);    // ms since start (live)

const result = await repl.wait();  // blocks until exit, returns Result
console.log(repl.stopped);    // true if killed (vs natural exit)
console.log(repl.exitCode);   // 0
console.log(repl.signal);     // null | "SIGTERM" | ...

// Kill
repl.kill("SIGTERM");
repl.forceKill();  // SIGKILL
```

### Result (finished command)

Immutable result of a completed command.

```ts
const result = await proc.run("node", "-e", "console.log(JSON.stringify({ok:true}))");

result.stdout;      // '{"ok":true}\n'
result.stderr;      // ''
result.exitCode;     // 0
result.ok;           // true
result.failed;       // false
result.output;       // stdout + stderr, trimmed
result.lines;        // ['{"ok":true}', ''] — plain split, includes the empty trailing line
result.nonEmptyLines; // ['{"ok":true}'] — empty lines filtered out
result.durationMs;   // 12
result.json();       // { ok: true } — parses stdout as JSON
result.json<{ ok: boolean }>();  // typed

// Throw on failure
result.throwIfFailed();  // throws ProcessError if exitCode !== 0, returns this if ok
```

`lines` is a plain `String.split(/\r?\n/)` of stdout, so it includes empty lines — an output that ends with a newline produces a final empty line. For the old filtered behavior, use `nonEmptyLines`.

---

## ProcessError

Structured error thrown by `throwIfFailed()`, `throwOnError()`, and `wait()` on spawn failure.

```ts
import { Process, ProcessError } from "fullnative";

const proc = new Process();

try {
  const result = await proc.run("npm", "run", "build");
  result.throwIfFailed();
} catch (err) {
  if (err instanceof ProcessError) {
    err.command;    // "npm"
    err.args;      // ["run", "build"]
    err.kind;      // "exit" (non-zero exit) | "spawn" (failed to start)
    err.exitCode;  // 1 (or null on spawn failure)
    err.signal;    // null | "SIGTERM" | ...
    err.stderr;    // captured stderr output
    err.cause;     // original Error (on spawn failure)
  }
}
```

The `kind` field distinguishes between:
- `"exit"` — the process started and exited with a non-zero code.
- `"spawn"` — the process couldn't even start (e.g. ENOENT, permission denied).

---

## Shell

A shell session with state (cwd, env, aliases, history) that delegates to `Process` internally.

The config object accepts only `cwd` and `env` — the shell binary itself is chosen internally (`/bin/sh` on Unix, `cmd.exe` on Windows), so there is nothing to configure.

```ts
import { Shell } from "fullnative";

const sh = new Shell({ cwd: "/my/project" });

// Run shell scripts
const result = await sh.run("npm install && npm run build");
console.log(result.ok);

// Change directory
sh.cd("./src");            // relative paths resolve against the session cwd
sh.cd("/other/project");   // absolute paths are adopted as-is
console.log(sh.cwd);  // "/my/project/src"

// Environment variables
sh.set("NODE_ENV", "production");
sh.unset("NODE_ENV");

// Aliases
sh.alias("deploy", "npm run deploy");
const r = await sh.run("deploy");  // runs "npm run deploy"
sh.unalias("deploy");

// History
console.log(sh.history);         // [{ command, startedAt, durationMs, exitCode, ok }]
console.log(sh.lastCommand());   // HistoryItem | undefined
sh.clearHistory();
```

#### `$` — Tagged template with safe quoting

Interpolates values with automatic shell quoting. Strings with special characters are escaped; arrays expand to separate arguments.

> **Windows limitation:** the quoting style is POSIX (`sh`/`bash`), so the generated scripts are **not** safe for `cmd.exe` on Windows, where escaping rules differ.

```ts
const branch = "main";
const files = ["a.ts", "b.ts"];

await sh.$`git push origin ${branch}`;
await sh.$`echo ${files}`;       // echo a.ts b.ts
await sh.$`echo ${42}`;          // echo 42
await sh.$`echo ${"a b'c"}`;     // echo 'a b'\''c' — safely quoted
```

#### `pipe()` — Pipelines

Pipe output between commands, left to right.

```ts
const result = await sh.pipe("cat log.txt", "grep ERROR", "wc -l");
console.log(result.stdout.trim());  // error count
```

Fails visibly, never crashes the host: every hop validates that the needed `stdout`/`stdin` streams exist (clear `TypeError` if missing), and stream errors like `EPIPE` are absorbed by safe listeners — a broken pipeline resolves as a failed `Result` instead of crashing the process.

#### `chain()` — Sequential execution (stop on error)

```ts
const results = await sh.chain("npm run lint", "npm run build", "npm test");
const allOk = results.every((r) => r.ok);
```

#### `ifOk()` / `ifFail()` — Conditionals

```ts
// Run second command only if first succeeds
const r1 = await sh.ifOk("npm test", "npm run deploy");

// Run second command only if first fails
const r2 = await sh.ifFail("npm run build", "echo build failed, running fallback");
```

#### `bg()` — Background jobs

Launch long-running processes with naming, auto-restart, and a job registry.

```ts
const dev = sh.bg("npm run dev", { name: "dev" });
dev.onOutput((chunk) => process.stdout.write(chunk));

const server = sh.bg("npm run serve", {
  name: "server",
  autoRestart: true,
});
server.onRestart((job) => console.log(`Restarted (${job.restartCount}x)`));

// Inspect running jobs
console.log(sh.activeJobs.map((j) => j.name));  // ["dev", "server"]
console.log(sh.jobs.get("dev"));                // Job | undefined
console.log(sh.job("server"));                  // Job | undefined

// Wait for a job to finish
const result = await dev.result();

// Kill all background jobs
sh.killAll();
```

### Job

A background process managed by a `Shell` session.

```ts
const job = sh.bg("npm run dev", { name: "dev", autoRestart: true });

job.name;            // "dev"
job.script;          // "npm run dev"
job.autoRestart;     // true
job.restartCount;    // 0 (increments on each restart)
job.pid;             // number
job.running;         // boolean
job.ended;           // boolean
job.stopped;         // true if killed (vs natural exit)
job.elapsed;         // ms since start (live)
job.command;         // resolved command
job.exitCode;        // number | null
job.stdin;           // Writable stream
job.stdout;          // Readable stream
job.stderr;          // Readable stream

// Interaction
job.write("input data\n");
job.sendLine("command");
job.endInput();

// Callbacks
job.onStdout((chunk) => console.log(chunk.toString()));
job.onStderr((chunk) => console.error(chunk.toString()));
job.onOutput((chunk) => console.log(chunk.toString()));
job.onExit((result) => console.log("exited", result.exitCode));
job.onRestart((j) => console.log("restarted", j.restartCount));

// Lifecycle
const result = await job.wait();  // blocks until exit
await job.result();               // same as wait(), returns Result
job.kill("SIGTERM");
job.forceKill();
```

---

## env

Load `.env` files with `${VAR}` interpolation using Node's native `util.parseEnv`.

```ts
import { load, get, requireEnv } from "fullnative";

// Load .env (default path: ".env")
const applied = await load();
// applied: Record<string, string> — variables actually applied by this call

// Load a specific file
await load("./.env.production");

// Options object: path + override
await load({ path: "./.env.production", override: true });

// Get a variable
const port = get("PORT");              // string | undefined
const host = get("HOST", "localhost");  // string (fallback)
const key = requireEnv("API_KEY");      // string — throws if missing
```

**Behavior:**
- Accepts `string | { path?: string; override?: boolean }` (`LoadOptions`). With no argument, loads `".env"`.
- Returns `Promise<Record<string, string>>` with the variables **actually applied**: in normal mode only the keys that weren't already in `process.env`; with `override: true`, every resolved variable.
- Parses with `util.parseEnv` (handles quotes, comments, multiline values).
- Interpolates `${VAR}` references across multiple passes (resolves chains like `A=${B}`, `B=${C}`, `C=value`).
- Circular references (`A=${B}`, `B=${A}`) are cut off after 5 passes — no infinite loops.
- Default merge semantics unchanged: variables already set in `process.env` are **never overwritten** — the real environment always wins. Use `override: true` to let the file win.
- `requireEnv("KEY")` throws `Error` with the key name if the variable is missing.
- **`load()` rejects if the file doesn't exist** — wrap in try/catch if you want optional loading. There is no silent mode.

---

## utils

Functional utilities for the patterns that show up in every serious automation: pausing, deadlines, and disposable temp directories.

```ts
import { sleep, timeout, TimeoutError, tempDir, TempDir } from "fullnative";

// sleep(ms) — readable pause, always resolves (even with ms <= 0)
await sleep(200);   // wait 200ms before continuing

// timeout(promise, ms, message?) — deadline for ANY promise
const data = await timeout(fetchJSON("/api/data"), 5000);
// rejects with TimeoutError if fetchJSON takes longer than 5s

try {
  await timeout(slowTask(), 1_000);
} catch (err) {
  if (err instanceof TimeoutError) {
    // distinguish deadlines from real failures — decide: retry or abort
  }
}
// Default message: "Operation timed out after {ms}ms"; custom message supported

// tempDir() — disposable temp directory (fs.mkdtemp under os.tmpdir())
const tmp = await tempDir();                    // TempDir (extends Folder), prefix "fullnative-"
const mine = await tempDir({ prefix: "myapp-" });

await tmp.file("scratch.txt").write("hello");   // full Folder API inherited
console.log(tmp.path);                          // unique absolute path

await tmp.dispose();  // removes it now (fs.rm recursive + force), idempotent
// Without dispose(): if keep !== true, the directory is auto-removed
// via a single process "exit" hook — one listener total for all temp dirs

// keep: true — no auto-cleanup; removal is your responsibility
const persistent = await tempDir({ keep: true });
```

**Behavior:**
- `sleep(ms)` resolves to `void`; it never rejects.
- `timeout()` cleans up its timer (`clearTimeout` via `finally`) when the underlying promise wins the race, and never produces unhandled rejections from late rejections of the wrapped promise.
- `TempDir` extends `Folder`, so it inherits the entire directory API (`list`, `createFile`, `walk`, ...).
- `dispose()` is idempotent: it removes the directory and takes the path out of the auto-cleanup registry, so there is no double delete attempt at exit.
- Auto-cleanup uses **one** global `process.once("exit")` hook registered once per process — never one listener per temp directory.

---

## API Reference

| Class / Function | Description |
|---|---|
| `File` | File operations: read, write, JSON, hash, streams, copy, move, rename, replace, permissions, truncate, touch, absolute |
| `Folder` | Directory operations: list, walk, walkIter, walkFilesIter, tree, find, matchFiles, watch, copy, move, rename |
| `Process` | Execute native commands: run, output, shell, spawn, spawnScript, exists, which |
| `Command` | Immutable builder: withArgs, in, withEnv, withTimeout, withAbort, withInput, throwOnError |
| `LiveProcess` | Running process: stdin/stdout/stderr, kill, forceKill, wait, onOutput, elapsed, stopped |
| `Result` | Finished command: stdout, stderr, output, lines, nonEmptyLines, json, ok, failed, throwIfFailed |
| `ProcessError` | Structured error: command, args, kind, exitCode, signal, stderr, cause |
| `Shell` | Shell session: run, $, pipe, chain, ifOk, ifFail, bg, cd, set/unset, alias, history, killAll |
| `Job` | Background process: name, autoRestart, restartCount, onRestart, kill, wait, result |
| `load` | Load `.env` file with `${VAR}` interpolation — accepts `string` or `LoadOptions`, returns the variables applied, rejects if file missing |
| `get` | Get env var with optional fallback |
| `requireEnv` | Get env var or throw if missing |
| `sleep` | Promise-based pause for `ms` milliseconds |
| `timeout` | Race any promise against a deadline — rejects with `TimeoutError` |
| `TimeoutError` | Error thrown when a `timeout()` deadline expires |
| `tempDir` | Create a unique temp directory (`TempDir`) with optional auto-cleanup at process exit |
| `TempDir` | Temp directory class extending `Folder`, with `dispose()` |

## Requirements

- **Node.js >= 20.12** (requires `util.parseEnv`)
- **ESM only** — no CJS support. Use `import`/`export` in your project.
- **Zero runtime dependencies**

## Development

```bash
pnpm install
pnpm test          # run 172 tests
pnpm run typecheck # type check
pnpm run build     # compile to dist/
```

## Roadmap

Planned for future releases:

- **`waitFor(fn, opts)`** — poll until a condition is met
- **`retry(fn, opts)`** — retry with backoff strategies
- **`onShutdown(fn)`** — register graceful shutdown handlers (SIGINT/SIGTERM)
- **Windows-safe quoting for `$`** — cmd.exe-specific escaping (POSIX quoting documented above)
- **Dual CJS/ESM support** — if there's demand from legacy projects

## License

MIT © [Zeltri](https://github.com/zeltri)