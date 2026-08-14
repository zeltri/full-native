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
  readonly command: string;
  readonly args: readonly string[];
  readonly kind: "exit" | "spawn";
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;

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