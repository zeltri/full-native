import { promises as fs, watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import { File } from "./File.js";

/**
 * Representa un directorio accesible mediante una API sencilla.
 */
export class Folder {
  public path: string;

  constructor(path: string) {
    this.path = path;
  }

  /** Nombre del directorio (último segmento de la ruta). */
  get name(): string {
    return path.basename(this.path);
  }

  /** Ruta absoluta del directorio padre. */
  get parent(): string {
    return path.dirname(this.path);
  }

  /** Instancia de `Folder` que representa al directorio padre. */
  get parentDir(): Folder {
    return new Folder(this.parent);
  }

  /** Ruta absoluta resuelta del directorio. */
  get absolute(): string {
    return path.resolve(this.path);
  }

  /**
   * Verifica si el directorio existe en disco.
   * @returns `true` si existe y es un directorio, `false` en caso contrario.
   */
  async exists(): Promise<boolean> {
    try {
      const s = await fs.stat(this.path);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Indica si el directorio está vacío (sin entradas).
   * @returns `true` si no existe o no contiene entradas, `false` si tiene contenido.
   */
  async isEmpty(): Promise<boolean> {
    if (!(await this.exists())) return true;
    return (await fs.readdir(this.path)).length === 0;
  }

  /**
   * Obtiene los metadatos (stat) del directorio.
   * @returns Una promesa con el objeto `Stats` de Node.js.
   */
  async stat(): Promise<import("node:fs").Stats> {
    return fs.stat(this.path);
  }

  /**
   * Obtiene la fecha de creación del directorio.
   * @returns La fecha (`birthtime`) de creación.
   */
  async createdAt(): Promise<Date> {
    return (await this.stat()).birthtime;
  }

  /**
   * Obtiene la fecha de última modificación del directorio.
   * @returns La fecha (`mtime`) de última modificación.
   */
  async modifiedAt(): Promise<Date> {
    return (await this.stat()).mtime;
  }

  /**
   * Calcula el tamaño total del directorio sumando el tamaño de todos los
   * archivos contenidos recursivamente.
   * @returns Tamaño total en bytes (0 si no existe).
   */
  async size(): Promise<number> {
    if (!(await this.exists())) return 0;
    let total = 0;
    for (const item of await this.walk()) {
      if (item instanceof File) total += await item.size();
    }
    return total;
  }

  /**
   * Crea el directorio (y sus padres) en disco.
   * @returns Promesa que se resuelve al completar la creación.
   */
  async create(): Promise<void> {
    await fs.mkdir(this.path, { recursive: true });
  }

  /**
   * Garantiza que el directorio exista, creándolo si es necesario.
   * @returns Promesa que se resuelve al asegurar la existencia.
   */
  async ensure(): Promise<void> {
    if (!(await this.exists())) await this.create();
  }

  /**
   * Elimina el directorio del disco.
   * @param recursive Si `true`, elimina recursivamente su contenido.
   * @returns `true` si existía y fue eliminado, `false` si no existía.
   */
  async delete(recursive = false): Promise<boolean> {
    if (!(await this.exists())) return false;
    await fs.rm(this.path, { recursive, force: true });
    return true;
  }

  /**
   * Vacía el directorio eliminando todo su contenido (archivos y subdirectorios)
   * sin eliminar el directorio mismo.
   * @returns Promesa que se resuelve al completar el vaciado.
   */
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

  /**
   * Cambia los permisos del directorio.
   * @param mode Máscara de permisos numérica (ej. `0o755`).
   * @returns Promesa que se resuelve al completar el cambio.
   */
  async chmod(mode: number): Promise<void> {
    await fs.chmod(this.path, mode);
  }

  /**
   * Construye una referencia `File` a un archivo dentro de este directorio.
   * @param name Nombre del archivo (relativo al directorio).
   * @returns Una nueva instancia de `File` (no verifica existencia).
   */
  file(name: string): File {
    return new File(path.join(this.path, name));
  }

  /**
   * Construye una referencia `Folder` a un subdirectorio de este directorio.
   * @param name Nombre del subdirectorio (relativo al directorio).
   * @returns Una nueva instancia de `Folder` (no verifica existencia).
   */
  dir(name: string): Folder {
    return new Folder(path.join(this.path, name));
  }

  /**
   * Verifica si existe un archivo con el nombre dado dentro del directorio.
   * @param name Nombre del archivo a buscar.
   * @returns `true` si el archivo existe, `false` en caso contrario.
   */
  hasFile(name: string): Promise<boolean> {
    return this.file(name).exists();
  }

  /**
   * Verifica si existe un subdirectorio con el nombre dado.
   * @param name Nombre del subdirectorio a buscar.
   * @returns `true` si el subdirectorio existe, `false` en caso contrario.
   */
  async hasDir(name: string): Promise<boolean> {
    return this.dir(name).exists();
  }

  /**
   * Lista las entradas directas (archivos y subdirectorios) del directorio.
   * @returns Arreglo de instancias `File` y `Folder`.
   */
  async list(): Promise<(File | Folder)[]> {
    const entries = await fs.readdir(this.path, { withFileTypes: true });
    return entries.map((entry) => {
      const full = path.join(this.path, entry.name);
      return entry.isDirectory()
        ? new Folder(full)
        : new File(full);
    });
  }

  /**
   * Lista solo los archivos (no directorios) en el nivel actual.
   * @returns Arreglo de instancias `File`.
   */
  async listFiles(): Promise<File[]> {
    const items = await this.list();
    return items.filter((i): i is File => i instanceof File);
  }

  /**
   * Lista solo los subdirectorios en el nivel actual.
   * @returns Arreglo de instancias `Folder`.
   */
  async listDirs(): Promise<Folder[]> {
    const items = await this.list();
    return items.filter(
      (i): i is Folder => i instanceof Folder,
    );
  }

  /**
   * Lista los nombres de las entradas directas del directorio.
   * @returns Arreglo de cadenas con los nombres de las entradas.
   */
  async listNames(): Promise<string[]> {
    return fs.readdir(this.path);
  }

  /**
   * Lista los archivos del nivel actual cuya extensión coincide con `ext`.
   * @param ext Extensión a filtrar (con o sin punto inicial, sin distinguir mayúsculas).
   * @returns Arreglo de instancias `File` que coinciden.
   */
  async listByExt(ext: string): Promise<File[]> {
    const files = await this.listFiles();
    const lower = ext.toLowerCase().replace(/^\./, "");
    return files.filter((f) => f.ext.toLowerCase() === lower);
  }

  /**
   * Busca recursivamente un archivo por nombre exacto.
   * @param name Nombre del archivo a buscar.
   * @returns La instancia `File` si se encuentra, `undefined` en caso contrario.
   */
  async find(name: string): Promise<File | undefined> {
    const items = await this.walk();
    return items.find(
      (i): i is File => i instanceof File && i.name === name,
    );
  }

  /**
   * Busca recursivamente un subdirectorio por nombre exacto.
   * @param name Nombre del subdirectorio a buscar.
   * @returns La instancia `Folder` si se encuentra, `undefined` en caso contrario.
   */
  async findDir(name: string): Promise<Folder | undefined> {
    const items = await this.walk();
    return items.find(
      (i): i is Folder => i instanceof Folder && i.name === name,
    );
  }

  /**
   * Filtra archivos recursivamente mediante una expresión regular.
   * Renombrado desde `glob()`: usa sintaxis **RegExp**, no patrones glob.
   * @param pattern Expresión regular a probar contra la ruta completa de cada archivo.
   * @returns Arreglo de instancias `File` cuya ruta coincide con el patrón.
   */
  async matchFiles(pattern: RegExp): Promise<File[]> {
    const items = await this.walk();
    return items.filter((i): i is File => i instanceof File && pattern.test(i.path));
  }

  /**
   * Recorre recursivamente el directorio acumulando todas las entradas
   * (archivos y subdirectorios) en un arreglo.
   * @returns Arreglo con todas las instancias `File` y `Folder` encontradas.
   */
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

  /**
   * Recorre recursivamente y devuelve solo los archivos.
   * @returns Arreglo con todas las instancias `File` encontradas.
   */
  async walkFiles(): Promise<File[]> {
    const items = await this.walk();
    return items.filter((i): i is File => i instanceof File);
  }

  /**
   * Recorre recursivamente y devuelve solo los subdirectorios.
   * @returns Arreglo con todas las instancias `Folder` encontradas.
   */
  async walkDirs(): Promise<Folder[]> {
    const items = await this.walk();
    return items.filter((i): i is Folder => i instanceof Folder);
  }

  /**
   * Versión streaming de `walk()` como async generator, ideal para carpetas
   * grandes: produce entradas (`File` o `Folder`) a medida que se recorre el
   * árbol, sin acumular todo en memoria.
   * @yields Instancias `File` o `Folder` conforme se descubre cada entrada.
   */
  async *walkIter(): AsyncGenerator<File | Folder> {
    if (!(await this.exists())) return;
    const items = await this.list();
    for (const item of items) {
      yield item;
      if (item instanceof Folder) {
        yield* item.walkIter();
      }
    }
  }

  /**
   * Versión streaming de `walkFiles()` como async generator: produce solo
   * archivos a medida que recorre el árbol, sin acumular todo en memoria.
   * @yields Instancias `File` conforme se descubre cada archivo.
   */
  async *walkFilesIter(): AsyncGenerator<File> {
    for await (const item of this.walkIter()) {
      if (item instanceof File) yield item;
    }
  }

  /**
   * Crea un archivo dentro de este directorio con el contenido indicado.
   * @param name Nombre del archivo a crear.
   * @param content Contenido inicial (cadena o `Buffer`, por defecto vacío).
   * @returns La instancia `File` recién creada.
   */
  async createFile(name: string, content: string | Buffer = ""): Promise<File> {
    const file = this.file(name);
    await file.write(content);
    return file;
  }

  /**
   * Crea un subdirectorio dentro de este directorio (garantizando su existencia).
   * @param name Nombre del subdirectorio a crear.
   * @returns La instancia `Folder` del subdirectorio creado.
   */
  async createDir(name: string): Promise<Folder> {
    const dir = this.dir(name);
    await dir.ensure();
    return dir;
  }

  /**
   * Copia este directorio (y todo su contenido) a una ruta destino, creando
   * el destino si no existe.
   * @param dest Ruta absoluta del directorio destino.
   * @returns Una **nueva** instancia de `Folder` apuntando al destino.
   */
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

  /**
   * Copia este directorio dentro de otro, conservando su nombre.
   * @param parent Ruta del directorio padre destino.
   * @returns Una **nueva** instancia de `Folder` apuntando a `parent/name`.
   */
  async copyInto(parent: string): Promise<Folder> {
    return this.copyTo(path.join(parent, this.name));
  }

  /**
   * Mueve este directorio a una ruta destino. Crea el directorio padre del
   * destino automáticamente si no existe.
   * @param dest Ruta absoluta del directorio destino.
   * @returns Una **nueva** instancia de `Folder` apuntando al destino; la
   * instancia original conserva su ruta anterior.
   */
  async moveTo(dest: string): Promise<Folder> {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(this.path, dest);
    return new Folder(dest);
  }

  /**
   * Mueve este directorio dentro de otro, conservando su nombre.
   * @param parent Ruta del directorio padre destino.
   * @returns Una **nueva** instancia de `Folder` apuntando a `parent/name`; la
   * instancia original conserva su ruta anterior.
   */
  async moveInto(parent: string): Promise<Folder> {
    return this.moveTo(path.join(parent, this.name));
  }

  /**
   * Renombra este directorio dentro de su mismo directorio padre.
   * @param newName Nuevo nombre del directorio (sin ruta).
   * @returns Una **nueva** instancia de `Folder` apuntando al nuevo nombre; la
   * instancia original conserva su ruta anterior.
   */
  async rename(newName: string): Promise<Folder> {
    return this.moveTo(path.join(this.parent, newName));
  }

  /**
   * Observa cambios en el directorio de forma recursiva.
   * @param callback Función invocada por cada evento (`change` o `rename`).
   * @returns Un `FSWatcher` que debe cerrarse cuando ya no se necesite.
   */
  async watch(
    callback: (event: "change" | "rename", filename: string | null) => void,
  ): Promise<FSWatcher> {
    return watch(this.path, { recursive: true }, callback);
  }

  /**
   * Genera una representación visual en árbol (tipo `tree`) del directorio y
   * su contenido recursivo.
   * @returns Una cadena con la representación del árbol.
   */
  async tree(): Promise<string> {
    const lines: string[] = [];

    /**
     * Pinta cada entrada exactamente una vez: la línea del nodo actual y las
     * de sus hijos. `render` siempre recibe la lista completa de hermanos para
     * decidir por sí misma qué conector usa (`├──` o `└──`) y con qué prefijo
     * indenta a los hijos (`│   ` si no es el último, `    ` si lo es).
     * @param dir Directorio que se está renderizando.
     * @param prefix Indentación acumulada heredada de los ancestros.
     * @param items Entradas del directorio (hermanos entre sí).
     * @param index Índice de `dir` dentro de `items` (para el conector propio).
     */
    const render = async (
      dir: Folder,
      prefix: string,
      items: readonly (File | Folder)[],
      index: number,
    ): Promise<void> => {
      const last = index === items.length - 1;
      const connector = last ? "└── " : "├── ";
      lines.push(`${prefix}${connector}${dir.name}/`);

      const childPrefix = prefix + (last ? "    " : "│   ");
      const children = await dir.list();
      for (let i = 0; i < children.length; i++) {
        const item = children[i];
        if (item instanceof Folder) {
          await render(item, childPrefix, children, i);
        } else {
          const childLast = i === children.length - 1;
          lines.push(
            `${childPrefix}${childLast ? "└── " : "├── "}${item.name}`,
          );
        }
      }
    };

    lines.push(`${this.name}/`);
    const items = await this.list();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item instanceof Folder) {
        await render(item, "", items, i);
      } else {
        const last = i === items.length - 1;
        lines.push(`${last ? "└── " : "├── "}${item.name}`);
      }
    }
    return lines.join("\n");
  }
}