/**
 * Pausa la ejecución asíncrona durante `ms` milisegundos.
 *
 * Es la primitiva básica de espera: no lanza errores y siempre resuelve
 * (incluso con `ms` en 0 o negativo, que resuelve en el siguiente tick).
 *
 * @param ms Milisegundos a esperar antes de resolver.
 * @returns Una promesa que se resuelve a `void` cuando expira el temporizador.
 *
 * @example
 * await sleep(200); // espera 200 ms antes de continuar
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}