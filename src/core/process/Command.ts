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

  /**
   * Crea un nuevo `Command`.
   *
   * @param command - Comando a ejecutar.
   * @param args - Argumentos del comando (por defecto, vacío).
   * @param options - Opciones de ejecución (por defecto, vacío).
   */
  constructor(command: string, args: readonly string[] = [], options: ProcessOptions = {}) {
    this._command = command;
    this._args = args;
    this._options = options;
  }

  /** Comando a ejecutar. */
  get command(): string {
    return this._command;
  }

  /** Argumentos del comando. */
  get args(): readonly string[] {
    return this._args;
  }

  /**
   * Crea una nueva instancia de `Command` con argumentos adicionales
   * añadidos a los existentes.
   *
   * @param args - Argumentos a añadir.
   * @returns Un nuevo `Command` inmutable con los argumentos combinados.
   */
  withArgs(...args: string[]): Command {
    return new Command(this._command, [...this._args, ...args], this._options);
  }

  /**
   * Crea una nueva instancia de `Command` cambiando el directorio de trabajo.
   *
   * @param cwd - Ruta del directorio de trabajo.
   * @returns Un nuevo `Command` inmutable con el `cwd` actualizado.
   */
  in(cwd: string): Command {
    return new Command(this._command, this._args, { ...this._options, cwd });
  }

  /**
   * Crea una nueva instancia de `Command` con variables de entorno adicionales,
   * fusionadas con las existentes (o con `process.env` si no se habían definido).
   *
   * @param env - Variables de entorno a añadir o sobrescribir.
   * @returns Un nuevo `Command` inmutable con el entorno actualizado.
   */
  withEnv(env: Record<string, string>): Command {
    const baseEnv = this._options.env ?? process.env;
    return new Command(this._command, this._args, {
      ...this._options,
      env: { ...baseEnv, ...env },
    });
  }

  /**
   * Crea una nueva instancia de `Command` con un timeout en milisegundos.
   * Al expirar, el proceso se matará con `SIGTERM`.
   *
   * @param ms - Tiempo máximo de ejecución en milisegundos.
   * @returns Un nuevo `Command` inmutable con el timeout configurado.
   */
  withTimeout(ms: number): Command {
    return new Command(this._command, this._args, { ...this._options, timeout: ms });
  }

  /**
   * Crea una nueva instancia de `Command` que envía datos por stdin al iniciar.
   *
   * @param data - Datos a enviar por stdin (texto o buffer).
   * @returns Un nuevo `Command` inmutable con la entrada configurada.
   */
  withInput(data: string | Buffer): Command {
    return new Command(this._command, this._args, { ...this._options, input: data });
  }

  /**
   * Crea una nueva instancia de `Command` que lanza un `ProcessError` si el
   * proceso termina con código de salida distinto de 0. Esto hace que
   * `run()` rechace la promesa en lugar de devolver un `Result` fallido.
   *
   * @returns Un nuevo `Command` inmutable con `rejectOnNonZero` activado.
   */
  throwOnError(): Command {
    return new Command(this._command, this._args, {
      ...this._options,
      rejectOnNonZero: true,
    });
  }

  /**
   * Inicia el comando y devuelve un `LiveProcess` para interactuar en vivo
   * con stdin/stdout/stderr.
   *
   * @returns Un `LiveProcess` que envuelve el proceso hijo recién iniciado.
   */
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

  /**
   * Ejecuta el comando, espera a que termine y devuelve el resultado.
   * Si se configuró `throwOnError`, rechaza con `ProcessError` si el código
   * de salida no es 0.
   *
   * @returns El `Result` de la ejecución.
   * @throws {ProcessError} Si `rejectOnNonZero` está activo y el código de salida no es 0.
   */
  async run(): Promise<Result> {
    const handle = this.spawn();
    const result = await handle.wait();
    if (this._options.rejectOnNonZero) result.throwIfFailed();
    return result;
  }

  /**
   * Ejecuta el comando y devuelve solo stdout, con espacios en blanco
   * eliminados de los extremos (trim).
   *
   * @returns El stdout del comando ya trimado.
   */
  async output(): Promise<string> {
    return (await this.run()).stdout.trim();
  }
}