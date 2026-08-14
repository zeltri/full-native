import {
  Process,
  LiveProcess,
  type Result,
  type ProcessOptions,
} from "../process/index.js";
import { Job } from "./Job.js";
import type { ShellConfig, HistoryItem, JobOptions } from "./types.js";
import * as crypto from "node:crypto";

/**
 * Facade que representa una sesión de shell para ejecutar comandos
 * de forma cómoda. Mantiene estado (cwd, env, aliases, historial) y
 * delega la ejecución a `Process` por debajo.
 *
 * @example
 * const sh = new Shell();
 *
 * // Ejecución simple (shell-interpreted)
 * const result = await sh.run("echo hola && ls -la");
 * console.log(result.stdout);
 *
 * // Tagged template con interpolación segura
 * const name = "mundo";
 * await sh.$`echo hola ${name}`;
 *
 * // Pipeline
 * const r = await sh.pipe("cat file.txt", "grep foo", "wc -l");
 *
 * // Cadena secuencial (stop on error)
 * const results = await sh.chain("npm install", "npm run build", "npm test");
 *
 * // Segundo plano
 * const job = sh.bg("npm run dev");
 * job.onStdout(chunk => process.stdout.write(chunk));
 * const res = await job.result();
 */
export class Shell {
  private readonly _proc: Process;
  private _cwd: string;
  private _env: Record<string, string>;
  private _aliases: Map<string, string> = new Map();
  private _history: HistoryItem[] = [];
  private _jobs: Map<string, Job> = new Map();
  private _cleanupRegistered = false;

  /**
   * Crea una nueva sesión de shell.
   *
   * @param options - Configuración de la sesión (cwd, env, shell).
   */
  constructor(options: ShellConfig = {}) {
    this._proc = new Process();
    this._cwd = options.cwd ?? process.cwd();
    this._env = options.env ?? {};
  }

  // ─── Getters ─────────────────────────────────────────────────────

  /** Directorio de trabajo actual de la sesión. */
  get cwd(): string {
    return this._cwd;
  }

  /** Copia de las variables de entorno de la sesión. */
  get env(): Record<string, string> {
    return { ...this._env };
  }

  /** Copia de los alias definidos como objeto plano. */
  get aliases(): Record<string, string> {
    return Object.fromEntries(this._aliases);
  }

  /** Historial de comandos ejecutados (solo lectura). */
  get history(): readonly HistoryItem[] {
    return this._history;
  }

  // ─── State management ────────────────────────────────────────────

  /**
   * Cambia el directorio de trabajo de la sesión.
   *
   * @param path - Ruta del nuevo directorio de trabajo.
   * @returns `this` para encadenamiento.
   */
  cd(path: string): this {
    this._cwd = path;
    return this;
  }

  /**
   * Establece una variable de entorno para los próximos comandos.
   *
   * @param key - Nombre de la variable.
   * @param value - Valor de la variable.
   * @returns `this` para encadenamiento.
   */
  set(key: string, value: string): this {
    this._env[key] = value;
    return this;
  }

  /**
   * Elimina una variable de entorno de la sesión.
   *
   * @param key - Nombre de la variable a eliminar.
   * @returns `this` para encadenamiento.
   */
  unset(key: string): this {
    delete this._env[key];
    return this;
  }

  /**
   * Define un alias para un comando.
   *
   * @param name - Nombre del alias.
   * @param command - Comando al que se expande el alias.
   * @returns `this` para encadenamiento.
   */
  alias(name: string, command: string): this {
    this._aliases.set(name, command);
    return this;
  }

  /**
   * Elimina un alias.
   *
   * @param name - Nombre del alias a eliminar.
   * @returns `this` para encadenamiento.
   */
  unalias(name: string): this {
    this._aliases.delete(name);
    return this;
  }

  // ─── Execution (delegates to Process) ─────────────────────────────

