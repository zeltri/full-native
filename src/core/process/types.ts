import type { SpawnOptions } from "node:child_process";

/** Opciones para construir un comando antes de ejecutarlo. */
export interface ProcessOptions extends SpawnOptions {
  /** Tiempo máximo de ejecución en ms antes de matar el proceso. */
  timeout?: number;
  /** Enviar esta entrada por stdin al iniciar. */
  input?: string | Buffer;
  /** Lanzar error si el código de salida no es 0. */
  rejectOnNonZero?: boolean;
}