import { LiveProcess, type Result } from "../process/index.js";
import type { JobOptions } from "./types.js";

/**
 * Representa un proceso en segundo plano registrado en una sesión de `Shell`.
 *
 * A diferencia de un `LiveProcess` suelto, un `Job` tiene:
 * - **`name`**: identificador para referenciarlo desde `Shell.jobs`.
 * - **`autoRestart`**: se reinicia solo si el proceso muere.
 * - **Lifecycle atado a la sesión**: `Shell.killAll()` lo mata automáticamente.
 *
 * Expone toda la API de `LiveProcess` (stdin/stdout/kill/wait/onOutput/etc.)
 * más la gestión de reinicio y nombre.
 */
export class Job {
  /** Identificador del job en el registro de la sesión (`Shell.jobs`). */
  readonly name: string;
  /** El `LiveProcess` subyacente que el job envuelve. */
  readonly process: LiveProcess;
  /** Script original que se ejecuta (tras resolver aliases). */
  readonly script: string;
  /** Si el proceso muere, se reinicia automáticamente. */
  readonly autoRestart: boolean;

  private _restartCount = 0;
  private readonly _onRestart: Set<(job: Job) => void> = new Set();
  private _disposed = false;

  /**
   * Crea un nuevo job a partir de un `LiveProcess`.
   *
   * @param process - El `LiveProcess` a envolver.
   * @param script - Script que se ejecuta (para reinicios).
   * @param options - Opciones del job (`name`, `autoRestart`).
   */
  constructor(
    process: LiveProcess,
    script: string,
    options: JobOptions = {},
  ) {
    this.name = options.name ?? `job-${process.pid ?? Date.now()}`;
    this.process = process;
    this.script = script;
    this.autoRestart = options.autoRestart ?? false;
  }

  /** PID del proceso subyacente, o `undefined` si aún no tiene. */
  get pid(): number | undefined {
    return this.process.pid;
  }

  /** `true` si el proceso está en ejecución. */
  get running(): boolean {
    return this.process.running;
  }

  /** `true` si el proceso ya terminó. */
  get ended(): boolean {
    return this.process.ended;
  }

  /** Código de salida del proceso (`null` si no terminó o fue por señal). */
  get exitCode(): number | null {
    return this.process.exitCode;
  }

  /** `true` si el proceso fue detenido explícitamente (distingue kill vs salida natural). */
  get stopped(): boolean {
    return this.process.stopped;
  }

  /** Tiempo transcurrido desde el inicio, en milisegundos. */
  get elapsed(): number {
    return this.process.elapsed;
  }

  /** Señal que terminó el proceso, o `null` si terminó naturalmente. */
  get signal(): NodeJS.Signals | null {
    return this.process.signal;
  }

  /** Comando ejecutado. */
  get command(): string {
    return this.process.command;
  }

  /** Argumentos pasados al comando. */
  get args(): readonly string[] {
    return this.process.args;
  }

  /** Fecha y hora de inicio del proceso. */
  get startedAt(): Date {
    return this.process.startedAt;
  }

  /** Cantidad de veces que el job fue reiniciado vía `autoRestart`. */
  get restartCount(): number {
    return this._restartCount;
  }

  /** Stream de entrada estándar del proceso. */
  get stdin() {
    return this.process.stdin;
  }

  /** Stream de salida estándar del proceso. */
  get stdout() {
    return this.process.stdout;
  }

  /** Stream de error estándar del proceso. */
  get stderr() {
    return this.process.stderr;
  }

  /**
   * Envía una señal al proceso y lo marca como dispuesto (no se reiniciará).
   *
   * @param signal - Señal a enviar (por defecto `SIGTERM`).
   * @returns `true` si la señal fue entregada.
   */
  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this._disposed = true;
    return this.process.kill(signal);
  }

  /**
   * Fuerza la terminación del proceso (SIGKILL) y lo marca como dispuesto.
   *
   * @returns `true` si la señal fue entregada.
   */
  forceKill(): boolean {
    this._disposed = true;
    return this.process.forceKill();
  }

  /**
   * Escribe datos al stdin del proceso.
   *
   * @param data - Datos a escribir (string o Buffer).
   * @returns `true` si se escribió correctamente.
   */
  write(data: string | Buffer): boolean {
    return this.process.write(data);
  }

  /**
   * Escribe una línea al stdin del proceso (añade `\n`).
   *
   * @param line - Línea a escribir.
   * @returns `true` si se escribió correctamente.
   */
  sendLine(line: string): boolean {
    return this.process.sendLine(line);
  }

  /** Cierra el stdin del proceso. */
  endInput(): void {
    this.process.endInput();
  }

  /**
   * Registra un callback para cada chunk de stdout.
   *
   * @param callback - Función a ejecutar con cada chunk.
   * @returns `this` para encadenamiento.
   */
  onStdout(callback: (chunk: Buffer) => void): this {
    this.process.onStdout(callback);
    return this;
  }

  /**
   * Registra un callback para cada chunk de stderr.
   *
   * @param callback - Función a ejecutar con cada chunk.
   * @returns `this` para encadenamiento.
   */
  onStderr(callback: (chunk: Buffer) => void): this {
    this.process.onStderr(callback);
    return this;
  }

  /**
   * Registra un callback para cada chunk de stdout o stderr (combinados).
   *
   * @param callback - Función a ejecutar con cada chunk.
   * @returns `this` para encadenamiento.
   */
  onOutput(callback: (chunk: Buffer) => void): this {
    this.process.onOutput(callback);
    return this;
  }

  /**
   * Registra un callback que se ejecuta cuando el proceso termina.
   *
   * @param callback - Función a ejecutar con el resultado.
   * @returns `this` para encadenamiento.
   */
  onExit(callback: (result: Result) => void): this {
    this.process.onExit(callback);
    return this;
  }

  /**
   * Registra un callback que se ejecuta cuando el job se reinicia vía `autoRestart`.
   *
   * @param callback - Función a ejecutar con el job reiniciado.
   * @returns `this` para encadenamiento.
   */
  onRestart(callback: (job: Job) => void): this {
    this._onRestart.add(callback);
    return this;
  }

  /**
   * Espera a que el proceso termine y devuelve el resultado.
   *
   * @returns El resultado de la ejecución.
   */
  async wait(): Promise<Result> {
    return this.process.wait();
  }

  /**
   * Alias de `wait()`. Espera a que el proceso termine y devuelve el resultado.
   *
   * @returns El resultado de la ejecución.
   */
  async result(): Promise<Result> {
    return this.wait();
  }

  /**
   * Reemplaza el `LiveProcess` subyacente (interno, usado por `Shell` para `autoRestart`).
   * Incrementa `restartCount` y dispara los callbacks registrados en `onRestart`.
   *
   * @internal
   * @param process - El nuevo `LiveProcess` que reemplaza al actual.
   */
  _replace(process: LiveProcess): void {
    (this as { process: LiveProcess }).process = process;
    this._restartCount++;
    for (const cb of this._onRestart) cb(this);
  }

  /** @internal Indica si el job fue dispuesto (no debe reiniciarse). */
  get _disposed_(): boolean {
    return this._disposed;
  }
}