import { describe, it, expect } from "vitest";
import { Shell, Job } from "./index.js";
import * as path from "node:path";
import * as os from "node:os";

const isWin = process.platform === "win32";

describe("Shell", () => {
  describe("run", () => {
    it("executes a shell script and captures stdout", async () => {
      const sh = new Shell();
      const result = await sh.run("echo hola");
      expect(result.stdout.trim()).toBe("hola");
      expect(result.ok).toBe(true);
    });

    it("captures non-zero exit code", async () => {
      const sh = new Shell();
      const result = await sh.run("node -e 'process.exit(5)'");
      expect(result.exitCode).toBe(5);
      expect(result.failed).toBe(true);
    });

    it("result has json() and lines", async () => {
      const sh = new Shell();
      const result = await sh.run("echo '{\"ok\":true}'");
      expect(result.json()).toEqual({ ok: true });
    });
  });

  describe("$ tagged template", () => {
    it("interpolates strings safely", async () => {
      const sh = new Shell();
      const name = "world";
      const result = await sh.$`echo hello ${name}`;
      expect(result.stdout.trim()).toBe("hello world");
    });

    it("quotes strings with special characters", async () => {
      const sh = new Shell();
      const value = "a b'c";
      const result = await sh.$`echo ${value}`;
      expect(result.stdout.trim()).toBe("a b'c");
    });

    it("expands arrays as separate arguments", async () => {
      const sh = new Shell();
      const files = ["x", "y", "z"];
      const result = await sh.$`echo ${files}`;
      expect(result.stdout.trim()).toBe("x y z");
    });

    it("interpolates numbers and booleans", async () => {
      const sh = new Shell();
      const n = 42;
      const b = true;
      const result = await sh.$`echo ${n} ${b}`;
      expect(result.stdout.trim()).toBe("42 true");
    });

    it("throws on unsupported object type", async () => {
      const sh = new Shell();
      expect(() => sh.$`echo ${{ a: 1 }}`).toThrow();
    });
  });

  describe("pipe", () => {
    it("pipes output between commands", async () => {
      const sh = new Shell();
      const result = await sh.pipe(
        "printf 'foo\\nbar\\nfoo\\nbaz\\n'",
        "grep foo",
        "wc -l",
      );
      expect(result.stdout.trim()).toBe("2");
    });

    it("throws on empty input", async () => {
      const sh = new Shell();
      await expect(sh.pipe()).rejects.toThrow();
    });

    it("single command returns its result", async () => {
      const sh = new Shell();
      const result = await sh.pipe("echo solo");
      expect(result.stdout.trim()).toBe("solo");
    });
  });

  describe("chain", () => {
    it("runs commands sequentially", async () => {
      const sh = new Shell();
      const results = await sh.chain("echo step1", "echo step2");
      expect(results).toHaveLength(2);
      expect(results[0]!.stdout.trim()).toBe("step1");
      expect(results[1]!.stdout.trim()).toBe("step2");
    });

    it("stops on first failure", async () => {
      const sh = new Shell();
      const results = await sh.chain(
        "node -e 'process.exit(1)'",
        "echo should-not-run",
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.failed).toBe(true);
    });
  });

  describe("ifOk / ifFail", () => {
    it("ifOk runs then-branch on success", async () => {
      const sh = new Shell();
      const result = await sh.ifOk("true", "echo then");
      expect(result?.stdout.trim()).toBe("then");
    });

    it("ifOk returns null on failure", async () => {
      const sh = new Shell();
      const result = await sh.ifOk("node -e 'process.exit(1)'", "echo nope");
      expect(result).toBeNull();
    });

    it("ifFail runs then-branch on failure", async () => {
      const sh = new Shell();
      const result = await sh.ifFail("node -e 'process.exit(1)'", "echo rescue");
      expect(result?.stdout.trim()).toBe("rescue");
    });

    it("ifFail returns null on success", async () => {
      const sh = new Shell();
      const result = await sh.ifFail("true", "echo nope");
      expect(result).toBeNull();
    });
  });

  describe("spawnScript", () => {
    it("returns an interactive LiveProcess", async () => {
      const sh = new Shell();
      const handle = sh.spawnScript("node -e 'process.stdin.pipe(process.stdout)'");
      handle.write("live");
      handle.endInput();
      const result = await handle.wait();
      expect(result.stdout.trim()).toBe("live");
    });
  });

  describe("bg", () => {
    it("runs in background and returns Job", async () => {
      const sh = new Shell();
      const job = sh.bg("echo bg-test");
      expect(job).toBeInstanceOf(Job);
      const result = await job.result();
      expect(result.stdout.trim()).toBe("bg-test");
    });

    it("onStdout receives chunks", async () => {
      const sh = new Shell();
      const job = sh.bg("echo chunk-test");
      const chunks: string[] = [];
      job.onStdout((c) => chunks.push(c.toString()));
      await job.result();
      expect(chunks.join("").trim()).toBe("chunk-test");
    });

    it("exposes stdin/stdout/stderr from underlying LiveProcess", () => {
      const sh = new Shell();
      const job = sh.bg("echo streams");
      expect(job.stdin).toBeDefined();
      expect(job.stdout).toBeDefined();
      expect(job.stderr).toBeDefined();
    });
  });

  describe("exists / which", () => {
    it("exists returns true for node", async () => {
      const sh = new Shell();
      expect(await sh.exists("node")).toBe(true);
    });

    it("exists returns false for non-existent", async () => {
      const sh = new Shell();
      expect(await sh.exists("nonexistent-xyz123")).toBe(false);
    });

    it("which returns path for node", async () => {
      const sh = new Shell();
      const result = await sh.which("node");
      expect(result).not.toBeNull();
      expect(result).toContain("node");
    });

    it("which returns null for non-existent", async () => {
      const sh = new Shell();
      expect(await sh.which("nonexistent-xyz123")).toBeNull();
    });
  });

  describe("cd", () => {
    it("changes working directory", async () => {
      const tmp = os.tmpdir();
      const sh = new Shell({ cwd: process.cwd() });
      sh.cd(tmp);
      expect(sh.cwd).toBe(tmp);
      const result = await sh.run("pwd");
      if (!isWin) {
        expect(result.stdout.trim()).toBe(path.resolve(tmp));
      }
    });
  });

  describe("set / unset env", () => {
    it("set adds environment variable", async () => {
      const sh = new Shell();
      sh.set("MY_SHELL_VAR", "test123");
      const result = await sh.run("echo $MY_SHELL_VAR");
      expect(result.stdout.trim()).toBe("test123");
    });

    it("unset removes environment variable", async () => {
      const sh = new Shell();
      sh.set("MY_SHELL_VAR", "test123");
      sh.unset("MY_SHELL_VAR");
      const result = await sh.run("echo $MY_SHELL_VAR");
      expect(result.stdout.trim()).toBe("");
    });
  });

  describe("alias", () => {
    it("alias replaces first word", async () => {
      const sh = new Shell();
      sh.alias("myecho", "echo");
      const result = await sh.run("myecho aliased");
      expect(result.stdout.trim()).toBe("aliased");
    });

    it("unalias removes the alias", async () => {
      const sh = new Shell();
      sh.alias("myecho", "echo");
      sh.unalias("myecho");
      const result = await sh.run("myecho test");
      expect(result.failed).toBe(true);
    });
  });

  describe("history", () => {
    it("records executed commands", async () => {
      const sh = new Shell();
      await sh.run("echo cmd1");
      await sh.run("echo cmd2");
      expect(sh.history).toHaveLength(2);
      expect(sh.history[0]!.command).toBe("echo cmd1");
      expect(sh.history[1]!.command).toBe("echo cmd2");
    });

    it("clearHistory empties the history", async () => {
      const sh = new Shell();
      await sh.run("echo x");
      sh.clearHistory();
      expect(sh.history).toHaveLength(0);
    });

    it("lastCommand returns the last entry", async () => {
      const sh = new Shell();
      await sh.run("echo last");
      expect(sh.lastCommand()?.command).toBe("echo last");
    });
  });

});