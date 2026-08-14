import { parseEnv } from "node:util";
import { readFile } from "node:fs/promises";

/**
 * Expresión regular global que captura referencias de interpolación del tipo
 * `${VAR}`. El identificador capturado debe comenzar con una letra o `_` y
 * contener solo caracteres alfanuméricos o `_`.
 */
const REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Resuelve referencias `${VAR}` dentro de los valores de un objeto de variables.
 *
 * - Busca el valor en el propio objeto primero, luego en `process.env`.
 * - Si no se encuentra en ninguno, reemplaza por string vacío.
 * - Repite pases hasta que no haya cambios entre un pase y el siguiente
 *   (soporta referencias encadenadas: A depende de B, B depende de C).
 * - **Límite duro de `maxPasses` (default 5)**: corta referencias circulares
 *   (`A=${B}`, `B=${A}`) sin colgar el proceso. Al llegar al límite, devuelve
 *   el resultado tal como quedó — los `${...}` sin resolver sobreviven.
 *   Es una decisión de "mejor esfuerzo".
 *
 * La comparación entre pases se hace con `JSON.stringify` (no con regex
 * stateful) para evitar falsos negativos por `lastIndex`.
 *
 * @param vars Objeto de variables a interpolar
 * @param maxPasses Número máximo de pases de resolución (default 5)
 * @returns Un nuevo objeto con las referencias `${VAR}` resueltas (de forma
 *   "mejor esfuerzo"; las no resolubles sobreviven literales)
 */
function interpolate(
  vars: Record<string, string>,
  maxPasses = 5,
): Record<string, string> {
  let current = vars;

  /**
   * Resuelve todas las referencias `${VAR}` de un valor individual.
   *
   * Para cada referencia, busca primero en el objeto `current` (resultado
   * parcial del pase actual) y luego en `process.env`. Si no se encuentra en
   * ninguno, reemplaza por string vacío.
   *
   * @param value Cadena que puede contener cero o más referencias `${VAR}`
   * @returns El valor con todas las referencias resolubles reemplazadas
   */
  const resolveValue = (value: string): string =>
    value.replace(REF, (_, name: string) => {
      const found = current[name] ?? process.env[name] ?? "";
      return found;
    });

  /**
   * Ejecuta un único pase de resolución sobre todo el objeto de variables,
   * aplicando `resolveValue` a cada clave.
   *
   * @param obj Objeto de variables a resolver en este pase
   * @returns Un nuevo objeto con los valores tras aplicar `resolveValue`
   */
  const resolvePass = (obj: Record<string, string>): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const key of Object.keys(obj)) {
      next[key] = resolveValue(obj[key]);
    }
    return next;
  };

  /**
   * Bucle recursivo que aplica `resolvePass` repetidamente hasta que no haya
   * cambios entre pases (referencias encadenadas resueltas) o hasta alcanzar
   * `maxPasses` (corta referencias circulares sin colgar el proceso).
   *
   * La comparación entre pases se hace con `JSON.stringify` (no con el estado
   * interno de la regex) para evitar falsos negativos por `lastIndex`.
   *
   * @param acc Acumulador de variables resueltas hasta el pase actual
   * @param pass Número de pase actual (comienza en 0)
   * @returns El objeto de variables tras detenerse (por convergencia o límite)
   */
  const loop = (
    acc: Record<string, string>,
    pass: number,
  ): Record<string, string> => {
    if (pass >= maxPasses) return acc;
    const next = resolvePass(acc);
    if (JSON.stringify(next) === JSON.stringify(acc)) return next;
    return loop(next, pass + 1);
  };

  return loop(current, 0);
}

/**
 * Carga un archivo `.env`, interpola referencias `${VAR}` y las mergea a
 * `process.env` **sin pisar** variables que ya estén seteadas en el entorno
 * real. El entorno real siempre tiene prioridad sobre el archivo.
 *
 * El parseo se realiza con `util.parseEnv` de Node.js. Los valores `undefined`
 * resultantes del parseo se descartan antes de interpolar.
 *
 * @param path Ruta al archivo `.env` (default `".env"`)
 * @returns Nada; muta `process.env` como efecto secundario
 * @throws {Error} Si el archivo no existe (ENOENT) u otro error de lectura
 */
export async function load(envPath = ".env"): Promise<void> {
  const raw = await readFile(envPath, "utf8");
  const parsed = parseEnv(raw);
  const clean: Record<string, string> = {};
  for (const key of Object.keys(parsed)) {
    const value = parsed[key];
    if (value !== undefined) clean[key] = value;
  }
  const resolved = interpolate(clean);
  for (const key of Object.keys(resolved)) {
    process.env[key] ??= resolved[key];
  }
}

/**
 * Devuelve el valor de una env var, o `undefined` si no existe.
 * @param key Nombre de la variable
 * @returns El valor o `undefined`
 */
export function get(key: string): string | undefined;

/**
 * Devuelve el valor de una env var, o `fallback` si no existe.
 * @param key Nombre de la variable
 * @param fallback Valor a retornar si la variable no existe
 * @returns El valor o el fallback
 */
export function get(key: string, fallback: string): string;

/**
 * Implementación de `get`. Devuelve el valor de una env var, o `fallback`
 * (que por defecto es `undefined`) si la variable no existe en `process.env`.
 *
 * @param key Nombre de la variable
 * @param fallback Valor a retornar si la variable no existe (default `undefined`)
 * @returns El valor de la variable, el fallback, o `undefined`
 */
export function get(key: string, fallback?: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value;
}

/**
 * Devuelve el valor de una env var, o lanza `Error` si no existe.
 * @param key Nombre de la variable
 * @returns El valor
 * @throws {Error} Si la variable no existe, con un mensaje que incluye el nombre de la key
 */
export function require(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}