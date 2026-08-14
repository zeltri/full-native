import type { SpawnOptions } from "node:child_process";

/**
 * Opciones para construir un comando antes de ejecutarlo.
 *
 * Extiende las opciones nativas de `child_process.spawn` con campos
 * adicionales para controlar timeout, entrada por stdin y comportamiento
 * ante códigos de salida distintos de cero.
 */
export interface ProcessOptions extends SpawnOptions {
  /** Tiempo máximo de ejecución en ms antes de matar el proceso automáticamente. */
  timeout?: number;
  /** Datos a enviar por stdin al proceso al iniciar la ejecución. */
  input?: string | Buffer;
  /** Si es `true`, lanza un `ProcessError` cuando el código de salida no es 0. */
  rejectOnNonZero?: boolean;
}