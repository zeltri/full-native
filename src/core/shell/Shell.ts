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

  constructor(options: ShellConfig = {}) {
    this._proc = new Process();
    this._cwd = options.cwd ?? process.cwd();
    this._env = options.env ?? {};
  }

  // ─── Getters ─────────────────────────────────────────────────────

  get cwd(): string {
    return this._cwd;
  }

  get env(): Record<string, string> {
    return { ...this._env };
  }

  get aliases(): Record<string, string> {
    return Object.fromEntries(this._aliases);
  }

  get history(): readonly HistoryItem[] {
    return this._history;
  }

  // ─── State management ────────────────────────────────────────────

  /** Cambia el directorio de trabajo de la sesión. */
  cd(path: string): this {
    this._cwd = path;
    return this;
  }

  /** Establece una variable de entorno para los próximos comandos. */
  set(key: string, value: string): this {
    this._env[key] = value;
    return this;
  }

  /** Elimina una variable de entorno de la sesión. */
  unset(key: string): this {
    delete this._env[key];
    return this;
  }

  /** Define un alias para un comando. */
  alias(name: string, command: string): this {
    this._aliases.set(name, command);
    return this;
  }

  /** Elimina un alias. */
  unalias(name: string): this {
    this._aliases.delete(name);
    return this;
  }

  // ─── Execution (delegates to Process) ─────────────────────────────

  /**
   * Tagged template que ejecuta un comando interpolando valores
   * de forma segura (con quoting automático).
   *
   * @example
   * const name = "world";
   * await sh.$`echo hello ${name}`;
   * // ejecuta: echo hello 'world'
   *
   * const files = ["a.txt", "b.txt"];
   * await sh.$`cat ${files}`;
   * // ejecuta: cat 'a.txt' 'b.txt'
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

  /** Ejecuta un script shell, espera a que termine y devuelve el resultado. */
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
   */
  spawnScript(script: string): LiveProcess {
    return this._proc.spawnScript(this.resolveAliases(script), this.buildOptions());
  }

  // ─── Composition ─────────────────────────────────────────────────

  /**
   * Ejecuta una serie de comandos en pipeline (stdout de uno al stdin del siguiente).
   * Devuelve el resultado del último comando.
   *
   * @example
   * const r = await sh.pipe("cat file.txt", "grep foo", "wc -l");
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
   * Devuelve el resultado del segundo comando o null si no se ejecutó.
   */
  async ifOk(condition: string, then: string): Promise<Result | null> {
    const result = await this.run(condition);
    if (result.ok) return this.run(then);
    return null;
  }

  /**
   * Ejecuta `condition`; si termina con error, ejecuta `then`.
   * Devuelve el resultado del segundo comando o null si no se ejecutó.
   */
  async ifFail(condition: string, then: string): Promise<Result | null> {
    const result = await this.run(condition);
    if (result.failed) return this.run(then);
    return null;
  }

  // ─── Background jobs ─────────────────────────────────────────────

  /**
   * Inicia un script en segundo plano y devuelve un `Job` registrado
   * en la sesión. El job se elimina del registro automáticamente al terminar.
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

  /** Mapa de jobs activos por nombre. */
  get jobs(): ReadonlyMap<string, Job> {
    return this._jobs;
  }

  /** Lista de jobs actualmente en ejecución. */
  get activeJobs(): readonly Job[] {
    return [...this._jobs.values()].filter((j) => j.running);
  }

  /** Mata todos los jobs activos con la señal dada (default SIGTERM). */
  killAll(signal: NodeJS.Signals = "SIGTERM"): void {
    for (const job of this._jobs.values()) {
      if (job.running) job.kill(signal);
    }
  }

  /** Devuelve un job por nombre o undefined si no existe. */
  job(name: string): Job | undefined {
    return this._jobs.get(name);
  }

  // ─── Utilities (delegates to Process) ────────────────────────────

  /** Devuelve true si el comando existe en el PATH. */
  async exists(command: string): Promise<boolean> {
    return this._proc.exists(command);
  }

  /** Devuelve la ruta completa del comando o null si no existe. */
  async which(command: string): Promise<string | null> {
    return this._proc.which(command);
  }

  // ─── History ──────────────────────────────────────────────────────

  /** Limpia el historial de comandos. */
  clearHistory(): void {
    this._history = [];
  }

  /** Devuelve la última entrada del historial. */
  lastCommand(): HistoryItem | undefined {
    return this._history[this._history.length - 1];
  }

  // ─── Private helpers ─────────────────────────────────────────────

  /** Construye las ProcessOptions base incluyendo cwd y env. */
  private buildOptions(extra?: ProcessOptions): ProcessOptions {
    return {
      cwd: this._cwd,
      env: { ...process.env, ...this._env },
      ...extra,
    };
  }

  /** Resuelve aliases en el primer word del script. */
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

  /** Escapa un valor para shell interpolation. */
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

  /** Registra una entrada en el historial. */
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

  /** Configura el watcher de autoRestart sobre un job. */
  private watchAutoRestart(job: Job, script: string): void {
    job.onExit(() => {
      if (job._disposed_) return;
      const replacement = this.spawnScript(script);
      job._replace(replacement);
      this.watchAutoRestart(job, script);
    });
  }

  /** Registra handlers de proceso para matar jobs huérfanos al salir. */
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