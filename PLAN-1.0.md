# Plan de bloques para la versión 1.0

Estado: **bloques 1–5 completados y verificados** — pendiente fase 2 (docs, bump, release).
Fecha de creación: 2026-10-05
Versión actual del paquete: `0.2.1` (bump a `1.0.0` en fase 2, tras verificación).

Cada bloque trabaja sobre **archivos disjuntos**: ningún subagente toca archivos de otro bloque.
El orquestador verifica el resultado al final (diff completo, `typecheck`, suite completa de tests).

---

## Contexto: por qué se necesitan estos bloques

Todo lo que entra en 1.0 congela la API pública: después de la primera versión estable, cada breaking change cuesta 10x más (usuarios, semver, migraciones). El criterio de selección fue **"aquello que es caro de cambiar después de 1.0, o que hoy produce comportamiento incorrecto/silenciosamente sorprendente"**. Se descartó todo lo cosmético.

**La partición en bloques con archivos disjuntos existe por una razón operativa**: los subagentes corren en paralelo en el mismo árbol de trabajo. Si dos compartieran un archivo, habría carreras de escritura (un `edit` pisa el otro). La partición es por módulo del código fuente, que además coincide con los límites de dependencias del repo:

```
file/  ← Bloque A      (no importa nada de los otros módulos)
process/  ← Bloque B   (no importa file/)
shell/  ← Bloque C     (importa process/ pero no lo edita)
env/  ← Bloque D       (no importa nadie)
utils/  ← Bloque E     (nuevo módulo; importa Folder/ pero NO lo edita)
core/index.ts  ← solo el Bloque E lo edita (una línea de export)
```

La única dependencia cruzada real (E extiende `Folder` de A) se mitigó prohibiendo a E el uso de `moveTo`/`rename`, cuyos cambios de semántica introduce A. Los archivos compartidos intocables (`README.md`, `CHANGELOG.md`, `package.json`) quedan para la Fase 2, a un solo agente, precisamente porque los cinco bloques los necesitarían tocar.

El orden de prioridad de la revisión inicial de código fue: (1) bugs y APIs deprecadas, (2) decisiones de API que hay que tomar antes de congelar (mutabilidad, filtrado de líneas, firmas), (3) features del roadmap con mayor beneficio/costo, (4) robustez. Cada bloque hereda ese orden internamente.

---

## Reglas generales (aplican a todos los bloques)

1. **Solo tocar los archivos listados** en cada bloque. Nada más.
2. **Prohibido tocar**: `README.md`, `CHANGELOG.md`, `package.json`, `dist/`, `node_modules/`, `tsconfig.json`, `vitest.config.ts`. Eso es fase 2.
3. **Prohibido hacer `git add` / `git commit`**. El orquestador revisa con `git diff`.
4. **JSDoc en español** (convención del repo) y estilo consistente con el código circundante.
5. **Cada bloque corre SOLO sus propios tests** con `pnpm exec vitest run <archivo>` (desde la raíz). No ejecutar `pnpm test` completo: hay otros bloques corriendo tests en paralelo y el archivo de tests de `env` usa una ruta fija (`tmp-env-test`).
6. Los cambios son **breaking changes intencionales y aprobados** para la primera versión estable (1.0).
7. Al terminar, cada subagente reporta: archivos modificados, resumen por tarea, resultado de tests y desviaciones.

---

## Bloque A — File / Folder

**Por qué este bloque:** es el módulo más usado de la librería y concentra dos errores activos y una decisión de diseño que no se puede postergar.

- **A1** — `fs.rmdir(path, { recursive })` está deprecado desde Node 22 (`DEP0147`) y **será eliminado**: de hecho, el warning ya aparece ejecutando la suite. Una 1.0 que nace sobre una API en extinción rompe con cualquier upgrade de Node del usuario. Es corrección obligatoria, no mejora.
- **A2** — `tree()` es la función bandera de la promesa de la librería ("scripts más legibles") y en su estado actual **miente visualmente**: pinta cada subdirectorio dos veces, duplica la indentación y fuerza el conector `└──` en directorios que no son el último hijo. Un árbol corrupto engaña a quien lee el output de una automatización.
- **A3** — la mutación silenciosa de `this.path` es el patrón que más bugs produce en scripts: un `File` pasado a un helper puede cambiar de ruta **sin que el llamador lo sepa**, y cualquier alias del mismo objeto queda desincronizado. Antes de congelar la API hay que decidir una semántica única; la inmutabilidad (devolver nueva instancia, como ya hace `copyTo`) es la predecible y elimina la clase entera de bugs de aliasing. Si esto entra después de 1.0, es `2.0`.
- **A4** — `Folder.absolute` existe y `File.absolute` no: asimetría gratuita en una librería cuyo valor es la consistencia. Gratis de añadir ahora.
- **A5** — los tests actuales *codifican* la semántica de mutación (`expect(result).toBe(src)`); si no se reescriben, quedan verificando exactamente lo que se está eliminando.

