import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { load, get, require as requireEnv } from "./env.js";

const TMP = join(process.cwd(), "tmp-env-test");
const ENV_FILE = join(TMP, ".env");

function writeEnv(content: string): void {
  writeFileSync(ENV_FILE, content, "utf8");
}

function saveEnv(keys: string[]): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
    delete process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const TRACKED_KEYS = [
  "SIMPLE_KEY",
  "QUOTED_KEY",
  "COMMENT_KEY",
  "HOST",
  "URL",
  "CHAIN_A",
  "CHAIN_B",
  "CHAIN_C",
  "CIRC_A",
  "CIRC_B",
  "MISSING_REF",
  "PRESET_VAR",
  "UNRESOLVED",
];

describe("env", () => {
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    snapshot = saveEnv(TRACKED_KEYS);
  });

  afterEach(() => {
    restoreEnv(snapshot);
    rmSync(TMP, { recursive: true, force: true });
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
      process.env.PRESET_VAR = "from-shell";
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
  });

  describe("get", () => {
    it("devuelve undefined si la key no existe", () => {
      expect(get("NOPE_NOT_HERE")).toBeUndefined();
    });

    it("devuelve el fallback si la key no existe", () => {
      expect(get("NOPE_NOT_HERE", "default")).toBe("default");
    });

    it("devuelve el valor si la key existe", () => {
      process.env.SIMPLE_KEY = "value";
      expect(get("SIMPLE_KEY")).toBe("value");
    });

    it("devuelve el valor si la key existe, ignorando fallback", () => {
      process.env.SIMPLE_KEY = "value";
      expect(get("SIMPLE_KEY", "default")).toBe("value");
    });
  });

  describe("require", () => {
    it("devuelve el valor si la key existe", () => {
      process.env.SIMPLE_KEY = "value";
      expect(requireEnv("SIMPLE_KEY")).toBe("value");
    });

    it("lanza Error con el nombre de la key si no existe", () => {
      expect(() => requireEnv("MISSING_REQUIRE_KEY")).toThrow(
        /MISSING_REQUIRE_KEY/,
      );
    });
  });
});