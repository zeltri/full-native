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
  readonly name: string;
  readonly process: LiveProcess;
  readonly script: string;
  readonly autoRestart: boolean;

  private _restartCount = 0;
  private readonly _onRestart: Set<(job: Job) => void> = new Set();
  private _disposed = false;

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

  get pid(): number | undefined {
    return this.process.pid;
  }

  get running(): boolean {
    return this.process.running;
  }

  get ended(): boolean {
    return this.process.ended;
  }

  get exitCode(): number | null {
    return this.process.exitCode;
  }

  get stopped(): boolean {
    return this.process.stopped;
  }

  get elapsed(): number {
    return this.process.elapsed;
  }

  get signal(): NodeJS.Signals | null {
    return this.process.signal;
  }

  get command(): string {
    return this.process.command;
  }

  get args(): readonly string[] {
    return this.process.args;
  }

  get startedAt(): Date {
    return this.process.startedAt;
  }

  get restartCount(): number {
    return this._restartCount;
  }

  get stdin() {
    return this.process.stdin;
  }

  get stdout() {
    return this.process.stdout;
  }

  get stderr() {
    return this.process.stderr;
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this._disposed = true;
    return this.process.kill(signal);
  }

  forceKill(): boolean {
    this._disposed = true;
    return this.process.forceKill();
  }

  write(data: string | Buffer): boolean {
    return this.process.write(data);
  }

  sendLine(line: string): boolean {
    return this.process.sendLine(line);
  }

  endInput(): void {
    this.process.endInput();
  }

  onStdout(callback: (chunk: Buffer) => void): this {
    this.process.onStdout(callback);
    return this;
  }

  onStderr(callback: (chunk: Buffer) => void): this {
    this.process.onStderr(callback);
    return this;
  }

  onOutput(callback: (chunk: Buffer) => void): this {
    this.process.onOutput(callback);
    return this;
  }

  onExit(callback: (result: Result) => void): this {
    this.process.onExit(callback);
    return this;
  }

  /** Callback que se ejecuta cuando el job se reinicia via autoRestart. */
  onRestart(callback: (job: Job) => void): this {
    this._onRestart.add(callback);
    return this;
  }

  /** Espera a que termine y devuelve el resultado. */
  async wait(): Promise<Result> {
    return this.process.wait();
  }

  /** Alias de `wait()`. */
  async result(): Promise<Result> {
    return this.wait();
  }

  /** Reemplaza el LiveProcess subyacente (usado por Shell para autoRestart). */
  _replace(process: LiveProcess): void {
    (this as { process: LiveProcess }).process = process;
    this._restartCount++;
    for (const cb of this._onRestart) cb(this);
  }

  get _disposed_(): boolean {
    return this._disposed;
  }
}