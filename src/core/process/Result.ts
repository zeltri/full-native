import { ProcessError } from "./ProcessError.js";

/**
 * Resultado inmutable de una ejecución de comando que ya terminó.
 *
 * Contiene toda la información de la ejecución: stdout, stderr, código de
 * salida, señal recibida y duración. Proporciona métodos utilitarios para
 * inspeccionar y transformar el resultado.
 */
export class Result {
  /**
   * Crea un nuevo resultado de ejecución.
   *
   * @param command - Comando ejecutado.
   * @param args - Argumentos pasados al comando.
   * @param stdout - Salida estándar capturada como texto.
   * @param stderr - Salida de error capturada como texto.
   * @param exitCode - Código de salida del proceso (`null` si fue terminado por señal).
   * @param signal - Señal que terminó el proceso, o `null` si terminó naturalmente.
   * @param durationMs - Duración total de la ejecución en milisegundos.
   */
  constructor(
    public readonly command: string,
    public readonly args: readonly string[],
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly exitCode: number | null,
    public readonly signal: NodeJS.Signals | null,
    public readonly durationMs: number,
  ) {}

  /** `true` si el proceso terminó con código de salida 0. */
  get ok(): boolean {
    return this.exitCode === 0;
  }

  /** `true` si el proceso terminó con código de salida distinto de 0. */
  get failed(): boolean {
    return !this.ok;
  }

  /**
   * Combina stdout y stderr en un solo string, eliminando espacios
   * en blanco al final.
   */
  get output(): string {
    return (this.stdout + this.stderr).trimEnd();
  }

  /**
   * Devuelve **todas** las líneas de stdout separadas por saltos de línea
   * (`\n` o `\r\n`), incluidas las vacías (comportamiento estándar de
   * `String.split`). Una salida terminada en salto de línea produce una
   * línea vacía al final.
   */
  get lines(): string[] {
    return this.stdout.split(/\r?\n/);
  }

  /**
   * Devuelve las líneas no vacías de stdout separadas por saltos de línea
   * (`\n` o `\r\n`). Ignora las líneas vacías, incluida la que produce la
   * salida terminada en salto de línea.
   */
  get nonEmptyLines(): string[] {
    return this.stdout.split(/\r?\n/).filter(Boolean);
  }

  /**
   * Parsea stdout como JSON y lo devuelve como tipo `T`.
   *
   * **Nota:** Esta función realiza un *cast* sin verificación de tipos en
   * tiempo de ejecución. La validez del tipo `T` es responsabilidad del
   * llamador; si la salida no es JSON válido, `JSON.parse` lanzará un
   * `SyntaxError`.
   *
   * @returns El JSON parseado, con tipo `T` (por defecto `unknown`).
   */
  json<T = unknown>(): T {
    return JSON.parse(this.stdout) as T;
  }

  /**
   * Lanza un `ProcessError` si el comando falló (código de salida != 0).
   *
   * @returns `this` si el comando fue exitoso, permitiendo encadenamiento.
   * @throws {ProcessError} Cuando `failed` es `true`.
   */
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