import { Command } from "./Command.js";
import { LiveProcess } from "./LiveProcess.js";
import { Result } from "./Result.js";
import type { ProcessOptions } from "./types.js";

/**
 * Facade para ejecutar y manejar procesos nativos con una API cómoda.
 *
 * @example
 * const proc = new Process();
 *
 * // Ejecución simple
 * const result = await proc.run("echo", "hola");
 * console.log(result.stdout); // "hola\n"
 *
 * // Builder fluido
 * const out = await proc.cmd("git")
 *   .withArgs("log", "--oneline")
 *   .in("/my/repo")
 *   .output();
 *
 * // Proceso interactivo
 * const p = proc.spawn("node", "-i");
 * p.sendLine("1 + 1");
 * p.endInput();
 * await p.wait();
 */
export class Process {
  /**
   * Crea un builder de comando (`Command`) sin ejecutarlo.
   *
   * @param command - Comando a ejecutar.
   * @param args - Argumentos del comando.
   * @returns Un nuevo `Command` listo para configurar y ejecutar.
   */
  cmd(command: string, ...args: string[]): Command {
    return new Command(command, args);
  }

  /**
   * Ejecuta un comando, espera a que termine y devuelve el resultado.
   *
   * @param command - Comando a ejecutar.
   * @param args - Argumentos del comando.
   * @returns El `Result` de la ejecución.
   */
  async run(command: string, ...args: string[]): Promise<Result> {
    return new Command(command, args).run();
  }

  /**
   * Ejecuta un comando y devuelve solo stdout, con espacios en blanco
   * eliminados de los extremos (trim).
   *
   * @param command - Comando a ejecutar.
   * @param args - Argumentos del comando.
   * @returns El stdout del comando ya trimado.
   */
  async output(command: string, ...args: string[]): Promise<string> {
    return (await this.run(command, ...args)).stdout.trim();
  }

  /**
   * Ejecuta un script de shell interpretado por el shell del sistema
   * (`/bin/sh` en Unix, `cmd.exe` en Windows) y espera a que termine.
   *
   * @param script - Script de shell a ejecutar.
   * @param options - Opciones de ejecución del proceso.
   * @returns El `Result` de la ejecución.
   */
  async shell(script: string, options: Omit<ProcessOptions, never> = {}): Promise<Result> {
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const flag = isWin ? "/c" : "-c";
    return new Command(shell, [flag, script], options).run();
  }

  /**
   * Inicia un proceso y devuelve un `LiveProcess` para interactuar en vivo.
   *
   * @param command - Comando a ejecutar.
   * @param args - Argumentos del comando.
   * @returns Un `LiveProcess` que envuelve el proceso hijo recién iniciado.
   */
  spawn(command: string, ...args: string[]): LiveProcess {
    return new Command(command, args).spawn();
  }

  /**
   * Inicia un proceso con opciones de ejecución y devuelve un `LiveProcess`.
   * La firma es *options-first*: las opciones se pasan antes que el comando.
   *
   * @param options - Opciones de ejecución del proceso.
   * @param command - Comando a ejecutar.
   * @param args - Argumentos del comando.
   * @returns Un `LiveProcess` que envuelve el proceso hijo recién iniciado.
   */
  spawnWith(options: ProcessOptions, command: string, ...args: string[]): LiveProcess {
    return new Command(command, args, options).spawn();
  }

  /**
   * Ejecuta un script de shell interpretado por el shell del sistema
   * (`/bin/sh` en Unix, `cmd.exe` en Windows) y devuelve un `LiveProcess`
   * interactivo para comunicarse en vivo con el proceso.
   *
   * @param script - Script de shell a ejecutar.
   * @param options - Opciones de ejecución del proceso.
   * @returns Un `LiveProcess` que envuelve el proceso hijo recién iniciado.
   */
  spawnScript(script: string, options: ProcessOptions = {}): LiveProcess {
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const flag = isWin ? "/c" : "-c";
    return new Command(shell, [flag, script], options).spawn();
  }

  /**
   * Comprueba si un comando existe en el PATH del sistema.
   * Usa `where` en Windows y `which` en Unix.
   *
   * @param command - Nombre del comando a buscar.
   * @returns `true` si el comando existe y es ejecutable, `false` en caso contrario.
   */
  async exists(command: string): Promise<boolean> {
    const isWin = process.platform === "win32";
    const check = isWin ? "where" : "which";
    const result = await this.run(check, command);
    return result.ok;
  }

  /**
   * Devuelve la ruta completa del comando encontrado en el PATH, o `null`
   * si no existe. Usa `where` en Windows y `which` en Unix; si hay múltiples
   * resultados, devuelve el primero.
   *
   * @param command - Nombre del comando a buscar.
   * @returns La ruta completa del comando, o `null` si no se encuentra.
   */
  async which(command: string): Promise<string | null> {
    const isWin = process.platform === "win32";
    const check = isWin ? "where" : "which";
    const result = await this.run(check, command);
    if (!result.ok) return null;
    const path = result.stdout.trim().split(/\r?\n/)[0];
    return path || null;
  }
}