  /**
   * Tagged template que ejecuta un comando interpolando valores
   * de forma segura (con quoting automático). Lanza `TypeError` si algún
   * valor interpolado no es de un tipo soportado (string, number, boolean,
   * array, null/undefined).
   *
   * @example
   * const name = "world";
   * await sh.$`echo hello ${name}`;
   * // ejecuta: echo hello 'world'
   *
   * const files = ["a.txt", "b.txt"];
   * await sh.$`cat ${files}`;
   * // ejecuta: cat 'a.txt' 'b.txt'
   *
   * @param strings - Partes literales del template.
   * @param values - Valores interpolados (se quotean automáticamente).
   * @returns El resultado de la ejecución.
   * @throws {TypeError} Cuando un valor interpolado no se puede quotear.
   */
  $(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Result> {
    let script = "";
    for (let i = 0; i < strings.length; i++) {
      script += strings[i];
      if (i < values.length) {
        script += this.quote(values[i]);
      }
    }
    return this.run(script);
  }

  /**
   * Ejecuta un script shell (interpretado), espera a que termine y devuelve el resultado.
   *
   * @param script - Script a ejecutar.
   * @param options - Opciones adicionales de proceso (sobrescriben cwd/env de la sesión).
   * @returns El resultado de la ejecución.
   */
  async run(script: string, options?: ProcessOptions): Promise<Result> {
    const resolved = this.resolveAliases(script);
    const start = Date.now();
    const result = await this._proc.shell(resolved, this.buildOptions(options));
    this.recordHistory(script, start, result);
    return result;
  }

  // ─── Process management (delegates to Process) ────────────────────

  /**
   * Inicia un script shell (interpretado) y devuelve un `LiveProcess`
   * para interactuar en vivo con su stdin/stdout/stderr.
   *
   * @param script - Script a iniciar.
   * @returns El `LiveProcess` del script lanzado.
   */
  spawnScript(script: string): LiveProcess {
    return this._proc.spawnScript(this.resolveAliases(script), this.buildOptions());
  }

  // ─── Composition ─────────────────────────────────────────────────

  /**
   * Ejecuta una serie de comandos en pipeline (stdout de uno al stdin del siguiente).
   * Devuelve el resultado del último comando. Lanza `TypeError` si no se pasa
   * ningún comando.
   *
   * @example
   * const r = await sh.pipe("cat file.txt", "grep foo", "wc -l");
   *
   * @param scripts - Comandos a ejecutar en pipeline.
   * @returns El resultado del último comando del pipeline.
   * @throws {TypeError} Cuando `scripts` está vacío.
   */
  async pipe(...scripts: string[]): Promise<Result> {
    if (scripts.length === 0) {
      throw new TypeError("pipe requires at least one command");
    }
    if (scripts.length === 1) return this.run(scripts[0]);

    const handles: LiveProcess[] = scripts.map((s) =>
      this._proc.spawnScript(this.resolveAliases(s), this.buildOptions()),
    );

    for (let i = 0; i < handles.length - 1; i++) {
      handles[i]!.stdout?.pipe(handles[i + 1]!.stdin!);
    }

    const results = await Promise.all(handles.map((h) => h.wait()));
    return results[results.length - 1]!;
  }

  /**
   * Ejecuta comandos secuencialmente. Se detiene al primer fallo
   * y devuelve todos los resultados hasta ese punto.
   *
   * @example
   * const results = await sh.chain("npm install", "npm run build", "npm test");
   *
   * @param scripts - Comandos a ejecutar en secuencia.
   * @returns Resultados de cada comando ejecutado (hasta el primer fallo).
   */
  async chain(...scripts: string[]): Promise<Result[]> {
    const results: Result[] = [];
    for (const script of scripts) {
      const result = await this.run(script);
      results.push(result);
      if (result.failed) break;
    }
    return results;
  }

  /**
   * Ejecuta `condition`; si termina OK, ejecuta `then`.
   *
   * @param condition - Comando condicional a evaluar.
   * @param then - Comando a ejecutar si `condition` termina OK.
   * @returns El resultado del segundo comando o `null` si no se ejecutó.
   */
  async ifOk(condition: string, then: string): Promise<Result | null> {
    const result = await this.run(condition);
    if (result.ok) return this.run(then);
    return null;
  }

  /**
   * Ejecuta `condition`; si termina con error, ejecuta `then`.
   *
   * @param condition - Comando condicional a evaluar.
   * @param then - Comando a ejecutar si `condition` falla.
   * @returns El resultado del segundo comando o `null` si no se ejecutó.
   */
  async ifFail(condition: string, then: string): Promise<Result | null> {
    const result = await this.run(condition);
    if (result.failed) return this.run(then);
    return null;
  }

  // ─── Background jobs ─────────────────────────────────────────────

  /**
   * Inicia un script en segundo plano y devuelve un `Job` registrado
   * en la sesión con el `name` dado (o uno aleatorio) y la opción `autoRestart`.
   * El job se elimina del registro automáticamente al terminar (si no se reinicia).
   * Lanza `TypeError` si ya existe un job con el mismo nombre.
   *
   * @example
   * const dev = sh.bg("npm run dev", { name: "dev" });
   * dev.onOutput(chunk => process.stdout.write(chunk));
   *
   * // Más tarde
   * sh.killAll();
   *
   * @example autoRestart
   * const server = sh.bg("npm run serve", { name: "server", autoRestart: true });
   * server.onRestart(job => console.log(`Restarted (${job.restartCount})`));
   *
   * @param script - Script a ejecutar en segundo plano.
   * @param options - Opciones del job (`name`, `autoRestart`).
   * @returns El `Job` registrado en la sesión.
   * @throws {TypeError} Cuando ya existe un job con el `name` dado.
   */
  bg(script: string, options?: JobOptions): Job {
    const name = options?.name ?? crypto.randomUUID();
    if (this._jobs.has(name)) {
      throw new TypeError(`Job "${name}" already exists`);
    }

    const live = this.spawnScript(script);
    const job = new Job(live, this.resolveAliases(script), { name, ...options });
    this._jobs.set(name, job);
    this.ensureCleanup();

    job.onExit(() => {
      if (job.ended && !job._disposed_) {
        this._jobs.delete(name);
      }
    });

    if (job.autoRestart && !job.ended) {
      job.onExit(() => {
        if (job._disposed_) return;
        const replacement = this.spawnScript(script);
        job._replace(replacement);
        this.watchAutoRestart(job, script);
      });
    }

    return job;
  }

  /** Mapa de jobs activos en la sesión, indexados por nombre (solo lectura). */
  get jobs(): ReadonlyMap<string, Job> {
    return this._jobs;
  }

  /** Lista de jobs actualmente en ejecución. */
  get activeJobs(): readonly Job[] {
    return [...this._jobs.values()].filter((j) => j.running);
  }

  /**
   * Mata todos los jobs activos con la señal dada (por defecto `SIGTERM`).
   *
   * @param signal - Señal a enviar a cada job activo.
   */
  killAll(signal: NodeJS.Signals = "SIGTERM"): void {
    for (const job of this._jobs.values()) {
      if (job.running) job.kill(signal);
    }
  }

  /**
   * Devuelve un job por nombre.
   *
   * @param name - Nombre del job a buscar.
   * @returns El `Job` correspondiente, o `undefined` si no existe.
   */
  job(name: string): Job | undefined {
    return this._jobs.get(name);
  }

  // ─── Utilities (delegates to Process) ────────────────────────────

  /**
   * Comprueba si un comando existe en el PATH.
   *
   * @param command - Comando a buscar.
   * @returns `true` si el comando existe.
   */
  async exists(command: string): Promise<boolean> {
    return this._proc.exists(command);
  }

  /**
   * Devuelve la ruta completa del comando o `null` si no existe.
   *
   * @param command - Comando a resolver.
   * @returns La ruta absoluta del comando, o `null` si no se encuentra.
   */
  async which(command: string): Promise<string | null> {
    return this._proc.which(command);
  }

  // ─── History ──────────────────────────────────────────────────────

  /** Limpia el historial de comandos. */
  clearHistory(): void {
    this._history = [];
  }

  /**
   * Devuelve la última entrada del historial.
   *
   * @returns La última `HistoryItem`, o `undefined` si el historial está vacío.
   */
  lastCommand(): HistoryItem | undefined {
    return this._history[this._history.length - 1];
  }

  // ─── Private helpers ─────────────────────────────────────────────

  /**
   * Construye las `ProcessOptions` base incluyendo `cwd` y `env` de la sesión.
   *
   * @param extra - Opciones adicionales que sobrescriben las de la sesión.
   * @returns Las opciones de proceso combinadas.
   */
  private buildOptions(extra?: ProcessOptions): ProcessOptions {
    return {
      cwd: this._cwd,
      env: { ...process.env, ...this._env },
      ...extra,
    };
  }

  /**
   * Resuelve aliases en la primera palabra del script.
   *
   * @param script - Script original.
   * @returns El script con el alias expandido (si aplica).
   */
  private resolveAliases(script: string): string {
    const trimmed = script.trimStart();
    const firstSpace = trimmed.indexOf(" ");
    const firstWord =
      firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);

    if (this._aliases.has(firstWord)) {
      const replacement = this._aliases.get(firstWord)!;
      if (firstSpace === -1) return replacement;
      return replacement + trimmed.slice(firstSpace);
    }
    return script;
  }

