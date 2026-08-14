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
  /** Crea un builder de comando sin ejecutarlo. */
  cmd(command: string, ...args: string[]): Command {
    return new Command(command, args);
  }

  /** Ejecuta un comando, espera a que termine y devuelve el resultado. */
  async run(command: string, ...args: string[]): Promise<Result> {
    return new Command(command, args).run();
  }

  /** Ejecuta un comando y devuelve solo stdout (trim). */
  async output(command: string, ...args: string[]): Promise<string> {
    return (await this.run(command, ...args)).stdout.trim();
  }

  /** Ejecuta un comando en shell (interpretado por el shell del sistema). */
  async shell(script: string, options: Omit<ProcessOptions, never> = {}): Promise<Result> {
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const flag = isWin ? "/c" : "-c";
    return new Command(shell, [flag, script], options).run();
  }

  /** Inicia un proceso y devuelve un LiveProcess para interactuar en vivo. */
  spawn(command: string, ...args: string[]): LiveProcess {
    return new Command(command, args).spawn();
  }

  /** Inicia un proceso con opciones y devuelve un LiveProcess. */
  spawnWith(options: ProcessOptions, command: string, ...args: string[]): LiveProcess {
    return new Command(command, args, options).spawn();
  }

  /** Ejecuta un script de shell y devuelve un LiveProcess interactivo. */
  spawnScript(script: string, options: ProcessOptions = {}): LiveProcess {
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const flag = isWin ? "/c" : "-c";
    return new Command(shell, [flag, script], options).spawn();
  }

  /** Devuelve true si el comando existe en el PATH. */
  async exists(command: string): Promise<boolean> {
    const isWin = process.platform === "win32";
    const check = isWin ? "where" : "which";
    const result = await this.run(check, command);
    return result.ok;
  }

  /** Devuelve la ruta completa del comando o null si no existe. */
  async which(command: string): Promise<string | null> {
    const isWin = process.platform === "win32";
    const check = isWin ? "where" : "which";
    const result = await this.run(check, command);
    if (!result.ok) return null;
    const path = result.stdout.trim().split(/\r?\n/)[0];
    return path || null;
  }
}