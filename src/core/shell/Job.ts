import { LiveProcess, type Result } from "../process/index.js";

/**
 * Representa un comando ejecutándose en segundo plano.
 * Envuelve un `LiveProcess` y permite obtener el resultado cuando termine.
 */
export class Job {
  readonly process: LiveProcess;

  constructor(handle: LiveProcess) {
    this.process = handle;
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
    return this.process.kill(signal);
  }

  forceKill(): boolean {
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

  onExit(callback: (result: Result) => void): this {
    this.process.onExit(callback);
    return this;
  }

  /** Espera a que termine y devuelve el resultado. */
  async result(): Promise<Result> {
    return this.process.wait();
  }

  /** Alias de `result()`. */
  async wait(): Promise<Result> {
    return this.result();
  }
}