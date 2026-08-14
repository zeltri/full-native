import { type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { Result } from "./Result.js";
import { ProcessError } from "./ProcessError.js";

/**
 * Representa un proceso en ejecución (o ya finalizado).
 * Permite interactuar con su stdin/stdout/stderr en vivo.
 */
export class LiveProcess {
  readonly child: ChildProcess;
  readonly command: string;
  readonly args: readonly string[];
  readonly startedAt: Date;
  private readonly _stdoutChunks: Buffer[] = [];
  private readonly _stderrChunks: Buffer[] = [];
  private _exitCode: number | null = null;
  private _signal: NodeJS.Signals | null = null;
  private _ended = false;
  private _killed = false;
  readonly onExitPromise: Promise<Result>;

  constructor(command: string, args: readonly string[], child: ChildProcess) {
    this.command = command;
    this.args = args;
    this.child = child;
    this.startedAt = new Date();

    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => this._stdoutChunks.push(chunk));
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => this._stderrChunks.push(chunk));
    }

    this.onExitPromise = new Promise<Result>((resolve, reject) => {
      child.on("error", (err: Error) => {
        this._ended = true;
        reject(
          new ProcessError(this.command, this.args, "spawn", { cause: err }),
        );
      });
      child.on("exit", (code, signal) => {
        this._exitCode = code;
        this._signal = signal;
        this._ended = true;
        const durationMs = Date.now() - this.startedAt.getTime();
        resolve(
          new Result(
            this.command,
            this.args,
            Buffer.concat(this._stdoutChunks).toString("utf8"),
            Buffer.concat(this._stderrChunks).toString("utf8"),
            code,
            signal,
            durationMs,
          ),
        );
      });
    });
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get running(): boolean {
    return !this._ended;
  }

  get ended(): boolean {
    return this._ended;
  }

  get exitCode(): number | null {
    return this._exitCode;
  }

  get signal(): NodeJS.Signals | null {
    return this._signal;
  }

  /** `true` si el proceso fue matado via `kill()` o `forceKill()`. */
  get stopped(): boolean {
    return this._killed;
  }

  /** Milisegundos transcurridos desde el inicio (en vivo). */
  get elapsed(): number {
    return Date.now() - this.startedAt.getTime();
  }

  get stdout(): Readable | null {
    return this.child.stdout;
  }

  get stderr(): Readable | null {
    return this.child.stderr;
  }

  get stdin(): Writable | null {
    return this.child.stdin;
  }

  /** Stream combinado de stdout y stderr. */
  get combinedOutput(): Readable {
    return Readable.from(
      (async function* (self: LiveProcess) {
        for (const chunk of self._stdoutChunks) yield chunk;
        for (const chunk of self._stderrChunks) yield chunk;
      })(this),
    );
  }

  /** Escribe en stdin del proceso. */
  write(data: string | Buffer): boolean {
    if (!this.child.stdin) return false;
    return this.child.stdin.write(data);
  }

  /** Envía una línea (con salto) a stdin. */
  sendLine(line: string): boolean {
    return this.write(line + "\n");
  }

  /** Cierra stdin señalizando fin de entrada. */
  endInput(): void {
    this.child.stdin?.end();
  }

  /** Espera a que el proceso termine y devuelve el resultado. */
  async wait(): Promise<Result> {
    return this.onExitPromise;
  }

  /** Envía una señal al proceso (por defecto SIGTERM). */
  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this._killed = true;
    return this.child.kill(signal);
  }

  /** Fuerza la terminación inmediata (SIGKILL). */
  forceKill(): boolean {
    this._killed = true;
    return this.child.kill("SIGKILL");
  }

  /** Ejecuta un callback cuando el proceso termina. */
  onExit(callback: (result: Result) => void): this {
    this.onExitPromise.then(callback);
    return this;
  }

  /** Ejecuta un callback por cada chunk de stdout. */
  onStdout(callback: (chunk: Buffer) => void): this {
    this.child.stdout?.on("data", callback);
    return this;
  }

  /** Ejecuta un callback por cada chunk de stderr. */
  onStderr(callback: (chunk: Buffer) => void): this {
    this.child.stderr?.on("data", callback);
    return this;
  }

  /** Ejecuta un callback por cada chunk de stdout o stderr (unificado). */
  onOutput(callback: (chunk: Buffer) => void): this {
    this.child.stdout?.on("data", callback);
    this.child.stderr?.on("data", callback);
    return this;
  }
}