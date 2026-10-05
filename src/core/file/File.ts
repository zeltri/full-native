import { promises as fs, type Stats, createReadStream, createWriteStream } from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { Readable, Writable } from "node:stream";

/**
 * Representa un archivo individual accesible mediante una API sencilla.
 * Las operaciones son perezosas: leen/escriben en disco solo cuando se invocan.
 */
export class File {
  public path: string;

  constructor(path: string) {
    this.path = path;
  }

  /** Nombre del archivo incluyendo su extensión. */
  get name(): string {
    return path.basename(this.path);
  }

  /** Nombre del archivo sin la extensión. */
  get baseName(): string {
    return path.basename(this.path, path.extname(this.path));
  }

  /** Extensión del archivo sin el punto inicial (ej. `txt`, `json`). */
  get ext(): string {
    return path.extname(this.path).slice(1);
  }

  /** Ruta absoluta del directorio que contiene al archivo. */
  get dirname(): string {
    return path.dirname(this.path);
  }

  /** Ruta absoluta resuelta del archivo. */
  get absolute(): string {
    return path.resolve(this.path);
  }

  /**
   * Tipo MIME inferido a partir de la extensión del archivo.
   * Devuelve `application/octet-stream` para extensiones desconocidas.
   */
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

  /**
   * Verifica si el archivo existe en disco.
   * @returns `true` si el archivo existe, `false` en caso contrario.
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtiene los metadatos (stat) del archivo en disco.
   * @returns Una promesa con el objeto `Stats` de Node.js.
   */
  async stat(): Promise<Stats> {
    return fs.stat(this.path);
  }

  /**
   * Obtiene el tamaño del archivo en bytes.
   * @returns Tamaño en bytes.
   */
  async size(): Promise<number> {
    return (await this.stat()).size;
  }

  /**
   * Indica si el archivo está vacío (0 bytes).
   * @returns `true` si el tamaño es 0, `false` en caso contrario.
   */
  async isEmpty(): Promise<boolean> {
    return (await this.size()) === 0;
  }

  /**
   * Obtiene la fecha de creación del archivo.
   * @returns La fecha (`birthtime`) de creación.
   */
  async createdAt(): Promise<Date> {
    return (await this.stat()).birthtime;
  }

  /**
   * Obtiene la fecha de última modificación del archivo.
   * @returns La fecha (`mtime`) de última modificación.
   */
  async modifiedAt(): Promise<Date> {
    return (await this.stat()).mtime;
  }

  /**
   * Obtiene la fecha de último acceso al archivo.
   * @returns La fecha (`atime`) de último acceso.
   */
  async accessedAt(): Promise<Date> {
    return (await this.stat()).atime;
  }

  /**
   * Lee el contenido del archivo como texto.
   * @param encoding Codificación a utilizar (por defecto `utf8`).
   * @returns El contenido del archivo como cadena.
   */
  async read(encoding: BufferEncoding = "utf8"): Promise<string> {
    return fs.readFile(this.path, encoding);
  }

  /**
   * Lee el contenido del archivo como `Buffer` binario.
   * @returns Un `Buffer` con los bytes del archivo.
   */
  async readBuffer(): Promise<Buffer> {
    return fs.readFile(this.path);
  }

  /**
   * Lee y parsea el contenido del archivo como JSON.
   * @returns El valor parseado, tipado genéricamente como `T`.
   */
  async readJson<T = unknown>(): Promise<T> {
    return JSON.parse(await this.read()) as T;
  }

  /**
   * Lee el contenido del archivo y lo divide en líneas.
   * @returns Un arreglo de cadenas, una por línea.
   */
  async readLines(): Promise<string[]> {
    const content = await this.read();
    return content.split(/\r?\n/);
  }

