/**
 * Punto de entrada del módulo de variables de entorno.
 *
 * Reexporta la API pública para cargar, leer y exigir variables de entorno:
 * - `load(path?)`: carga un archivo `.env` y lo mergea a `process.env`.
 * - `get(key)` / `get(key, fallback)`: lee una variable con o sin valor por defecto.
 * - `require(key)`: lee una variable o lanza si no existe.
 */
export { load, get, require } from "./env.js";