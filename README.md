# fullnative

TypeScript toolchain for Node.js scripting — files, folders, processes, and shell sessions with a clean, object-oriented API.

## Why

Node's built-in modules are powerful but verbose. `fullnative` wraps them in simple objects that are pleasant to use in scripts, CLIs, and build tools — no callbacks, no boilerplate, just objects.

## Install

```bash
pnpm add fullnative
```

## Quick start

```ts
import { File, Folder, Process, Shell } from "fullnative";
```

### File

```ts
const config = new File("./config.json");

await config.writeJson({ port: 3000 });
const { port } = await config.readJson<{ port: number }>();

await config.replace("v1.0.0", "v2.0.0");
const hash = await config.hash("sha256");
await config.copyTo("./backup/config.json");
```

### Folder

```ts
const project = new Folder("./my-app");
await project.ensure();

const tsFiles = await project.listByExt("ts");
const entry = await project.find("index.ts");
const tree = await project.tree(); // ASCII tree visualization
await project.copyTo("./backup/my-app");
```

### Process

```ts
const proc = new Process();

const result = await proc.run("git", "log", "--oneline");
console.log(result.stdout);
console.log(result.ok);     // true if exitCode === 0
console.log(result.lines);  // stdout split into lines

// Builder API
const out = await proc
  .cmd("git")
  .withArgs("rev-parse", "--abbrev-ref", "HEAD")
  .in("/my/repo")
  .output();

// Interactive
const node = proc.spawn("node", "-i");
node.sendLine("1 + 1");
node.endInput();
const res = await node.wait();

// Check if a binary exists
if (await proc.exists("docker")) {
  await proc.run("docker", "compose", "up", "-d");
}
```

### Shell

```ts
const sh = new Shell({ cwd: "/my/project" });

// Run shell scripts
await sh.run("npm install && npm run build");

// Tagged template with safe quoting
const branch = "main";
await sh.$`git push origin ${branch}`;

// Pipeline
const errors = await sh.pipe("cat log.txt", "grep ERROR", "wc -l");

// Chain (stop on error)
const results = await sh.chain("npm run lint", "npm run build", "npm test");
const allOk = results.every((r) => r.ok);

// Conditionals
await sh.ifOk("npm test", "npm run deploy");
```

### Background jobs

```ts
const sh = new Shell();

const dev = sh.bg("npm run dev", { name: "dev" });
dev.onOutput((chunk) => process.stdout.write(chunk));

const server = sh.bg("npm run serve", {
  name: "server",
  autoRestart: true,
});
server.onRestart((job) => console.log(`Restarted (${job.restartCount})`));

// Introspect
console.log(sh.activeJobs.map((j) => j.name));

// Clean up everything
sh.killAll();
```

### Error handling

```ts
import { ProcessError } from "fullnative";

try {
  await proc.run("npm", "run", "build").then((r) => r.throwIfFailed());
} catch (err) {
  if (err instanceof ProcessError) {
    console.log(err.command);   // "npm"
    console.log(err.kind);      // "exit" | "spawn"
    console.log(err.exitCode);  // 1
    console.log(err.stderr);    // build error output
  }
}
```

## API

| Class | Description |
|---|---|
| `File` | File operations: read, write, JSON, hash, streams, copy, move |
| `Folder` | Directory operations: list, walk, tree, find, matchFiles, watch, copy, move |
| `Process` | Execute native commands: run, spawn, shell, exists, which |
| `Command` | Immutable builder: withArgs, in, withEnv, withTimeout, withInput, throwOnError |
| `LiveProcess` | Running process: stdin/stdout/stderr, kill, wait, onOutput, elapsed, stopped |
| `Result` | Finished command: stdout, stderr, json, lines, ok, throwIfFailed |
| `Shell` | Shell session: run, $, pipe, chain, ifOk, ifFail, bg, jobs, killAll |
| `Job` | Background process: name, autoRestart, onRestart, kill, wait |
| `ProcessError` | Structured error: command, kind, exitCode, signal, stderr, cause |

## Development

```bash
pnpm install
pnpm test          # run tests
pnpm run typecheck # type check
pnpm run build     # compile to dist/
```

## License

MIT