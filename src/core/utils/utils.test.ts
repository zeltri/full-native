import { describe, it, expect, afterEach, vi } from "vitest";
import { sleep, timeout, TimeoutError, tempDir, TempDir } from "./index.js";

/** Rutas temporales creadas en los tests, para limpiarlas al final. */
const created: TempDir[] = [];

describe("utils", () => {
  afterEach(async () => {
    for (const dir of created.splice(0)) {
      await dir.dispose();
    }
  });

  describe("sleep", () => {
    it("espera al menos los ms indicados", async () => {
      const start = performance.now();
      await sleep(30);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(25);
    });
  });

  describe("timeout", () => {
    it("rechaza rápido con TimeoutError si expira el plazo", async () => {
      const never = new Promise<string>(() => {});
      const start = performance.now();
      await expect(timeout(never, 30)).rejects.toThrow(TimeoutError);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });

    it("rechaza con name 'TimeoutError' y mensaje por defecto", async () => {
      const never = new Promise<string>(() => {});
      await expect(timeout(never, 20)).rejects.toMatchObject({
        name: "TimeoutError",
        message: expect.stringContaining("20ms"),
      });
    });

    it("resuelve el valor del promise cuando llega a tiempo", async () => {
      await expect(
        timeout(Promise.resolve("ok"), 5000),
      ).resolves.toBe("ok");
    });

    it("limpia el timer cuando gana el promise (no deja el proceso colgado)", async () => {
      const spy = vi.spyOn(global, "clearTimeout");
      await expect(
        timeout(Promise.resolve("ok"), 10_000),
      ).resolves.toBe("ok");
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("tempDir", () => {
    it("crea un directorio que existe y es instancia de TempDir", async () => {
      const dir = await tempDir();
      created.push(dir);
      expect(dir).toBeInstanceOf(TempDir);
      expect(dir.name.startsWith("fullnative-")).toBe(true);
      expect(await dir.exists()).toBe(true);
    });

    it("crea directorios únicos (nombres distintos)", async () => {
      const a = await tempDir();
      const b = await tempDir();
      created.push(a, b);
      expect(a.path).not.toBe(b.path);
      expect(await a.exists()).toBe(true);
      expect(await b.exists()).toBe(true);
    });

    it("dispose() elimina el directorio en disco", async () => {
      const dir = await tempDir();
      await dir.createFile("data.txt", "contenido");
      expect(await dir.exists()).toBe(true);
      await dir.dispose();
      expect(await dir.exists()).toBe(false);
    });

    it("keep: true no registra auto-cleanup y dispose() igual funciona", async () => {
      const dir = await tempDir({ keep: true });
      expect(dir.keep).toBe(true);
      expect(await dir.exists()).toBe(true);
      await dir.dispose();
      expect(await dir.exists()).toBe(false);
    });

    it("acepta prefijo personalizado", async () => {
      const dir = await tempDir({ prefix: "zeltri-test-" });
      created.push(dir);
      expect(dir.name.startsWith("zeltri-test-")).toBe(true);
      expect(await dir.exists()).toBe(true);
    });
  });
});