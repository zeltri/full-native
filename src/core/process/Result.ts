import { ProcessError } from "./ProcessError.js";

/** Resultado de una ejecución de comando que ya terminó. */
export class Result {
  constructor(
    public readonly command: string,
    public readonly args: readonly string[],
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly exitCode: number | null,
    public readonly signal: NodeJS.Signals | null,
    public readonly durationMs: number,
  ) {}

  get ok(): boolean {
    return this.exitCode === 0;
  }

  get failed(): boolean {
    return !this.ok;
  }

  /** Combina stdout y stderr en un solo string. */
  get output(): string {
    return (this.stdout + this.stderr).trimEnd();
  }

  /** Líneas de stdout sin vacías al final. */
  get lines(): string[] {
    return this.stdout.split(/\r?\n/).filter(Boolean);
  }

  /** Devuelve stdout parseado como JSON. */
  json<T = unknown>(): T {
    return JSON.parse(this.stdout) as T;
  }

  /** Lanza un ProcessError si el comando falló. */
  throwIfFailed(): this {
    if (this.failed) {
      throw new ProcessError(this.command, this.args, "exit", {
        exitCode: this.exitCode,
        signal: this.signal,
        stderr: this.stderr,
      });
    }
    return this;
  }
}