Archivos permitidos: `src/core/file/File.ts`, `src/core/file/Folder.ts`, `src/core/file/File.test.ts`

| # | Tarea | Detalle |
|---|-------|---------|
| A1 | `Folder.delete()` deprecado | Reemplazar `fs.rmdir(this.path, { recursive })` por `fs.rm(this.path, { recursive, force: true })`. Mantener firma `delete(recursive = false)` y semántica de retorno (`true` si existía y se eliminó, `false` si no existía; el guard de `exists()` se queda). |
| A2 | Bug en `Folder.tree()` | La implementación actual tiene tres bugs: (a) los subdirectorios se pintan **dos veces** (una en el loop y otra al inicio de `render`); (b) el prefijo pasado a `render` añade indentación extra (doble indent); (c) la llamada recursiva fuerza `isLast = true`, conectores incorrectos para directorios no finales. Reescribir `render` para: pintar cada entrada exactamente una vez, usar `├──`/`└──` según sea último hijo, indentar con `│   ` (no último) o `    ` (último), y arrancar con la línea raíz `${this.name}/`. |
| A3 | Inmutabilidad (breaking) | `File.moveTo/moveInto/rename` y `Folder.moveTo/moveInto/rename` **ya no mutan `this.path`**: devuelven una **nueva** instancia (`Promise<File>` / `Promise<Folder>`) apuntando al destino; la instancia original sigue apuntando a la ruta vieja. `copyTo/copyInto` no cambian (ya devolvían nueva instancia). Actualizar TSDoc (quitar "Muta this.path", documentar que devuelve nueva instancia). |
| A4 | `File.absolute` | Añadir getter `absolute` que devuelva `path.resolve(this.path)` (paridad con `Folder.absolute`). |
| A5 | Tests | Reescribir los tests de mutación (`"moveTo mutates this.path and returns this"`, etc.) a semántica de inmutabilidad; añadir test de `File.absolute`; añadir test de `tree()` que verifique estructura exacta (al menos 2 dirs para validar conectores). |

Self-check: `pnpm exec vitest run src/core/file/File.test.ts`

---

## Bloque B — Process

**Por qué este bloque:** ejecutar comandos es el corazón de cualquier automatización y aquí hay un comportamiento no estándar que conviene corregir antes de congelarlo, más un hueco de cancelación y una feature sin tests.

- **B1** — `Result.lines` filtraba líneas vacías (`filter(Boolean)`) debajo de un nombre que sugiere un `split`: quien ya conoce `String.prototype.split` espera incluir líneas vacías, y el filtrado silencioso corrompe casos como CSVs o logs donde la línea vacía en sí es dato. Es el momento de normalizarlo (y mover el filtrado a `nonEmptyLines`, que preserva el caso de uso útil). Post-1.0 sería otra versión mayor.
- **B2** — las automatizaciones reales necesitan **cancelar** comandos largos (Ctrl-C propio, watchdogs, orquestadores). `AbortSignal` es el estándar del ecosistema (mismo primitivo que `fetch`, `fs`, timers), lo que permite integrar estos comandos con cualquier framework que ya use `AbortController`. El cableado es manual porque el soporte nativo de `spawn` emite `error` con `AbortError` — que `LiveProcess` convierte en rechazo — y no marcaría `stopped`, perdiendo la distinción kill vs salida natural que la librería promete. La feature del `timeout` manual se dejó intacta y sin migrar al `spawn` nativo por el mismo motivo: los tests garantizan el comportamiento actual, y "determinista y probado" gana a "elegante y especulativo" en la antesala de una 1.0.
- **B3** — `withTimeout()` existía **sin un solo test**: a la fecha, la única feature de kill automático de la librería no estaba verificada. Publicar 1.0 con eso es publicar un riesgo.

Archivos permitidos: `src/core/process/types.ts`, `src/core/process/Command.ts`, `src/core/process/Result.ts`, `src/core/process/Process.test.ts`. **No tocar** `Process.ts`, `LiveProcess.ts`, `ProcessError.ts`, `index.ts`.

