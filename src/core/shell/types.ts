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