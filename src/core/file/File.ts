import { promises as fs, type Stats, createReadStream, createWriteStream } from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { Readable, Writable } from "node:stream";

/**
 * Representa un archivo individual accesible mediante una API sencilla.
 * Las operaciones son perezosas: leen/escriben en disco solo cuando se invocan.
 */
export class File {
  constructor(public readonly path: string) {}

  get name(): string {
    return path.basename(this.path);
  }

  get baseName(): string {
    return path.basename(this.path, path.extname(this.path));
  }

  get ext(): string {
    return path.extname(this.path).slice(1);
  }

  get dirname(): string {
    return path.dirname(this.path);
  }

  get mimeType(): string {
    const ext = this.ext.toLowerCase();
    const types: Record<string, string> = {
      txt: "text/plain",
      html: "text/html",
      css: "text/css",
      js: "text/javascript",
      mjs: "text/javascript",
      cjs: "text/javascript",
      ts: "text/typescript",
      json: "application/json",
      xml: "application/xml",
      yaml: "text/yaml",
      yml: "text/yaml",
      md: "text/markdown",
      csv: "text/csv",
      pdf: "application/pdf",
      zip: "application/zip",
      gz: "application/gzip",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      webp: "image/webp",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
      webm: "video/webm",
    };
    return types[ext] ?? "application/octet-stream";
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.path);
      return true;
    } catch {
      return false;
    }
  }

  async stat(): Promise<Stats> {
    return fs.stat(this.path);
  }

  async size(): Promise<number> {
    return (await this.stat()).size;
  }

  async isEmpty(): Promise<boolean> {
    return (await this.size()) === 0;
  }

  async createdAt(): Promise<Date> {
    return (await this.stat()).birthtime;
  }

  async modifiedAt(): Promise<Date> {
    return (await this.stat()).mtime;
  }

  async accessedAt(): Promise<Date> {
    return (await this.stat()).atime;
  }

  async read(encoding: BufferEncoding = "utf8"): Promise<string> {
    return fs.readFile(this.path, encoding);
  }

  async readBuffer(): Promise<Buffer> {
    return fs.readFile(this.path);
  }

  async readJson<T = unknown>(): Promise<T> {
    return JSON.parse(await this.read()) as T;
  }

  async readLines(): Promise<string[]> {
    const content = await this.read();
    return content.split(/\r?\n/);
  }

  async write(data: string | Buffer | Uint8Array): Promise<void> {
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, data);
  }

  async writeJson(data: unknown, pretty = true): Promise<void> {
    await this.write(JSON.stringify(data, null, pretty ? 2 : 0));
  }

  async writeLines(lines: readonly string[]): Promise<void> {
    await this.write(lines.join("\n"));
  }

  async append(data: string | Buffer | Uint8Array): Promise<void> {
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    await fs.appendFile(this.path, data);
  }

  async appendLine(line: string): Promise<void> {
    await this.append(line + "\n");
  }

  async prepend(data: string | Buffer | Uint8Array): Promise<void> {
    const existing = (await this.exists()) ? await this.readBuffer() : Buffer.alloc(0);
    const next = Buffer.concat([Buffer.from(data), existing]);
    await this.write(next);
  }

  async insertAt(lineIndex: number, content: string): Promise<void> {
    const lines = await this.readLines();
    const clamped = Math.max(0, Math.min(lineIndex, lines.length));
    lines.splice(clamped, 0, content);
    await this.writeLines(lines);
  }

  async replace(search: string | RegExp, replacement: string): Promise<void> {
    const content = await this.read();
    await this.write(content.replace(search, replacement));
  }

  async replaceAll(
    replacements: readonly { search: string | RegExp; replacement: string }[],
  ): Promise<void> {
    let content = await this.read();
    for (const { search, replacement } of replacements) {
      content = content.replace(search, replacement);
    }
    await this.write(content);
  }

  async truncate(size = 0): Promise<void> {
    await fs.truncate(this.path, size);
  }

  async touch(): Promise<void> {
    const now = new Date();
    if (await this.exists()) {
      await fs.utimes(this.path, now, now);
    } else {
      await this.write("");
    }
  }

  async chmod(mode: number): Promise<void> {
    await fs.chmod(this.path, mode);
  }

  async setReadOnly(): Promise<void> {
    await this.chmod(0o444);
  }

  async setReadWrite(): Promise<void> {
    await this.chmod(0o644);
  }

  async hash(algo: string = "sha256"): Promise<string> {
    return crypto.createHash(algo).update(await this.readBuffer()).digest("hex");
  }

  async equals(other: File): Promise<boolean> {
    if (!(await this.exists()) || !(await other.exists())) return false;
    return (await this.hash()) === (await other.hash());
  }

  async contentEquals(content: string | Buffer): Promise<boolean> {
    if (!(await this.exists())) return false;
    const existing = await this.readBuffer();
    const incoming = Buffer.isBuffer(content) ? content : Buffer.from(content);
    return existing.equals(incoming);
  }

  readStream(): Readable {
    return createReadStream(this.path);
  }

  writeStream(): Writable {
    return createWriteStream(this.path);
  }

  async delete(): Promise<boolean> {
    if (!(await this.exists())) return false;
    await fs.unlink(this.path);
    return true;
  }

  async copyTo(dest: string): Promise<File> {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(this.path, dest);
    return new File(dest);
  }

  async copyInto(dir: string): Promise<File> {
    return this.copyTo(path.join(dir, this.name));
  }

  async moveTo(dest: string): Promise<File> {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(this.path, dest);
    return new File(dest);
  }

  async moveInto(dir: string): Promise<File> {
    return this.moveTo(path.join(dir, this.name));
  }

  async rename(newName: string): Promise<File> {
    const dest = path.join(this.dirname, newName);
    return this.moveTo(dest);
  }
}