| # | Tarea | Detalle |
|---|-------|---------|
| B1 | `Result.lines` (breaking) | `lines` devuelve **todas** las líneas (`this.stdout.split(/\r?\n/)`), incluyendo vacías (comportamiento estándar de split). Añadir getter nuevo `nonEmptyLines` con el comportamiento anterior (`filter(Boolean)`). Actualizar TSDoc. |
| B2 | `Command.withAbort(signal)` | Nuevo método inmutable que guarda la señal en `_options.signal`. En `spawn()`: destructurear `signal` fuera de `spawnOpts` y cablear manualmente `addEventListener("abort", ...)` → `handle.kill("SIGTERM")` (una vez), limpiando el listener en `exit`/`error` del child para no filtrar. Cableado manual para que `LiveProcess.stopped` quede en `true` (nativo no marcaría `_killed`). No pasar `signal` al `spawn()` nativo. |
| B3 | Tests | Actualizar tests de `lines` (ahora incluyen línea vacía final); añadir `nonEmptyLines`; añadir test `withTimeout` (proceso con timer de 10s + `withTimeout(200)` → termina rápido, `signal === "SIGTERM"`); añadir test `withAbort` (controller → abort → `stopped === true`, `signal === "SIGTERM"`). |

> **Nota (B2/B3 descartadas en la revisión inicial):** se descartó migrar el `timeout` al `spawn()` nativo y limpiar la redeclaración del tipo. Motivo: `LiveProcess` rechaza en *cualquier* evento `error` del child, y el timeout nativo puede emitir `error`; el `setTimeout` manual es determinista y marca `stopped` vía `handle.kill`. Se conserva tal cual. La redeclaración `timeout?: number` en `ProcessOptions` se mantiene (compatible y auto-documentada).

Self-check: `pnpm exec vitest run src/core/process/Process.test.ts`

---

## Bloque C — Shell

**Por qué este bloque:** `Shell` es la API de más alto nivel y la que más "se parece" a lo que el usuario ya conoce (un shell de verdad); cada divergencia de ese modelo mental es una sorpresa que la librería se propone eliminar.

- **C1** — `Shell.cd("src")` dejaba `cwd` en el literal `"src"`, un estado **inválido silencioso** que solo explota más tarde, en el primer comando, con un error que no menciona el `cd`. Un shell simulado tiene que comportarse como el que simula: resolver rutas relativas contra la sesión. Es el tipo exacto de bug que esta librería existe para evitar.
- **C2** — `ShellConfig.shell` documentaba una capacidad que **no existe** (el shell se elige internamente en `Process.shell()`). Un campo muerto en la config es una promesa falsa; eliminarlo ahora cuesta una línea, después de 1.0 cuesta deprecación.
- **C3** — `pipe()` es la primitiva de composición más riesgosa del repo: si un comando intermedio muere, los streams pueden lanzar `EPIPE` y un evento `error` no manejado de un child process **mata el proceso anfitrión entero** — el peor desenlace posible para un script de automatización que debe reportar errores, no suicidarse. La regla de oro de la librería ("las automatizaciones fallan visiblemente, no silenciosamente") exige blindar esto.
- **C4** — el quoting de `$` es estilo POSIX: en Windows (`cmd.exe`) produce comandos mal quotingados o sin seguro. No se finge cross-platform con un fix de última hora: se documenta el límite honestamente ahora, y el quoter de Windows es una feature futura con diseño propio.

Archivos permitidos: `src/core/shell/Shell.ts`, `src/core/shell/types.ts`, `src/core/shell/Shell.test.ts`. **No tocar** `Job.ts`, `index.ts`.

| # | Tarea | Detalle |
|---|-------|---------|
| C1 | `cd()` con rutas relativas | `cd(target)` resuelve contra el cwd actual de la sesión: `this._cwd = path.resolve(this._cwd, target)` (importar `node:path`). Rutas absolutas también funcionan. |
| C2 | `ShellConfig.shell` muerto | Eliminar el campo `shell?: string` de `ShellConfig`: nunca se respeta (el shell se elige en `Process.shell()`). Ajustar TSDoc de `ShellConfig`. |
| C3 | `pipe()` robusto | Validar disponibilidad de `stdout`/`stdin` en cada salto y lanzar `TypeError` claro si falta alguno; adjuntar listeners de error seguros en los streams pipeados para que un `EPIPE`/spawn fallido no crashee el proceso host con errores no manejados; el `Promise.all(handles.map(h => h.wait()))` se queda como está (un fallo de spawn rechaza `pipe`, pero solo con `ProcessError`, nunca con crash). |
| C4 | TSDoc de `$` | Documentar que el quoting es estilo POSIX (`sh`/`bash`) y **no** es seguro para `cmd.exe` en Windows. Solo documentación. |
| C5 | Tests | `cd()` relativo (desde `os.tmpdir()`, `cd("subdir")` → cwd absoluto); `pipe("echo hi", "grep zzz")` → `Result.failed === true` (exit 127/1, sin crash ni rechazo); `pipe()` vacío sigue lanzando `TypeError`. |

