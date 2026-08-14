import { spawn } from "node:child_process";
import { LiveProcess } from "./LiveProcess.js";
import { Result } from "./Result.js";
import type { ProcessOptions } from "./types.js";

/**
 * Builder inmutable para construir un comando antes de ejecutarlo.
 * Permite configurar opciones de forma fluida y luego ejecutar.
 */
export class Command {
  private readonly _command: string;
  private readonly _args: readonly string[];
  private readonly _options: ProcessOptions;

  constructor(command: string, args: readonly string[] = [], options: ProcessOptions = {}) {
    this._command = command;
    this._args = args;
    this._options = options;
  }

  get command(): string {
    return this._command;
  }

  get args(): readonly string[] {
    return this._args;
  }

  /** Crea una nueva instancia con argumentos adicionales. */
  withArgs(...args: string[]): Command {
    return new Command(this._command, [...this._args, ...args], this._options);
  }

  /** Crea una nueva instancia cambiando el directorio de trabajo. */
  in(cwd: string): Command {
    return new Command(this._command, this._args, { ...this._options, cwd });
  }

  /** Crea una nueva instancia con variables de entorno adicionales. */
  withEnv(env: Record<string, string>): Command {
    const baseEnv = this._options.env ?? process.env;
    return new Command(this._command, this._args, {
      ...this._options,
      env: { ...baseEnv, ...env },
    });
  }

  /** Crea una nueva instancia con un timeout en ms. */
  withTimeout(ms: number): Command {
    return new Command(this._command, this._args, { ...this._options, timeout: ms });
  }

  /** Crea una nueva instancia que envía datos por stdin al iniciar. */
  withInput(data: string | Buffer): Command {
    return new Command(this._command, this._args, { ...this._options, input: data });
  }

  /** Crea una nueva instancia que lanza error si sale con código != 0. */
  throwOnError(): Command {
    return new Command(this._command, this._args, {
      ...this._options,
      rejectOnNonZero: true,
    });
  }

  /** Ejecuta el comando y devuelve un LiveProcess para interactuar en vivo. */
  spawn(): LiveProcess {
    const { timeout, input, rejectOnNonZero, ...spawnOpts } = this._options;
    const child = spawn(this._command, [...this._args], spawnOpts);
    const handle = new LiveProcess(this._command, this._args, child);

    if (input !== undefined && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }

    if (timeout) {
      setTimeout(() => {
        if (handle.running) handle.kill("SIGTERM");
      }, timeout).unref();
    }

    return handle;
  }

  /** Ejecuta el comando, espera a que termine y devuelve el resultado. */
  async run(): Promise<Result> {
    const handle = this.spawn();
    const result = await handle.wait();
    if (this._options.rejectOnNonZero) result.throwIfFailed();
    return result;
  }

  /** Ejecuta el comando y devuelve solo stdout (trim). */
  async output(): Promise<string> {
    return (await this.run()).stdout.trim();
  }
}