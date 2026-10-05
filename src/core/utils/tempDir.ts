import { promises as fs, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Folder } from "../file/Folder.js";

/**
 * Registro a nivel de módulo con las rutas de los directorios temporales
 * pendientes de limpieza automática. Solo contiene las rutas creadas con
 * `keep !== true`; las de `keep: true` no se registran.
 */
const pending = new Set<string>();

/** Marca si el hook de `exit` ya se registró (único por proceso). */
let hookInstalled = false;

/**
 * Limpieza al finalizar el proceso: elimina cada ruta registrada.
 *
 * Se registra UNA sola vez (aunque se creen N tempdirs) para no acumular
 * listeners de `exit`. Los fallos de `rmSync` se tragan a propósito: la
 * limpieza en el cierre del proceso es de "mejor esfuerzo" y no debe
 * interrumpir el shutdown.
 */
const cleanupPending = (): void => {
  for (const dir of pending) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Mejor esfuerzo en el cierre del proceso.
    }
  }
  pending.clear();
};

/**
 * Registra el hook de `exit` (solo la primera vez que se necesita).
 */
function installExitHook(): void {
  if (hookInstalled) return;
  hookInstalled = true;
  process.once("exit", cleanupPending);
}

/**
 * Opciones de creación de un directorio temporal.
 */
export interface TempDirOptions {
  /**
   * Prefijo del nombre del directorio; se combinan `os.tmpdir()`, el prefijo
   * y 6 caracteres aleatorios (vía `fs.mkdtemp`).
   *
   * Default `"fullnative-"`.
   */
  prefix?: string;

  /**
   * Si `true`, el directorio **no** se registra para el auto-cleanup del
   * `exit` del proceso: persiste tras el cierre y su eliminación queda a
   * cargo del usuario (normalmente con `dispose()`).
   *
   * Default `false`.
   */
  keep?: boolean;
}

/**
 * Directorio temporal gestionado, creado con `fs.mkdtemp` bajo `os.tmpdir()`.
 *
 * Extiende `Folder`, así que hereda toda la API de directorios (`list`,
 * `createFile`, `walk`, etc.). Añade `dispose()` para eliminarlo bajo demanda:
 * `dispose()` es idempotente y quita la ruta del registro del auto-cleanup,
 * así que no hay doble intento de borrado al salir del proceso.
 */
export class TempDir extends Folder {
  /** Indica si el directorio fue creado con `keep: true`. */
  public readonly keep: boolean;

  /**
   * @param dirPath Ruta (absoluta) del directorio temporal.
   * @param keep `true` si se creó con `keep: true` (sin auto-cleanup).
   */
  constructor(dirPath: string, keep = false) {
    super(dirPath);
    this.keep = keep;
  }

  /**
   * Elimina el directorio y todo su contenido del disco
   * (`fs.rm` con `recursive` y `force`) y lo saca del registro de
   * auto-cleanup. No falla si ya no existe.
   */
  async dispose(): Promise<void> {
    await fs.rm(this.path, { recursive: true, force: true });
    pending.delete(this.path);
  }
}

/**
 * Crea un directorio temporal único bajo `os.tmpdir()` con `fs.mkdtemp`.
 *
 * Por defecto (`keep: false`) la ruta se registra y un hook **único** de
 * `process.once("exit")` la elimina automáticamente al finalizar el proceso
 * (un solo listener para todos los tempdirs, nunca uno por creación), con
 * `rmSync` recursive + force.
 *
 * @param options Opciones `prefix` (default `"fullnative-"`) y `keep`
 *   (default `false`).
 * @returns Una promesa con la instancia `TempDir`; el directorio ya existe
 *   en disco al resolverse.
 */
export async function tempDir(options: TempDirOptions = {}): Promise<TempDir> {
  const { prefix = "fullnative-", keep = false } = options;
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  if (!keep) {
    pending.add(dirPath);
    installExitHook();
  }
  return new TempDir(dirPath, keep);
}