  /**
   * Escapa un valor para interpolación segura en shell. Lanza `TypeError`
   * si el valor es de un tipo no soportado (p. ej. objetos).
   *
   * @param value - Valor a quotear (string, number, boolean, array, null/undefined).
   * @returns El valor quoteado como string seguro para shell.
   * @throws {TypeError} Cuando el valor es de un tipo no soportado (p. ej. object).
   */
  private quote(value: unknown): string {
    if (value === null || value === undefined) return "''";
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.quote(v)).join(" ");
    }
    if (typeof value === "string") {
      return `'${value.replace(/'/g, "'\\''")}'`;
    }
    throw new TypeError(`Cannot quote value of type ${typeof value}`);
  }

  /**
   * Registra una entrada en el historial.
   *
   * @param command - Comando ejecutado.
   * @param startMs - Timestamp de inicio (ms desde epoch).
   * @param result - Resultado de la ejecución.
   */
  private recordHistory(
    command: string,
    startMs: number,
    result: Result,
  ): void {
    this._history.push({
      command,
      startedAt: new Date(startMs),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      ok: result.ok,
    });
  }

  /**
   * Configura el watcher de `autoRestart` sobre un job: cuando el proceso
   * termina (sin ser dispuesto), se lanza un reemplazo y se registra
   * recursivamente para el siguiente reinicio.
   *
   * @param job - Job a vigilar.
   * @param script - Script a re-ejecutar al reiniciar.
   */
  private watchAutoRestart(job: Job, script: string): void {
    job.onExit(() => {
      if (job._disposed_) return;
      const replacement = this.spawnScript(script);
      job._replace(replacement);
      this.watchAutoRestart(job, script);
    });
  }

  /**
   * Registra handlers de proceso (`exit`, `SIGINT`, `SIGTERM`) para matar
   * los jobs huérfanos al salir. Solo se registra una vez por sesión.
   */
  private ensureCleanup(): void {
    if (this._cleanupRegistered) return;
    this._cleanupRegistered = true;

    const handler = () => {
      this.killAll("SIGTERM");
    };

    process.once("exit", handler);
    process.once("SIGINT", () => {
      handler();
      process.exit(130);
    });
    process.once("SIGTERM", handler);
  }
}