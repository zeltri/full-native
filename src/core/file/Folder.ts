import { promises as fs, watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import { File } from "./File.js";

/**
 * Representa un directorio accesible mediante una API sencilla.
 */
export class Folder {
  constructor(public readonly path: string) {}

  get name(): string {
    return path.basename(this.path);
  }

  get parent(): string {
    return path.dirname(this.path);
  }

  get parentDir(): Folder {
    return new Folder(this.parent);
  }

  get absolute(): string {
    return path.resolve(this.path);
  }

  async exists(): Promise<boolean> {
    try {
      const s = await fs.stat(this.path);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  async isEmpty(): Promise<boolean> {
    if (!(await this.exists())) return true;
    return (await fs.readdir(this.path)).length === 0;
  }

  async stat(): Promise<import("node:fs").Stats> {
    return fs.stat(this.path);
  }

  async createdAt(): Promise<Date> {
    return (await this.stat()).birthtime;
  }

  async modifiedAt(): Promise<Date> {
    return (await this.stat()).mtime;
  }

  async size(): Promise<number> {
    if (!(await this.exists())) return 0;
    let total = 0;
    for (const item of await this.walk()) {
      if (item instanceof File) total += await item.size();
    }
    return total;
  }

  async create(): Promise<void> {
    await fs.mkdir(this.path, { recursive: true });
  }

  async ensure(): Promise<void> {
    if (!(await this.exists())) await this.create();
  }

  async delete(recursive = false): Promise<boolean> {
    if (!(await this.exists())) return false;
    await fs.rmdir(this.path, { recursive });
    return true;
  }

  async clear(): Promise<void> {
    if (!(await this.exists())) return;
    const entries = await fs.readdir(this.path, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(this.path, entry.name);
      if (entry.isDirectory()) {
        await new Folder(full).delete(true);
      } else {
        await fs.unlink(full);
      }
    }
  }

  async chmod(mode: number): Promise<void> {
    await fs.chmod(this.path, mode);
  }

  file(name: string): File {
    return new File(path.join(this.path, name));
  }

  dir(name: string): Folder {
    return new Folder(path.join(this.path, name));
  }

  hasFile(name: string): Promise<boolean> {
    return this.file(name).exists();
  }

  async hasDir(name: string): Promise<boolean> {
    return this.dir(name).exists();
  }

  async list(): Promise<(File | Folder)[]> {
    const entries = await fs.readdir(this.path, { withFileTypes: true });
    return entries.map((entry) => {
      const full = path.join(this.path, entry.name);
      return entry.isDirectory()
        ? new Folder(full)
        : new File(full);
    });
  }

  async listFiles(): Promise<File[]> {
    const items = await this.list();
    return items.filter((i): i is File => i instanceof File);
  }

  async listDirs(): Promise<Folder[]> {
    const items = await this.list();
    return items.filter(
      (i): i is Folder => i instanceof Folder,
    );
  }

  async listNames(): Promise<string[]> {
    return fs.readdir(this.path);
  }

  async listByExt(ext: string): Promise<File[]> {
    const files = await this.listFiles();
    const lower = ext.toLowerCase().replace(/^\./, "");
    return files.filter((f) => f.ext.toLowerCase() === lower);
  }

  async find(name: string): Promise<File | undefined> {
    const items = await this.walk();
    return items.find(
      (i): i is File => i instanceof File && i.name === name,
    );
  }

  async findDir(name: string): Promise<Folder | undefined> {
    const items = await this.walk();
    return items.find(
      (i): i is Folder => i instanceof Folder && i.name === name,
    );
  }

  async glob(pattern: RegExp): Promise<File[]> {
    const items = await this.walk();
    return items.filter((i): i is File => i instanceof File && pattern.test(i.path));
  }

  async walk(): Promise<(File | Folder)[]> {
    const result: (File | Folder)[] = [];
    if (!(await this.exists())) return result;

    const recurse = async (dir: Folder): Promise<void> => {
      const items = await dir.list();
      for (const item of items) {
        result.push(item);
        if (item instanceof Folder) await recurse(item);
      }
    };

    await recurse(this);
    return result;
  }

  async walkFiles(): Promise<File[]> {
    const items = await this.walk();
    return items.filter((i): i is File => i instanceof File);
  }

  async walkDirs(): Promise<Folder[]> {
    const items = await this.walk();
    return items.filter((i): i is Folder => i instanceof Folder);
  }

  async createFile(name: string, content: string | Buffer = ""): Promise<File> {
    const file = this.file(name);
    await file.write(content);
    return file;
  }

  async createDir(name: string): Promise<Folder> {
    const dir = this.dir(name);
    await dir.ensure();
    return dir;
  }

  async copyTo(dest: string): Promise<Folder> {
    const target = new Folder(dest);
    await target.ensure();
    for (const item of await this.list()) {
      if (item instanceof File) {
        await item.copyTo(path.join(dest, item.name));
      } else {
        await item.copyTo(path.join(dest, item.name));
      }
    }
    return target;
  }

  async copyInto(parent: string): Promise<Folder> {
    return this.copyTo(path.join(parent, this.name));
  }

  async moveTo(dest: string): Promise<Folder> {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(this.path, dest);
    return new Folder(dest);
  }

  async moveInto(parent: string): Promise<Folder> {
    return this.moveTo(path.join(parent, this.name));
  }

  async rename(newName: string): Promise<Folder> {
    return this.moveTo(path.join(this.parent, newName));
  }

  async watch(
    callback: (event: "change" | "rename", filename: string | null) => void,
  ): Promise<FSWatcher> {
    return watch(this.path, { recursive: true }, callback);
  }

  async tree(): Promise<string> {
    const lines: string[] = [];
    const render = async (
      dir: Folder,
      prefix: string,
      isLast: boolean,
    ): Promise<void> => {
      const connector = isLast ? "└── " : "├── ";
      lines.push(`${prefix}${connector}${dir.name}/`);
      const items = await dir.list();
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const last = i === items.length - 1;
        const childConnector = last ? "└── " : "├── ";
        if (item instanceof Folder) {
          lines.push(`${childPrefix}${childConnector}${item.name}/`);
          await render(item, childPrefix + (last ? "    " : "│   "), true);
        } else {
          lines.push(`${childPrefix}${childConnector}${item.name}`);
        }
      }
    };
    await render(this, "", true);
    return lines.join("\n");
  }
}