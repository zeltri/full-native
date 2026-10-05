# Migration guide: 0.x → 1.0

`fullnative` 1.0 is the first stable release; the public API is frozen from here on. This guide covers the three changes that can actually break your code when upgrading from 0.x, plus the additions that come along for free.

```bash
npm install fullnative@1.0.0
# or
pnpm add fullnative@1.0.0
```

---

## 1. `moveTo()` / `moveInto()` / `rename()` no longer mutate — they return a new instance

**What changed:** `File.moveTo`, `File.moveInto`, `File.rename`, `Folder.moveTo`, `Folder.moveInto` and `Folder.rename` physically move/rename the file or folder on disk (same as before), but they no longer mutate the instance or return `this`. They return a **new** instance (`Promise<File>` / `Promise<Folder>`) pointing at the new path, while the original instance keeps its old path.

This matches `copyTo()` / `copyInto()`, which already returned a new instance.

**Why:** silently mutating `this.path` made any alias of the same object desynchronize — a `File` passed to a helper could change its path without the caller knowing. Returning a new instance removes that entire class of bugs.

### Before (0.x)

```ts
const f = new File("./data.txt");

// Code that relied on mutation:
await f.moveTo("./archive/data.txt");
console.log(f.path);          // "./archive/data.txt" — mutated!
await f.rename("data.old");   // also mutated f
// `f` was the single handle to the moved file
```

### After (1.0)

```ts
const f = new File("./data.txt");

const moved = await f.moveTo("./archive/data.txt");
console.log(f.path);      // "./data.txt" — unchanged
console.log(moved.path);  // "./archive/data.txt"

const renamed = await moved.rename("data.old");
// renamed points at "./archive/data.old"; `moved` still points at "./archive/data.txt"

// Use the returned instance for everything that follows:
const contents = await moved.read();
```

### How to migrate

- **If you used the return value as `this` for chaining** (`await f.moveTo(x).rename(y)` — no; chained awaits):
  
  ```ts
  // 0.x
  await file.moveTo("./a");
  await file.rename("b");   // renamed because `file` had mutated

  // 1.0 — carry the returned instance forward
  const moved = await file.moveTo("./a");
  const renamed = await moved.rename("b");
  ```

- **If you relied on the original instance changing:** replace your old variable with the returned one, or reassign it explicitly:

  ```ts
  // Keep the same variable name if you want old code to keep working:
  file = await file.moveTo("./archive/data.txt");
  ```

The same applies to `Folder`:

```ts
const project = new Folder("./my-app");
const moved = await project.moveTo("./archive/my-app");
await moved.createFile("marker.txt", "ok");  // writes into the moved dir
```

---

## 2. `Result.lines` now includes empty lines — use `nonEmptyLines` for the old behavior

**What changed:** `Result.lines` is now the plain `String.split(/\r?\n/)` of stdout, **including empty lines**. An output that ends with `\n` — which is the common case — now produces a final empty line in the array.

The old behavior (empty lines filtered out) is still there: use the new **`Result.nonEmptyLines`** getter.

**Why:** a method named `lines` that behaves like `split` should behave like `split`. Silent filtering corrupted cases where empty lines are data (CSVs, logs, blocks separated by blank lines).

### Before (0.x)

```ts
const result = await proc.run("printf", "a\n\nb\n");
result.lines;   // ["a", "b"] — empty lines silently filtered
```

### After (1.0)

```ts
const result = await proc.run("printf", "a\n\nb\n");
result.lines;           // ["a", "", "b", ""] — plain split, including the trailing empty line
result.nonEmptyLines;   // ["a", "b"] — the old filtered behavior
```

### How to migrate

Search your code for `\.lines` on command results and decide, case by case:

- You were counting on filtered empty lines → switch to `result.nonEmptyLines` (drop-in, same array shape).
- You want raw lines (e.g. to preserve blank separators or reconstruct the exact output) → keep `result.lines`.

If you never filtered them yourself and just consumed the array, `nonEmptyLines` is almost always what you were implicitly assuming.

---

## 3. Remove `ShellConfig.shell` — it was never used

**What changed:** the `shell` field was removed from the `Shell` constructor options. It was dead configuration: `fullnative` chooses the actual shell internally (`/bin/sh` on Unix, `cmd.exe` on Windows), and no option can change that.

### Before (0.x)

```ts
// Compiled with a warning at best — the field was never respected
const sh = new Shell({ cwd: "/my/project", shell: "/bin/bash" });
```

### After (1.0)

```ts
// Just remove the field
const sh = new Shell({ cwd: "/my/project" });
```

### How to migrate

Delete the property. There is no replacement: if TypeScript was enforcing it, the build itself will point you to every occurrence. Type-checking will catch this one mechanically — `cwd` and `env` remain valid options.

---

## Non-breaking additions in the same release

Everything below is additive — no action needed:

- **`File.absolute`** — absolute path resolved against `process.cwd()` (parity with `Folder.absolute`).
- **`Result.nonEmptyLines`** — covered above; new getter, no conflicts.
- **`Command.withAbort(signal)`** — associate an `AbortSignal` with a command; on abort the process is killed with `SIGTERM`, the `LiveProcess` ends with `stopped === true`, and `wait()` resolves with a normal `Result`. The signal is deliberately not passed to the native `spawn()` to avoid a native `AbortError` rejection.
- **`load()` options and return value** — accepts `string | { path?: string; override?: boolean }` and now returns a `Promise<Record<string, string>>` with the variables actually applied. The string signature `load("./file.env")` and the default semantics (the real environment always wins) are unchanged, so existing calls keep working. Use `override: true` when you want the file to overwrite the environment.
- **New `utils` module** — `sleep(ms)`, `timeout(promise, ms, message?)` with `TimeoutError`, and `tempDir({ prefix?, keep? })` returning a `TempDir` (extends `Folder`, with `dispose()` and auto-cleanup at process exit unless `keep: true`).

### Behavioral fixes you may notice (no migration needed)

- `Folder.delete(recursive)` now uses `fs.rm` under the hood (the deprecated `fs.rmdir` is gone) — return semantics unchanged.
- `Folder.tree()` output changed: correct `├──`/`└──` connectors, no duplicated entries or indentation. If you parse tree output, re-verify your parsing.
- `Shell.cd()` resolves relative targets against the session cwd instead of storing the literal string.
- `Shell.pipe()` no longer crashes the host process on stream errors (`EPIPE`); a broken pipeline resolves as a failed `Result`.

---

## Questions

- **Do I have to change anything for `load()`?** No — the string signature still works and the default merge semantics did not change. The return value is new information you can start using (or ignore).
- **Can I keep mutating-style code by reassigning?** Yes: `file = await file.moveTo(dest)` restores the old feel at the cost of one extra assignment. We recommend holding both instances when you need the history.
- **Is `$` safe on Windows?** The quoting is POSIX-style, which is not safe for `cmd.exe`. Windows-safe quoting is on the roadmap; until then, avoid `$` in Windows scripts.