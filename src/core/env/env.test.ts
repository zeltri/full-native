import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { load, get, requireEnv } from "./env.js";

const TMP = join(process.cwd(), "tmp-env-test");
const ENV_FILE = join(TMP, ".env");

function writeEnv(content: string): void {
  writeFileSync(ENV_FILE, content, "utf8");
}

describe("env", () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  describe("load", () => {
    it("carga archivo .env simple sin interpolación", async () => {
      writeEnv("SIMPLE_KEY=hello\n");
      await load(ENV_FILE);
      expect(process.env.SIMPLE_KEY).toBe("hello");
    });

    it("resuelve valores con comillas y espacios", async () => {
      writeEnv('QUOTED_KEY="value with spaces"\n');
      await load(ENV_FILE);
      expect(process.env.QUOTED_KEY).toBe("value with spaces");
    });

    it("ignora comentarios", async () => {
      writeEnv("# this is a comment\nCOMMENT_KEY=nocomment\n");
      await load(ENV_FILE);
      expect(process.env.COMMENT_KEY).toBe("nocomment");
    });

    it("interpola referencias simples", async () => {
      writeEnv("HOST=localhost\nURL=http://${HOST}:3000\n");
      await load(ENV_FILE);
      expect(process.env.URL).toBe("http://localhost:3000");
    });

    it("interpola referencias encadenadas (2+ niveles)", async () => {
      writeEnv("CHAIN_A=${CHAIN_B}\nCHAIN_B=${CHAIN_C}\nCHAIN_C=value\n");
      await load(ENV_FILE);
      expect(process.env.CHAIN_A).toBe("value");
      expect(process.env.CHAIN_B).toBe("value");
      expect(process.env.CHAIN_C).toBe("value");
    });

    it("corta referencias circulares sin colgar", async () => {
      writeEnv("CIRC_A=${CIRC_B}\nCIRC_B=${CIRC_A}\n");
      await load(ENV_FILE);
      expect(process.env.CIRC_A).toBeDefined();
      expect(process.env.CIRC_B).toBeDefined();
    });

    it("no pisa variables ya seteadas en process.env", async () => {
      vi.stubEnv("PRESET_VAR", "from-shell");
      writeEnv("PRESET_VAR=from-file\n");
      await load(ENV_FILE);
      expect(process.env.PRESET_VAR).toBe("from-shell");
    });

    it("reemplaza referencias inexistentes por string vacío", async () => {
      writeEnv("MISSING_REF=before-${NOPE}-after\n");
      await load(ENV_FILE);
      expect(process.env.MISSING_REF).toBe("before--after");
    });

    it("rechaza con error claro si el archivo no existe", async () => {
      await expect(load(join(TMP, "nope.env"))).rejects.toThrow();
    });

    it("acepta objeto de opciones { path }", async () => {
      writeEnv("OBJ_PATH_KEY=hello\n");
      const applied = await load({ path: ENV_FILE });
      expect(process.env.OBJ_PATH_KEY).toBe("hello");
      expect(applied.OBJ_PATH_KEY).toBe("hello");
    });

    it("el retorno contiene solo las variables aplicadas, no las ignoradas", async () => {
      vi.stubEnv("APPLIED_PRESET", "from-shell");
      writeEnv("APPLIED_PRESET=from-file\nAPPLIED_NEW=hello\n");
      const applied = await load(ENV_FILE);
      expect(process.env.APPLIED_PRESET).toBe("from-shell");
      expect(Object.keys(applied)).toEqual(["APPLIED_NEW"]);
      expect(applied.APPLIED_NEW).toBe("hello");
    });

    it("override: true pisa la variable ya seteada y la incluye en el retorno", async () => {
      vi.stubEnv("OVERRIDE_MODE_VAR", "from-shell");
      writeEnv("OVERRIDE_MODE_VAR=from-file\n");
      const applied = await load({ path: ENV_FILE, override: true });
      expect(process.env.OVERRIDE_MODE_VAR).toBe("from-file");
      expect(applied.OVERRIDE_MODE_VAR).toBe("from-file");
    });

    it("override: false (default) no pisa la variable ya seteada ni la retorna", async () => {
      vi.stubEnv("OVERRIDE_MODE_VAR", "from-shell");
      writeEnv("OVERRIDE_MODE_VAR=from-file\n");
      const applied = await load({ path: ENV_FILE, override: false });
      expect(process.env.OVERRIDE_MODE_VAR).toBe("from-shell");
      expect(applied.OVERRIDE_MODE_VAR).toBeUndefined();
    });
  });

  describe("get", () => {
    it("devuelve undefined si la key no existe", () => {
      expect(get("NOPE_NOT_HERE")).toBeUndefined();
    });

    it("devuelve el fallback si la key no existe", () => {
      expect(get("NOPE_NOT_HERE", "default")).toBe("default");
    });

    it("devuelve el valor si la key existe", () => {
      vi.stubEnv("GET_TEST_VAR", "value");
      expect(get("GET_TEST_VAR")).toBe("value");
    });

    it("devuelve el valor si la key existe, ignorando fallback", () => {
      vi.stubEnv("GET_TEST_VAR", "value");
      expect(get("GET_TEST_VAR", "default")).toBe("value");
    });
  });

  describe("requireEnv", () => {
    it("devuelve el valor si la key existe", () => {
      vi.stubEnv("REQ_TEST_VAR", "value");
      expect(requireEnv("REQ_TEST_VAR")).toBe("value");
    });

    it("lanza Error con el nombre de la key si no existe", () => {
      expect(() => requireEnv("MISSING_REQUIRE_KEY")).toThrow(
        /MISSING_REQUIRE_KEY/,
      );
    });
  });
});