  /**
   * Escribe datos en el archivo. Crea el directorio padre automáticamente
   * si no existe (comportamiento intencional para que el caller no necesite
   * un `mkdir -p` previo explícito). Sobrescribe el contenido existente.
   * @param data Contenido a escribir (cadena, `Buffer` o `Uint8Array`).
   * @returns Promesa que se resuelve cuando la escritura termina.
   */
  async write(data: string | Buffer | Uint8Array): Promise<void> {
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, data);
  }

  /**
   * Serializa `data` a JSON y lo escribe en el archivo (creando el directorio padre).
   * @param data Valor a serializar.
   * @param pretty Si `true` (por defecto), indenta con 2 espacios; si `false`, compacto.
   * @returns Promesa que se resuelve cuando la escritura termina.
   */
  async writeJson(data: unknown, pretty = true): Promise<void> {
    await this.write(JSON.stringify(data, null, pretty ? 2 : 0));
  }

  /**
   * Escribe un arreglo de líneas en el archivo, unidas por `\n`.
   * Crea el directorio padre automáticamente.
   * @param lines Líneas a escribir.
   * @returns Promesa que se resuelve cuando la escritura termina.
   */
  async writeLines(lines: readonly string[]): Promise<void> {
    await this.write(lines.join("\n"));
  }

  /**
   * Añade datos al final del archivo. Crea el directorio padre automáticamente
   * si no existe.
   * @param data Contenido a añadir (cadena, `Buffer` o `Uint8Array`).
   * @returns Promesa que se resuelve cuando la operación termina.
   */
  async append(data: string | Buffer | Uint8Array): Promise<void> {
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    await fs.appendFile(this.path, data);
  }

  /**
   * Añade una línea al final del archivo, seguida de un salto de línea.
   * Crea el directorio padre automáticamente.
   * @param line Texto de la línea a añadir.
   * @returns Promesa que se resuelve cuando la operación termina.
   */
  async appendLine(line: string): Promise<void> {
    await this.append(line + "\n");
  }

  /**
   * Prependa datos al inicio del archivo, leyendo el contenido existente y
   * reescribiendo el archivo completo. Crea el directorio padre automáticamente.
   * @param data Contenido a prepend (cadena, `Buffer` o `Uint8Array`).
   * @returns Promesa que se resuelve cuando la operación termina.
   */
  async prepend(data: string | Buffer | Uint8Array): Promise<void> {
    const existing = (await this.exists()) ? await this.readBuffer() : Buffer.alloc(0);
    const next = Buffer.concat([Buffer.from(data), existing]);
    await this.write(next);
  }

  /**
   * Inserta una línea en una posición específica del archivo (por índice de línea).
   * El índice se ajusta dentro de los límites válidos.
   * @param lineIndex Índice (base 0) donde insertar la línea.
   * @param content Texto de la línea a insertar.
   * @returns Promesa que se resuelve cuando la escritura termina.
   */
  async insertAt(lineIndex: number, content: string): Promise<void> {
    const lines = await this.readLines();
    const clamped = Math.max(0, Math.min(lineIndex, lines.length));
    lines.splice(clamped, 0, content);
    await this.writeLines(lines);
  }

  /**
   * Reemplaza la primera ocurrencia de `search` por `replacement` en el contenido
   * del archivo y lo reescribe.
   * @param search Cadena o expresión regular a buscar.
   * @param replacement Texto de reemplazo.
   * @returns Promesa que se resuelve cuando la escritura termina.
   */
  async replace(search: string | RegExp, replacement: string): Promise<void> {
    const content = await this.read();
    await this.write(content.replace(search, replacement));
  }

  /**
   * Aplica múltiples reemplazos en secuencia sobre el contenido del archivo.
   * Renombrado desde `replaceAll()` para evitar colisión con el método nativo
   * de cadenas. Cada reemplazo se aplica al resultado del anterior, en orden.
   * @param replacements Arreglo de pares `{ search, replacement }` aplicados en orden.
   * @returns Promesa que se resuelve cuando la escritura termina.
   */
  async replaceMany(
    replacements: readonly { search: string | RegExp; replacement: string }[],
  ): Promise<void> {
    let content = await this.read();
    for (const { search, replacement } of replacements) {
      content = content.replace(search, replacement);
    }
    await this.write(content);
  }

  /**
   * Trunca el archivo al tamaño indicado.
   * @param size Tamaño en bytes (por defecto 0, vacía el archivo).
   * @returns Promesa que se resuelve al completar el truncado.
   */
  async truncate(size = 0): Promise<void> {
    await fs.truncate(this.path, size);
  }

  /**
   * Actualiza la fecha de acceso/modificación al momento actual, o crea el
   * archivo vacío si no existe.
   * @returns Promesa que se resuelve al completar la operación.
   */
  async touch(): Promise<void> {
    const now = new Date();
    if (await this.exists()) {
      await fs.utimes(this.path, now, now);
    } else {
      await this.write("");
    }
  }

  /**
   * Cambia los permisos del archivo.
   * @param mode Máscara de permisos numérica (ej. `0o644`).
   * @returns Promesa que se resuelve al completar el cambio.
   */
  async chmod(mode: number): Promise<void> {
    await fs.chmod(this.path, mode);
  }

  /**
   * Establece el archivo como solo lectura (modo `0o444`).
   * @returns Promesa que se resuelve al completar el cambio.
   */
  async setReadOnly(): Promise<void> {
    await this.chmod(0o444);
  }

  /**
   * Establece el archivo como lectura/escritura (modo `0o644`).
   * @returns Promesa que se resuelve al completar el cambio.
   */
  async setReadWrite(): Promise<void> {
    await this.chmod(0o644);
  }

  /**
   * Calcula el hash criptográfico del contenido del archivo.
   * @param algo Algoritmo de hash (por defecto `sha256`).
   * @returns El hash en formato hexadecimal.
   */
  async hash(algo: string = "sha256"): Promise<string> {
    return crypto.createHash(algo).update(await this.readBuffer()).digest("hex");
  }

  /**
   * Compara este archivo con otro por contenido (usando hash).
   * @param other Otro `File` a comparar.
   * @returns `true` si ambos existen y su hash coincide, `false` en caso contrario.
   */
  async equals(other: File): Promise<boolean> {
    if (!(await this.exists()) || !(await other.exists())) return false;
    return (await this.hash()) === (await other.hash());
  }

  /**
   * Compara el contenido del archivo con una cadena o `Buffer` dada.
   * @param content Contenido a comparar.
   * @returns `true` si el contenido coincide, `false` si no existe o difiere.
   */
  async contentEquals(content: string | Buffer): Promise<boolean> {
    if (!(await this.exists())) return false;
    const existing = await this.readBuffer();
    const incoming = Buffer.isBuffer(content) ? content : Buffer.from(content);
    return existing.equals(incoming);
  }

  /**
   * Crea un stream de lectura para el archivo.
   * @returns Un `Readable` para consumir el contenido en streaming.
   */
  readStream(): Readable {
    return createReadStream(this.path);
  }

  /**
   * Crea un stream de escritura hacia el archivo.
   * @returns Un `Writable` para escribir contenido en streaming.
   */
  writeStream(): Writable {
    return createWriteStream(this.path);
  }

  /**
   * Elimina el archivo del disco.
   * @returns `true` si el archivo existía y fue eliminado, `false` si no existía.
   */
  async delete(): Promise<boolean> {
    if (!(await this.exists())) return false;
    await fs.unlink(this.path);
    return true;
  }

  /**
   * Copia este archivo a una ruta destino. Crea el directorio padre del destino
   * automáticamente si no existe.
   * @param dest Ruta absoluta del archivo destino.
   * @returns Una **nueva** instancia de `File` apuntando al destino.
   */
  async copyTo(dest: string): Promise<File> {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(this.path, dest);
    return new File(dest);
  }

  /**
   * Copia este archivo dentro de un directorio, conservando su nombre.
   * @param dir Ruta del directorio destino.
   * @returns Una **nueva** instancia de `File` apuntando a `dir/name`.
   */
  async copyInto(dir: string): Promise<File> {
    return this.copyTo(path.join(dir, this.name));
  }

  /**
   * Mueve este archivo a una ruta destino. Crea el directorio padre del destino
   * automáticamente si no existe.
   * @param dest Ruta absoluta del archivo destino.
   * @returns Una **nueva** instancia de `File` apuntando al destino; la
   * instancia original conserva su ruta anterior.
   */
  async moveTo(dest: string): Promise<File> {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(this.path, dest);
    return new File(dest);
  }

  /**
   * Mueve este archivo dentro de un directorio, conservando su nombre.
   * @param dir Ruta del directorio destino.
   * @returns Una **nueva** instancia de `File` apuntando a `dir/name`; la
   * instancia original conserva su ruta anterior.
   */
  async moveInto(dir: string): Promise<File> {
    return this.moveTo(path.join(dir, this.name));
  }

  /**
   * Renombra este archivo dentro de su mismo directorio.
   * @param newName Nuevo nombre del archivo (sin ruta).
   * @returns Una **nueva** instancia de `File` apuntando al nuevo nombre; la
   * instancia original conserva su ruta anterior.
   */
  async rename(newName: string): Promise<File> {
    return this.moveTo(path.join(this.dirname, newName));
  }
}