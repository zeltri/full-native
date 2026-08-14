# fullnative

TypeScript toolchain for Node.js scripting — file system, processes, and shell sessions.

## Install

```bash
pnpm add fullnative
```

## Usage

```ts
import { File, Folder, Process, Shell } from "fullnative";

// Files
const config = new File("./config.json");
await config.writeJson({ port: 3000 });
const data = await config.readJson();

// Folders
const project = new Folder("./my-app");
await project.ensure();
const tsFiles = await project.listByExt("ts");

// Processes
const proc = new Process();
const result = await proc.run("git", "log", "--oneline");
console.log(result.stdout);

// Shell sessions
const sh = new Shell({ cwd: "/my/project" });
await sh.$`npm install`;
const tests = await sh.chain("npm run build", "npm test");
const job = sh.bg("npm run dev");
job.onStdout((c) => process.stdout.write(c));
await job.result();
```

## Development

```bash
pnpm install
pnpm test
pnpm run typecheck
pnpm run build
```

## License

MIT