Self-check: `pnpm exec vitest run src/core/shell/Shell.test.ts`

---

## Bloque D — env

**Por este bloque:** la carga de variables es el primer paso de casi todo script con configuración, y la firma actual es un callejón sin salida de depuración y de extensibilidad.

- **D1** — `load()` devolvía `void`: el script no tiene forma de saber **qué variables se aplicaron realmente**, lo que complica depurar "¿por qué no tomó mi PORT?". Devolver el diccionario de variables aplicadas convierte la carga en observable, que es el espíritu de la librería.
- **D2** — la firma `load(path: string)` obligaba a romper el API de nuevo más adelante para añadir cualquier otra opción; el objeto `{ path, override }` absorbe el futuro sin nuevas rupturas. La opción `override: true`, además, alinea `fullnative` con la expectativa que el ecosistema dotenv ya estableció (`override` existe hace años), reduciendo la sorpresa de migración. Es el único momento barato para elegir estas firmas: antes de congelar.
- **D3** — la semántica por defecto **no cambia** (el entorno real siempre gana, `??=`): los tests existentes siguen pasando sin tocarlos, lo que demuestra que el cambio es aditivo para quien ya usa la librería.

Archivos permitidos: `src/core/env/env.ts`, `src/core/env/env.test.ts`. `env/index.ts` no necesita cambios (los nombres exportados no cambian). **No tocar `core/index.ts`** (es del Bloque E).

| # | Tarea | Detalle |
|---|-------|---------|
| D1 | `load()` con firma ampliada (breaking) | Aceptar `string | { path?: string; override?: boolean }` (default `".env"`). Devuelve `Promise<Record<string, string>>` con las variables **aplicadas** por esta llamada: en modo normal, solo las que no existían en `process.env`; en modo `override: true`, todas las resueltas. Definir `interface LoadOptions` en `env.ts` (no hace falta exportarla por `core/index.ts`; el tipo se infiere con literales de objeto). |
| D2 | Semántica de merge | Mantener por defecto "el entorno real siempre gana" (`??=`). Con `override: true`, sobrescribe. Interpolación `${VAR}` sin cambios. Actualizar TSDoc completo (incluida la descripción del retorno). |
| D3 | Tests | Los tests existentes siguen válidos (la firma `string` se mantiene). Añadir: llamada con objeto `{ path }`, valor de retorno contiene solo las aplicadas, `override: true` pisa una var stubbeada, `override: false` (default) no la pisa. |

Self-check: `pnpm exec vitest run src/core/env/env.test.ts`

---

## Bloque E — Utils (módulo nuevo)

**Por este bloque (y por qué ahora y no después):** son tres primitivas del roadmap con la mejor proporción beneficio/costo, y las tres resuelven patrones que aparecen en **cada** automatización seria.

- **E1 (`sleep`)** — el reemplazo legible de `setTimeout` envuelto en promesas a mano. Es la "pausa" más común de un script (esperar servicios, backoffs) y hoy obliga a cada usuario a reinventarla.
- **E2 (`timeout`)** — ponerle deadline a *cualquier* promise (no solo a comandos, que ya tienen `withTimeout`): conexiones, polls, pasos intermedios. `TimeoutError` como clase permite distinguir la expiración de fallos reales en un `catch`, que es justo lo que un script de automatización necesita para decidir entre reintentar y abortar.
- **E3 (`tempDir`)** — ataca el clásico "directorio temporal que se olvida de borrar": cleanup automático al salir del proceso vía **un único** hook global y registro compartido (no un listener por directorio, que escala mal y puede filtrar). Hereda de `Folder` para que encaje en el resto del módulo file sin adaptaciones.
- **E4** — era el único bloque que necesitaba tocar `core/index.ts` (los demás no añaden exports), por eso ese archivo se le asignó en exclusiva: es el ejemplo perfecto de por qué la partición se hace por archivos y no por "features".

