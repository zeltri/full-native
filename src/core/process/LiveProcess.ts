import { type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { Result } from "./Result.js";
import { ProcessError } from "./ProcessError.js";

/**
 * Representa un proceso en ejecución (o ya finalizado).
 * Permite interactuar con su stdin/stdout/stderr en vivo.
 */
export class LiveProcess {
  /** Proceso hijo nativo de `child_process`. */
  readonly child: ChildProcess;
  /** Comando ejecutado. */
  readonly command: string;
  /** Argumentos pasados al comando. */
  readonly args: readonly string[];
  /** Fecha de inicio de la ejecución. */
  readonly startedAt: Date;
  private readonly _stdoutChunks: Buffer[] = [];
  private readonly _stderrChunks: Buffer[] = [];
  private _exitCode: number | null = null;
  private _signal: NodeJS.Signals | null = null;
  private _ended = false;
  private _killed = false;
  /**
   * Promesa que se resuelve con un `Result` cuando el proceso termina,
   * o se rechaza con un `ProcessError` si el proceso no pudo iniciarse.
   */
  readonly onExitPromise: Promise<Result>;

  /**
   * Crea un `LiveProcess` a partir de un `ChildProcess` ya iniciado.
   *
   * No se debe usar directamente; usar `Command.spawn()` o `Process.spawn()`.
   *
   * @param command - Comando ejecutado.
   * @param args - Argumentos pasados al comando.
   * @param child - Proceso hijo nativo de `child_process`.
   */
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

  /** Identificador del proceso asignado por el sistema operativo, o `undefined` si no se inició. */
  get pid(): number | undefined {
    return this.child.pid;
  }

  /** `true` mientras el proceso sigue en ejecución. */
  get running(): boolean {
    return !this._ended;
  }

  /** `true` si el proceso ya terminó (naturalmente o por señal). */
  get ended(): boolean {
    return this._ended;
  }

  /** Código de salida del proceso, o `null` si aún no termina o fue terminado por señal. */
  get exitCode(): number | null {
    return this._exitCode;
  }

  /** Señal que terminó el proceso, o `null` si no fue por señal. */
  get signal(): NodeJS.Signals | null {
    return this._signal;
  }

  /**
   * `true` si el proceso fue matado explícitamente vía `kill()` o `forceKill()`.
   *
   * Se distingue de una terminación natural: este valor solo se vuelve
   * `true` cuando el usuario llamó manualmente a un método de terminación.
   */
  get stopped(): boolean {
    return this._killed;
  }

  /** Milisegundos transcurridos desde el inicio del proceso hasta ahora (en vivo). */
  get elapsed(): number {
    return Date.now() - this.startedAt.getTime();
  }

  /** Stream legible de stdout del proceso, o `null` si no está disponible. */
  get stdout(): Readable | null {
    return this.child.stdout;
  }

  /** Stream legible de stderr del proceso, o `null` si no está disponible. */
  get stderr(): Readable | null {
    return this.child.stderr;
  }

  /** Stream escribible de stdin del proceso, o `null` si no está disponible. */
  get stdin(): Writable | null {
    return this.child.stdin;
  }

  /**
   * Stream legible que combina los chunks de stdout y stderr ya capturados
   * en orden: primero todos los de stdout, luego los de stderr.
   */
  get combinedOutput(): Readable {
    return Readable.from(
      (async function* (self: LiveProcess) {
        for (const chunk of self._stdoutChunks) yield chunk;
        for (const chunk of self._stderrChunks) yield chunk;
      })(this),
    );
  }

  /**
   * Escribe datos en stdin del proceso.
   *
   * @param data - Texto o buffer a escribir.
   * @returns `true` si la escritura fue exitosa, `false` si no hay stdin disponible.
   */
  write(data: string | Buffer): boolean {
    if (!this.child.stdin) return false;
    return this.child.stdin.write(data);
  }

  /**
   * Envía una línea a stdin del proceso, añadiendo un salto de línea al final.
   *
   * @param line - Línea de texto a enviar.
   * @returns `true` si la escritura fue exitosa, `false` si no hay stdin disponible.
   */
  sendLine(line: string): boolean {
    return this.write(line + "\n");
  }

  /** Cierra stdin del proceso señalizando fin de entrada (EOF). */
  endInput(): void {
    this.child.stdin?.end();
  }

  /**
   * Espera a que el proceso termine y devuelve el resultado.
   *
   * @returns El `Result` de la ejecución cuando el proceso termina.
   * @throws {ProcessError} Si el proceso no pudo iniciarse (fallo de spawn).
   */
  async wait(): Promise<Result> {
    return this.onExitPromise;
  }

  /**
   * Envía una señal al proceso para terminarlo.
   *
   * @param signal - Señal a enviar (por defecto `SIGTERM`).
   * @returns `true` si la señal se envió correctamente.
   */
  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this._killed = true;
    return this.child.kill(signal);
  }

  /**
   * Fuerza la terminación inmediata del proceso enviando `SIGKILL`.
   *
   * @returns `true` si la señal se envió correctamente.
   */
  forceKill(): boolean {
    this._killed = true;
    return this.child.kill("SIGKILL");
  }

  /**
   * Registra un callback que se ejecuta cuando el proceso termina.
   *
   * @param callback - Función que recibe el `Result` al finalizar.
   * @returns `this` para encadenamiento.
   */
  onExit(callback: (result: Result) => void): this {
    this.onExitPromise.then(callback);
    return this;
  }

  /**
   * Registra un callback que se ejecuta por cada chunk de datos de stdout.
   *
   * @param callback - Función que recibe cada `Buffer` de stdout.
   * @returns `this` para encadenamiento.
   */
  onStdout(callback: (chunk: Buffer) => void): this {
    this.child.stdout?.on("data", callback);
    return this;
  }

  /**
   * Registra un callback que se ejecuta por cada chunk de datos de stderr.
   *
   * @param callback - Función que recibe cada `Buffer` de stderr.
   * @returns `this` para encadenamiento.
   */
  onStderr(callback: (chunk: Buffer) => void): this {
    this.child.stderr?.on("data", callback);
    return this;
  }

  /**
   * Registra un callback unificado que se ejecuta por cada chunk de stdout
   * **o** stderr, sin distinguir el origen.
   *
   * @param callback - Función que recibe cada `Buffer` de stdout o stderr.
   * @returns `this` para encadenamiento.
   */
  onOutput(callback: (chunk: Buffer) => void): this {
    this.child.stdout?.on("data", callback);
    this.child.stderr?.on("data", callback);
    return this;
  }
}