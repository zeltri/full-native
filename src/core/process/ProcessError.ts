/**
 * Error estructurado para fallos de ejecución de procesos.
 *
 * Se lanza cuando un comando termina con código de salida != 0
 * o cuando no se puede iniciar el proceso (ENOENT, EACCES, etc.).
 *
 * @example
 * try {
 *   await proc.run("nonexistent-cmd");
 * } catch (err) {
 *   if (err instanceof ProcessError) {
 *     console.log(err.command);   // "nonexistent-cmd"
 *     console.log(err.kind);      // "spawn" | "exit"
 *     console.log(err.exitCode);  // null si fue spawn, number si fue exit
 *   }
 * }
 */
export class ProcessError extends Error {
  /** Comando que originó el error. */
  readonly command: string;
  /** Argumentos pasados al comando. */
  readonly args: readonly string[];
  /**
   * Tipo de fallo: `"spawn"` si el proceso no pudo iniciarse (p. ej. ENOENT,
   * EACCES) o `"exit"` si terminó con código de salida distinto de 0.
   */
  readonly kind: "exit" | "spawn";
  /** Código de salida del proceso; `null` si fue un fallo de spawn o terminó por señal. */
  readonly exitCode: number | null;
  /** Señal que terminó el proceso, o `null` si no fue por señal. */
  readonly signal: NodeJS.Signals | null;
  /** Salida de error (stderr) capturada, o cadena vacía si no hubo. */
  readonly stderr: string;

  /**
   * Crea un `ProcessError`.
   *
   * @param command - Comando que originó el error.
   * @param args - Argumentos pasados al comando.
   * @param kind - Tipo de fallo: `"spawn"` o `"exit"`.
   * @param options - Datos adicionales del fallo:
   *   `exitCode`, `signal`, `stderr` y `cause` (error nativo original).
   */
  constructor(
    command: string,
    args: readonly string[],
    kind: "exit" | "spawn",
    options: {
      exitCode?: number | null;
      signal?: NodeJS.Signals | null;
      stderr?: string;
      cause?: Error;
    } = {},
  ) {
    const exitCode = options.exitCode ?? null;
    const signal = options.signal ?? null;
    const stderr = options.stderr ?? "";

    const detail =
      kind === "spawn"
        ? `failed to spawn: ${options.cause?.message ?? "unknown error"}`
        : `exited with code ${exitCode}${signal ? ` (signal: ${signal})` : ""}`;

    super(`Command "${command}" ${detail}${stderr ? `: ${stderr}` : ""}`, {
      cause: options.cause,
    });

    this.name = "ProcessError";
    this.command = command;
    this.args = args;
    this.kind = kind;
    this.exitCode = exitCode;
    this.signal = signal;
    this.stderr = stderr;
  }
}