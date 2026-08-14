/** Opciones de configuración para una sesión de Shell. */
export interface ShellConfig {
  /** Directorio de trabajo inicial. Por defecto, `process.cwd()`. */
  cwd?: string;
  /** Variables de entorno adicionales. */
  env?: Record<string, string>;
  /** Shell a utilizar. Por defecto, `/bin/sh` o `cmd.exe`. */
  shell?: string;
}

/** Entrada del historial de comandos ejecutados. */
export interface HistoryItem {
  command: string;
  startedAt: Date;
  durationMs: number;
  exitCode: number | null;
  ok: boolean;
}

/** Opciones para lanzar un job en segundo plano. */
export interface JobOptions {
  /** Nombre identificador del job. Si no se provee, se genera uno automático. */
  name?: string;
  /** Si el proceso muere, se reinicia automáticamente. */
  autoRestart?: boolean;
}