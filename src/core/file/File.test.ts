import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { File } from "./File.js";
import { Folder } from "./Folder.js";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let TMP = "";

beforeAll(() => {
  TMP = mkdtempSync(join(tmpdir(), "vitest-file-"));
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("File", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(TMP, `test-${Math.random().toString(36).slice(2)}`);
  });

  describe("read / write", () => {
    it("writes and reads text", async () => {
      const file = new File(join(dir, "a.txt"));
      await file.write("hello");
      expect(await file.read()).toBe("hello");
    });

    it("writes and reads JSON", async () => {
      const file = new File(join(dir, "data.json"));
      await file.writeJson({ ok: true });
      expect(await file.readJson()).toEqual({ ok: true });
    });

    it("writes compact JSON when pretty=false", async () => {
      const file = new File(join(dir, "compact.json"));
      await file.writeJson({ a: 1 }, false);
      expect(await file.read()).toBe('{"a":1}');
    });

    it("writes lines", async () => {
      const file = new File(join(dir, "lines.txt"));
      await file.writeLines(["a", "b", "c"]);
      expect(await file.read()).toBe("a\nb\nc");
    });

    it("reads lines", async () => {
      const file = new File(join(dir, "readlines.txt"));
      await file.write("x\ny\nz");
      expect(await file.readLines()).toEqual(["x", "y", "z"]);
    });

    it("reads as buffer", async () => {
      const file = new File(join(dir, "buf.bin"));
      await file.write(Buffer.from([1, 2, 3]));
      expect(await file.readBuffer()).toEqual(Buffer.from([1, 2, 3]));
    });
  });

  describe("append / prepend / insertAt", () => {
    it("appends data", async () => {
      const file = new File(join(dir, "append.txt"));
      await file.write("hello");
      await file.append(" world");
      expect(await file.read()).toBe("hello world");
    });

    it("appends a line", async () => {
      const file = new File(join(dir, "appline.txt"));
      await file.write("a\n");
      await file.appendLine("b");
      expect(await file.read()).toBe("a\nb\n");
    });

    it("prepends data", async () => {
      const file = new File(join(dir, "prepend.txt"));
      await file.write("world");
      await file.prepend("hello ");
      expect(await file.read()).toBe("hello world");
    });

    it("inserts a line at index", async () => {
      const file = new File(join(dir, "insert.txt"));
      await file.writeLines(["a", "c"]);
      await file.insertAt(1, "b");
      expect(await file.readLines()).toEqual(["a", "b", "c"]);
    });
  });

  describe("replace / replaceMany", () => {
    it("replaces first occurrence", async () => {
      const file = new File(join(dir, "replace.txt"));
      await file.write("a-b-a");
      await file.replace("a", "X");
      expect(await file.read()).toBe("X-b-a");
    });

    it("replaces all occurrences with /g flag", async () => {
      const file = new File(join(dir, "replaceg.txt"));
      await file.write("a-b-a");
      await file.replace(/a/g, "X");
      expect(await file.read()).toBe("X-b-X");
    });

    it("applies multiple replacements in sequence", async () => {
      const file = new File(join(dir, "replaceMany.txt"));
      await file.write("hello world");
      await file.replaceMany([
        { search: "hello", replacement: "hi" },
        { search: "world", replacement: "earth" },
      ]);
      expect(await file.read()).toBe("hi earth");
    });
  });

  describe("metadata", () => {
    it("reports size and isEmpty", async () => {
      const file = new File(join(dir, "meta.txt"));
      await file.write("12345");
      expect(await file.size()).toBe(5);
      expect(await file.isEmpty()).toBe(false);
    });

    it("isEmpty is true for empty file", async () => {
      const file = new File(join(dir, "empty.txt"));
      await file.write("");
      expect(await file.isEmpty()).toBe(true);
    });

    it("exists returns false for missing file", async () => {
      const file = new File(join(dir, "nope.txt"));
      expect(await file.exists()).toBe(false);
    });

    it("touch creates empty file", async () => {
      const file = new File(join(dir, "touched.txt"));
      await file.touch();
      expect(await file.exists()).toBe(true);
      expect(await file.isEmpty()).toBe(true);
    });
  });

  describe("getters", () => {
    it("exposes name, baseName, ext, dirname", () => {
      const file = new File(join(dir, "script.ts"));
      expect(file.name).toBe("script.ts");
      expect(file.baseName).toBe("script");
      expect(file.ext).toBe("ts");
      expect(file.dirname).toBe(dir);
    });

    it("absolute resolves relative paths", () => {
      const file = new File("relative/f.txt");
      expect(file.absolute).toBe(resolve("relative", "f.txt"));
    });

    it("infers mimeType", () => {
      expect(new File(join(dir, "a.json")).mimeType).toBe("application/json");
      expect(new File(join(dir, "a.unknown")).mimeType).toBe(
        "application/octet-stream",
      );
    });
  });

  describe("hash / equals / contentEquals", () => {
    it("computes sha256 hash", async () => {
      const file = new File(join(dir, "hash.txt"));
      await file.write("hello");
      const hash = await file.hash();
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("equals returns true for same content", async () => {
      const a = new File(join(dir, "eq_a.txt"));
      const b = new File(join(dir, "eq_b.txt"));
      await a.write("same");
      await b.write("same");
      expect(await a.equals(b)).toBe(true);
    });

    it("equals returns false for different content", async () => {
      const a = new File(join(dir, "neq_a.txt"));
      const b = new File(join(dir, "neq_b.txt"));
      await a.write("same");
      await b.write("different");
      expect(await a.equals(b)).toBe(false);
    });

    it("contentEquals matches string", async () => {
      const file = new File(join(dir, "ce.txt"));
      await file.write("exact");
      expect(await file.contentEquals("exact")).toBe(true);
      expect(await file.contentEquals("nope")).toBe(false);
    });
  });

  describe("copy / move / rename", () => {
    it("copyTo returns a NEW File at destination", async () => {
      const src = new File(join(dir, "src.txt"));
      await src.write("data");
      const copy = await src.copyTo(join(dir, "copied.txt"));
      expect(copy).not.toBe(src);
      expect(copy.path).toBe(join(dir, "copied.txt"));
      expect(await copy.read()).toBe("data");
      expect(await src.exists()).toBe(true);
    });

    it("copyInto copies into a directory keeping the name", async () => {
      const src = new File(join(dir, "ci.txt"));
      await src.write("x");
      const sub = join(dir, "sub");
      const copy = await src.copyInto(sub);
      expect(copy.path).toBe(join(sub, "ci.txt"));
      expect(await copy.read()).toBe("x");
    });

    it("moveTo returns a NEW File and keeps this.path", async () => {
      const src = new File(join(dir, "mv.txt"));
      await src.write("data");
      const originalPath = src.path;
      const result = await src.moveTo(join(dir, "moved.txt"));
      expect(result).not.toBe(src);
      expect(result.path).toBe(join(dir, "moved.txt"));
      expect(src.path).toBe(originalPath);
      expect(await result.read()).toBe("data");
      expect(await new File(originalPath).exists()).toBe(false);
    });

    it("moveInto returns a NEW File keeping the name", async () => {
      const src = new File(join(dir, "mi.txt"));
      await src.write("y");
      const sub = join(dir, "midest");
      const result = await src.moveInto(sub);
      expect(result).not.toBe(src);
      expect(result.path).toBe(join(sub, "mi.txt"));
      expect(src.path).toBe(join(dir, "mi.txt"));
      expect(await result.read()).toBe("y");
      expect(await src.exists()).toBe(false);
    });

    it("rename returns a NEW File and keeps this.path", async () => {
      const src = new File(join(dir, "old.txt"));
      await src.write("r");
      const originalPath = src.path;
      const result = await src.rename("new.txt");
      expect(result).not.toBe(src);
      expect(result.path).toBe(join(dir, "new.txt"));
      expect(src.path).toBe(originalPath);
      expect(await result.read()).toBe("r");
      expect(await new File(originalPath).exists()).toBe(false);
    });
  });

  describe("delete", () => {
    it("deletes an existing file and returns true", async () => {
      const file = new File(join(dir, "del.txt"));
      await file.write("x");
      expect(await file.delete()).toBe(true);
      expect(await file.exists()).toBe(false);
    });

    it("returns false for non-existent file", async () => {
      const file = new File(join(dir, "nope.txt"));
      expect(await file.delete()).toBe(false);
    });
  });

  describe("truncate", () => {
    it("truncates to given size", async () => {
      const file = new File(join(dir, "trunc.txt"));
      await file.write("hello world");
      await file.truncate(5);
      expect(await file.read()).toBe("hello");
    });

    it("truncates to 0 by default", async () => {
      const file = new File(join(dir, "trunc0.txt"));
      await file.write("hello");
      await file.truncate();
      expect(await file.isEmpty()).toBe(true);
    });
  });

  describe("streams", () => {
    it("readStream pipes content", async () => {
      const file = new File(join(dir, "stream.txt"));
      await file.write("streamed");
      const stream = file.readStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe("streamed");
    });

    it("writeStream accepts data", async () => {
      const file = new File(join(dir, "wstream.txt"));
      const { mkdirSync } = await import("node:fs");
      mkdirSync(dir, { recursive: true });
      const stream = file.writeStream();
      await new Promise<void>((resolve, reject) => {
        stream.on("error", reject);
        stream.on("finish", () => resolve());
        stream.write("ws");
        stream.end();
      });
      expect(await file.read()).toBe("ws");
    });
  });

  describe("write creates parent dirs", () => {
    it("creates nested directories automatically", async () => {
      const file = new File(join(dir, "a", "b", "c.txt"));
      await file.write("deep");
      expect(await file.read()).toBe("deep");
    });
  });
});

describe("Folder", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(TMP, `folder-${Math.random().toString(36).slice(2)}`);
  });

  describe("lifecycle", () => {
    it("creates and ensures directory", async () => {
      const folder = new Folder(join(dir, "sub"));
      expect(await folder.exists()).toBe(false);
      await folder.ensure();
      expect(await folder.exists()).toBe(true);
    });

    it("delete returns false for non-existent", async () => {
      const folder = new Folder(join(dir, "nope"));
      expect(await folder.delete()).toBe(false);
    });

    it("delete recursive removes content", async () => {
      const folder = new Folder(join(dir, "toremove"));
      await folder.ensure();
      await folder.createFile("a.txt", "a");
      await folder.delete(true);
      expect(await folder.exists()).toBe(false);
    });

    it("clear empties the directory", async () => {
      const folder = new Folder(join(dir, "toclear"));
      await folder.ensure();
      await folder.createFile("x.txt", "x");
      await folder.clear();
      expect(await folder.isEmpty()).toBe(true);
    });
  });

  describe("navigation", () => {
    it("file() returns a File reference", async () => {
      const folder = new Folder(join(dir, "nav"));
      await folder.ensure();
      const ref = folder.file("test.txt");
      expect(ref).toBeInstanceOf(File);
      expect(ref.path).toBe(join(folder.path, "test.txt"));
    });

    it("dir() returns a Folder reference", async () => {
      const folder = new Folder(join(dir, "nav2"));
      await folder.ensure();
      const ref = folder.dir("sub");
      expect(ref).toBeInstanceOf(Folder);
      expect(ref.path).toBe(join(folder.path, "sub"));
    });

    it("hasFile / hasDir check existence", async () => {
      const folder = new Folder(join(dir, "nav3"));
      await folder.ensure();
      await folder.createFile("exists.txt", "x");
      expect(await folder.hasFile("exists.txt")).toBe(true);
      expect(await folder.hasFile("nope.txt")).toBe(false);
      expect(await folder.hasDir("nope")).toBe(false);
    });
  });

  describe("listing", () => {
    it("lists files and dirs", async () => {
      const folder = new Folder(join(dir, "list"));
      await folder.ensure();
      await folder.createFile("a.txt", "a");
      await folder.createFile("b.log", "b");
      await folder.createDir("sub");
      const items = await folder.list();
      expect(items).toHaveLength(3);
      const names = items.map((i) => i.name).sort();
      expect(names).toEqual(["a.txt", "b.log", "sub"]);
    });

    it("listFiles returns only files", async () => {
      const folder = new Folder(join(dir, "listf"));
      await folder.ensure();
      await folder.createFile("a.txt", "a");
      await folder.createDir("sub");
      const files = await folder.listFiles();
      expect(files).toHaveLength(1);
      expect(files[0]!.name).toBe("a.txt");
    });

    it("listDirs returns only directories", async () => {
      const folder = new Folder(join(dir, "listd"));
      await folder.ensure();
      await folder.createFile("a.txt", "a");
      await folder.createDir("sub");
      const dirs = await folder.listDirs();
      expect(dirs).toHaveLength(1);
      expect(dirs[0]!.name).toBe("sub");
    });

    it("listByExt filters by extension", async () => {
      const folder = new Folder(join(dir, "listext"));
      await folder.ensure();
      await folder.createFile("a.ts", "a");
      await folder.createFile("b.ts", "b");
      await folder.createFile("c.js", "c");
      const tsFiles = await folder.listByExt("ts");
      expect(tsFiles).toHaveLength(2);
    });

    it("listNames returns string names", async () => {
      const folder = new Folder(join(dir, "listn"));
      await folder.ensure();
      await folder.createFile("x.txt", "x");
      expect(await folder.listNames()).toEqual(["x.txt"]);
    });
  });

  describe("walk / walkFiles / walkDirs", () => {
    it("walk returns all items recursively", async () => {
      const folder = new Folder(join(dir, "walk"));
      await folder.ensure();
      await folder.createFile("top.txt", "t");
      await folder.createDir("sub");
      await folder.file("sub/nested.txt").write("n");
      const items = await folder.walk();
      expect(items).toHaveLength(3);
    });

    it("walkFiles returns only files recursively", async () => {
      const folder = new Folder(join(dir, "walkf"));
      await folder.ensure();
      await folder.createFile("top.txt", "t");
      await folder.createDir("sub");
      await folder.file("sub/nested.txt").write("n");
      const files = await folder.walkFiles();
      expect(files.every((f) => f instanceof File)).toBe(true);
      expect(files).toHaveLength(2);
    });

    it("walkDirs returns only dirs recursively", async () => {
      const folder = new Folder(join(dir, "walkd"));
      await folder.ensure();
      await folder.createDir("a");
      await folder.dir("a").ensure();
      await folder.createDir("b");
      const dirs = await folder.walkDirs();
      expect(dirs.every((d) => d instanceof Folder)).toBe(true);
      expect(dirs.map((d) => d.name).sort()).toEqual(["a", "b"]);
    });
  });

  describe("walkIter / walkFilesIter", () => {
    it("walkIter yields items as async generator", async () => {
      const folder = new Folder(join(dir, "walkiter"));
      await folder.ensure();
      await folder.createFile("a.txt", "a");
      await folder.createDir("sub");
      await folder.file("sub/b.txt").write("b");
      const items: (File | Folder)[] = [];
      for await (const item of folder.walkIter()) items.push(item);
      expect(items).toHaveLength(3);
    });

    it("walkFilesIter yields only files", async () => {
      const folder = new Folder(join(dir, "walkfiter"));
      await folder.ensure();
      await folder.createFile("a.txt", "a");
      await folder.createDir("sub");
      await folder.file("sub/b.txt").write("b");
      const files: File[] = [];
      for await (const f of folder.walkFilesIter()) files.push(f);
      expect(files).toHaveLength(2);
      expect(files.every((f) => f instanceof File)).toBe(true);
    });
  });

  describe("find / findDir / matchFiles", () => {
    it("find locates a file by name recursively", async () => {
      const folder = new Folder(join(dir, "find"));
      await folder.ensure();
      await folder.createDir("sub");
      await folder.file("sub/target.txt").write("found");
      const result = await folder.find("target.txt");
      expect(result).toBeDefined();
      expect(result!.name).toBe("target.txt");
    });

    it("find returns undefined for missing file", async () => {
      const folder = new Folder(join(dir, "find2"));
      await folder.ensure();
      expect(await folder.find("nope.txt")).toBeUndefined();
    });

    it("findDir locates a subdirectory recursively", async () => {
      const folder = new Folder(join(dir, "findd"));
      await folder.ensure();
      await folder.createDir("sub");
      await folder.dir("sub/deep").ensure();
      const result = await folder.findDir("deep");
      expect(result).toBeDefined();
      expect(result!.name).toBe("deep");
    });

    it("matchFiles filters by RegExp on path", async () => {
      const folder = new Folder(join(dir, "match"));
      await folder.ensure();
      await folder.createFile("a.ts", "a");
      await folder.createFile("b.ts", "b");
      await folder.createFile("c.js", "c");
      const tsFiles = await folder.matchFiles(/\.ts$/);
      expect(tsFiles).toHaveLength(2);
    });
  });

  describe("copy / move / rename", () => {
    it("copyTo returns a NEW Folder at destination", async () => {
      const src = new Folder(join(dir, "cpsrc"));
      await src.ensure();
      await src.createFile("x.txt", "x");
      const copy = await src.copyTo(join(dir, "cpdest"));
      expect(copy).not.toBe(src);
      expect(copy.path).toBe(join(dir, "cpdest"));
      expect(await copy.file("x.txt").read()).toBe("x");
      expect(await src.exists()).toBe(true);
    });

    it("copyInto copies into parent keeping name", async () => {
      const src = new Folder(join(dir, "cisrc"));
      await src.ensure();
      await src.createFile("y.txt", "y");
      const parent = join(dir, "ciparent");
      const copy = await src.copyInto(parent);
      expect(copy.path).toBe(join(parent, src.name));
      expect(await copy.file("y.txt").read()).toBe("y");
    });

    it("moveTo returns a NEW Folder and keeps this.path", async () => {
      const src = new Folder(join(dir, "mvsrc"));
      await src.ensure();
      await src.createFile("z.txt", "z");
      const originalPath = src.path;
      const result = await src.moveTo(join(dir, "mvdest"));
      expect(result).not.toBe(src);
      expect(result.path).toBe(join(dir, "mvdest"));
      expect(src.path).toBe(originalPath);
      expect(await result.file("z.txt").read()).toBe("z");
      expect(await result.exists()).toBe(true);
      expect(await new Folder(originalPath).exists()).toBe(false);
    });

    it("moveInto returns a NEW Folder keeping the name", async () => {
      const src = new Folder(join(dir, "misrc"));
      await src.ensure();
      await src.createFile("w.txt", "w");
      const parent = join(dir, "miparent");
      const result = await src.moveInto(parent);
      expect(result).not.toBe(src);
      expect(result.path).toBe(join(parent, src.name));
      expect(src.path).toBe(join(dir, "misrc"));
      expect(await result.file("w.txt").read()).toBe("w");
    });

    it("rename returns a NEW Folder and keeps this.path", async () => {
      const src = new Folder(join(dir, "oldname"));
      await src.ensure();
      const originalPath = src.path;
      const result = await src.rename("newname");
      expect(result).not.toBe(src);
      expect(result.path).toBe(join(dir, "newname"));
      expect(src.path).toBe(originalPath);
      expect(await result.exists()).toBe(true);
      expect(await new Folder(join(dir, "oldname")).exists()).toBe(false);
    });
  });

  describe("tree", () => {
    it("generates an exact tree rendering each entry once with correct connectors", async () => {
      const folder = new Folder(join(dir, "tree"));
      await folder.ensure();
      // Creación en orden alfabético: el render es estable aunque `readdir`
      // devuelva por orden de inserción o por nombre.
      await folder.createFile("a.txt", "a");
      await folder.createDir("mid");
      await folder.createDir("sub");
      await folder.createDir("sub/inner");
      await folder.file("sub/inner/deep.txt").write("d");
      await folder.file("sub/nested.txt").write("n");
      await folder.createFile("z.txt", "z");

      const tree = await folder.tree();
      expect(tree).toBe(
        [
          "tree/",
          "├── a.txt",
          "├── mid/",
          "├── sub/",
          "│   ├── inner/",
          "│   │   └── deep.txt",
          "│   └── nested.txt",
          "└── z.txt",
        ].join("\n"),
      );
    });

    it("uses plain-space indent under a last sibling dir", async () => {
      const folder = new Folder(join(dir, "tree2"));
      await folder.ensure();
      await folder.createFile("a.txt", "a");
      await folder.createDir("sub");
      await folder.file("sub/x.txt").write("x");
      await folder.file("sub/y.txt").write("y");

      const tree = await folder.tree();
      expect(tree).toBe(
        [
          "tree2/",
          "├── a.txt",
          "└── sub/",
          "    ├── x.txt",
          "    └── y.txt",
        ].join("\n"),
      );
    });
  });

  describe("getters", () => {
    it("exposes name, parent, absolute", () => {
      const folder = new Folder(join(dir, "getter"));
      expect(folder.name).toBe("getter");
      expect(folder.parent).toBe(dir);
      expect(folder.absolute).toBe(join(dir, "getter"));
    });

    it("parentDir returns a Folder", () => {
      const folder = new Folder(join(dir, "getter", "sub"));
      expect(folder.parentDir).toBeInstanceOf(Folder);
      expect(folder.parentDir.path).toBe(join(dir, "getter"));
    });
  });
});