/**
 * Error que indica que una operación superó el plazo máximo permitido.
 *
 * Se usa como rechazo estándar de `timeout()` y permite detectar caducidades
 * de forma tipada sin depender del mensaje literal.
 *
 * @example
 * try {
 *   await timeout(slowTask(), 5_000);
 * } catch (err) {
 *   if (err instanceof TimeoutError) console.error("se pasó de plazo");
 * }
 */
export class TimeoutError extends Error {
  /**
   * @param message Descripción del vencimiento (por defecto, genérica).
   */
  constructor(message = "Operation timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Compite una promesa contra un temporizador y limita su plazo de resolución.
 *
 * - Si `promise` se resuelve a tiempo, su valor gana la carrera y el timer
 *   se limpia con `clearTimeout` (vía `finally`).
 * - Si expira el plazo, la promesa devuelta rechaza con `TimeoutError`
 *   (el `message` dado, o uno por defecto que incluye los `ms`).
 *
 * El `promise` subyacente nunca se cancela (las promesas nativas no se pueden
 * cancelar): si rechaza después de que el timer haya ganado, `Promise.race`
 * ya tenía handlers adjuntos a ambos, así que no hay unhandled rejection.
 *
 * @param promise Promesa a la que se quiere limitar el plazo.
 * @param ms Plazo máximo en milisegundos antes de rechazar.
 * @param message Mensaje opcional para el `TimeoutError`. Por defecto,
 *   `"Operation timed out after {ms}ms"`.
 * @returns Una promesa con el valor de `promise`, o que rechaza con
 *   `TimeoutError` si vence el plazo.
 */
export function timeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(message ?? `Operation timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, guard]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}