Archivos permitidos: **nuevos** `src/core/utils/index.ts`, `src/core/utils/sleep.ts`, `src/core/utils/timeout.ts`, `src/core/utils/tempDir.ts`, `src/core/utils/utils.test.ts`; y **una sola edición** en `src/core/index.ts` para añadir la línea de export de utils.

| # | Tarea | Detalle |
|---|-------|---------|
| E1 | `sleep(ms)` | `Promise<void>` que se resuelve tras `ms` con `setTimeout`. |
| E2 | `timeout(promise, ms, message?)` | Race contra un timer; si expira, rechaza con `TimeoutError` (clase `Error` exportada con `name = "TimeoutError"`). Limpiar el timer con `clearTimeout` cuando gana el promise subyacente (`finally`). `Promise.race` ya adjunta handlers a ambos promises, así que no hay unhandled rejection si el subyacente rechaza tarde. |
| E3 | `tempDir({ prefix?, keep? })` | Devuelve `Promise<TempDir>`; `class TempDir extends Folder { dispose(): Promise<void> }`. Crea con `fs.mkdtemp` bajo `os.tmpdir()` con prefijo (default `"fullnative-"`). Si `keep !== true`, registra la ruta en un Set a nivel de módulo + un único `process.once("exit")` que hace `rmSync` de cada ruta registrada (un solo hook, no uno por tempdir). `dispose()` elimina el dir (`fs.rm` recursive + force), lo saca del registro. **Nota: no usar `moveTo`/`rename` de Folder — el Bloque A está cambiando su semántica.** Solo usar `mkdtemp`/`rm`. |
| E4 | Export en `core/index.ts` | Añadir `export { sleep, timeout, TimeoutError, tempDir, TempDir } from "./utils/index.js";` (respetando el formato del archivo). Única edición de este bloque fuera de `src/core/utils/`. |
| E5 | Tests | `sleep(30)` tarda ≥ 25 ms; `timeout` rechaza rápido con `TimeoutError`; `timeout` resuelve el valor del promise rápido; `tempDir` crea un dir existente y único, `dispose()` lo elimina; `keep: true` no registra auto-cleanup (el dir sigue existiendo tras `dispose` no llamado… y `dispose` igual funciona). |

Self-check: `pnpm exec vitest run src/core/utils/utils.test.ts`

---

## Verificación (responsabilidad del orquestador)

Estado: **✅ completada (2026-10-05)** — los 5 bloques terminaron y pasaron la verificación.

1. ✅ **Revisión de diffs**: `git diff` bloque por bloque contra las tablas de arriba. Cada bloque tocó exactamente sus archivos permitidos. Un solo hallazgo transversal: los tipos `LoadOptions` (env) y `TempDirOptions` (utils) se exportan en sus módulos pero no se re-exportan en `core/index.ts` → anotado para fase 2.
2. ✅ **Typecheck global**: `pnpm run typecheck` limpio (corrido dos veces: con 4 bloques y con el árbol completo tras el Bloque C).
3. ✅ **Suite completa en exclusiva**: `pnpm test` → **172/172 tests, 5 archivos** (baseline 150 → 172).
4. ✅ **Spot-checks de comportamiento** (script desechable vía entrypoint `src/index.ts`): **13/13 PASS** — `absolute`, inmutabilidad de `moveTo`, `tree()` con conectores POSIX exactos, `lines`/`nonEmptyLines`, `cd` relativo acumulativo (verificado con `pwd` real), `pipe` con filtro sin match resuelve `failed` sin crash, retorno de `load()`, `sleep`, `timeout`/`TimeoutError`, `tempDir`/`dispose`. (El único FAIL intermedio fue un error del orquestador en la cadena esperada de `tree()`, no del código.)
5. ✅ **Criterios de aceptación**: todos cumplidos; sin archivos inesperados en el working tree; sin `git add`/`commit` de los subagentes.

---

## Fase 2 (pendiente, después de la verificación)

- Actualizar `README.md` y `CHANGELOG.md` con las nuevas semánticas (un solo agente, no en paralelo, porque ambos archivos los toca uno solo).
- `MIGRATION.md` para el salto 0.x → 1.0 (inmutabilidad, `lines`, firma de `load`).
- **Añadir al re-export raíz**: `type LoadOptions` y `type TempDirOptions` en `src/core/index.ts` (paridad con `ProcessOptions`/`ShellConfig`; los consumidores no pueden anotar esos tipos hoy porque el `exports` map solo expone el entrypoint).
- Bump de versión a `1.0.0` y release.