/**
 * Opciones de configuración para una sesión de Shell.
 *
 * El shell concreto que interpreta los scripts no se configura aquí: se
 * elige automáticamente en `Process.shell()` / `Process.spawnScript()`
 * (`/bin/sh` en Unix, `cmd.exe` en Windows).
 */
export interface ShellConfig {
  /** Directorio de trabajo inicial. Por defecto, `process.cwd()`. */
  cwd?: string;
  /** Variables de entorno adicionales. */
  env?: Record<string, string>;
}

/** Entrada del historial de comandos ejecutados. */
export interface HistoryItem {
  /** Comando ejecutado (script original antes de resolver aliases). */
  command: string;
  /** Fecha y hora en la que comenzó la ejecución del comando. */
  startedAt: Date;
  /** Duración total de la ejecución en milisegundos. */
  durationMs: number;
  /** Código de salida del proceso (`null` si fue terminado por señal). */
  exitCode: number | null;
  /** `true` si el proceso terminó con código de salida 0. */
  ok: boolean;
}

/** Opciones para lanzar un job en segundo plano. */
export interface JobOptions {
  /** Nombre identificador del job. Si no se provee, se genera uno automático. */
  name?: string;
  /** Si el proceso muere, se reinicia automáticamente. */
  autoRestart?: boolean;
}