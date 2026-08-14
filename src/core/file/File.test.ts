import { describe, it, expect } from "vitest";
import { File } from "./File.js";
import { Folder } from "./Folder.js";
import fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("File", () => {
  it("writes and reads text", async () => {
    const tmp = path.join(os.tmpdir(), `vitest-${Date.now()}.txt`);
    const file = new File(tmp);
    await file.write("hello");
    expect(await file.read()).toBe("hello");
    await file.delete();
  });

  it("writes and reads JSON", async () => {
    const tmp = path.join(os.tmpdir(), `vitest-${Date.now()}.json`);
    const file = new File(tmp);
    await file.writeJson({ ok: true });
    expect(await file.readJson()).toEqual({ ok: true });
    await file.delete();
  });
});

describe("Folder", () => {
  it("creates and lists files", async () => {
    const dirPath = path.join(os.tmpdir(), `vitest-dir-${Date.now()}`);
    const dir = new Folder(dirPath);
    await dir.ensure();
    await dir.createFile("a.txt", "a");
    await dir.createFile("b.txt", "b");
    const files = await dir.listFiles();
    expect(files.map((f) => f.name).sort()).toEqual(["a.txt", "b.txt"]);
    await dir.delete(true);
  });
});