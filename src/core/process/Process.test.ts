import { describe, it, expect } from "vitest";
import { Process, Command, LiveProcess, Result, ProcessError } from "./index.js";
import * as path from "node:path";
import * as os from "node:os";

const isWin = process.platform === "win32";

describe("Process", () => {
  const proc = new Process();

  describe("run", () => {
    it("executes a command and captures stdout", async () => {
      const result = await proc.run("echo", "hello");
      expect(result.stdout.trim()).toBe("hello");
      expect(result.ok).toBe(true);
      expect(result.failed).toBe(false);
      expect(result.exitCode).toBe(0);
    });

    it("captures stderr", async () => {
      const node = path.join(
        path.dirname(process.execPath),
        isWin ? "node.exe" : "node",
      );
      const result = await proc.run(node, "-e", "process.stderr.write('err')");
      expect(result.stderr).toBe("err");
    });

    it("captures non-zero exit code", async () => {
      const result = await proc.run("node", "-e", "process.exit(3)");
      expect(result.exitCode).toBe(3);
      expect(result.failed).toBe(true);
    });

    it("has durationMs", async () => {
      const result = await proc.run("node", "-e", "setTimeout(()=>{},50)");
      expect(result.durationMs).toBeGreaterThanOrEqual(40);
    });

    it("result has json() accessor", async () => {
      const result = await proc.run("node", "-e", "console.log(JSON.stringify({ok:true}))");
      expect(result.json()).toEqual({ ok: true });
    });

    it("result has lines accessor", async () => {
      const result = await proc.run("node", "-e", "console.log('a\\nb\\nc')");
      expect(result.lines).toEqual(["a", "b", "c"]);
    });

    it("result has throwIfFailed that throws ProcessError", async () => {
      const result = await proc.run("node", "-e", "process.exit(1)");
      try {
        result.throwIfFailed();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ProcessError);
        expect(err).toBeInstanceOf(Error);
        const pe = err as ProcessError;
        expect(pe.command).toBe("node");
        expect(pe.kind).toBe("exit");
        expect(pe.exitCode).toBe(1);
        expect(pe.signal).toBeNull();
      }
    });
  });

  describe("shell", () => {
    it("executes a shell script", async () => {
      const result = await proc.shell("echo hello");
      expect(result.stdout.trim()).toBe("hello");
    });
  });

  describe("exists", () => {
    it("returns true for node", async () => {
      expect(await proc.exists("node")).toBe(true);
    });

    it("returns false for non-existent command", async () => {
      expect(await proc.exists("nonexistent-cmd-xyz123")).toBe(false);
    });
  });

  describe("which", () => {
    it("returns path for node", async () => {
      const result = await proc.which("node");
      expect(result).not.toBeNull();
      expect(result).toContain("node");
    });

    it("returns null for non-existent", async () => {
      expect(await proc.which("nonexistent-xyz123")).toBeNull();
    });
  });
});

describe("Command builder", () => {
  it("builds with args fluently", () => {
    const cmd = new Command("git").withArgs("log", "--oneline");
    expect(cmd.command).toBe("git");
    expect(cmd.args).toEqual(["log", "--oneline"]);
  });

  it("run executes the built command", async () => {
    const result = await new Command("echo").withArgs("built").run();
    expect(result.stdout.trim()).toBe("built");
  });

  it("in() changes cwd", async () => {
    const tmp = os.tmpdir();
    const result = await new Command("pwd").in(tmp).run();
    if (!isWin) {
      expect(result.stdout.trim()).toBe(path.resolve(tmp));
    }
  });

  it("withEnv() sets environment variables", async () => {
    const result = await new Command("node")
      .withArgs("-e", "console.log(process.env.MY_TEST_VAR)")
      .withEnv({ MY_TEST_VAR: "hello-env" })
      .run();
    expect(result.stdout.trim()).toBe("hello-env");
  });

  it("withInput() sends data to stdin", async () => {
    const result = await new Command("node")
      .withArgs("-e", "process.stdin.pipe(process.stdout)")
      .withInput("piped")
      .run();
    expect(result.stdout.trim()).toBe("piped");
  });

  it("throwOnError() rejects with ProcessError on non-zero", async () => {
    try {
      await new Command("node").withArgs("-e", "process.exit(1)").throwOnError().run();
      expect.fail("should have rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(ProcessError);
      expect((err as ProcessError).kind).toBe("exit");
      expect((err as ProcessError).exitCode).toBe(1);
    }
  });
});

describe("LiveProcess", () => {
  it("spawn returns an interactive handle", async () => {
    const handle = new Process().spawn("node", "-i");
    expect(handle.running).toBe(true);
    expect(handle.pid).toBeTypeOf("number");
    handle.kill();
    await handle.wait();
    expect(handle.ended).toBe(true);
  });

  it("sendLine writes to stdin", async () => {
    const handle = new Process().spawn(
      "node",
      "-e",
      "process.stdin.pipe(process.stdout)",
    );
    handle.sendLine("interactive");
    handle.endInput();
    const result = await handle.wait();
    expect(result.stdout.trim()).toBe("interactive");
  });

  it("onStdout receives chunks", async () => {
    const handle = new Process().spawn("node", "-e", "process.stdout.write('chunk')");
    const chunks: string[] = [];
    handle.onStdout((c) => chunks.push(c.toString()));
    await handle.wait();
    expect(chunks.join("")).toBe("chunk");
  });

  it("kill terminates the process", async () => {
    const handle = new Process().spawn("node", "-e", "setInterval(()=>{},1000)");
    handle.kill("SIGTERM");
    const result = await handle.wait();
    expect(result.signal).toBe("SIGTERM");
  });

  it("onExit callback fires with result", async () => {
    const handle = new Process().spawn("echo", "cb");
    let captured: Result | null = null;
    handle.onExit((r) => (captured = r));
    await handle.wait();
    expect(captured).not.toBeNull();
    expect(captured!.stdout.trim()).toBe("cb");
  });

  it("wait() rejects with ProcessError on spawn failure (ENOENT)", async () => {
    const handle = new Process().spawn("nonexistent-binary-xyz123");
    try {
      await handle.wait();
      expect.fail("should have rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(ProcessError);
      const pe = err as ProcessError;
      expect(pe.command).toBe("nonexistent-binary-xyz123");
      expect(pe.kind).toBe("spawn");
      expect(pe.exitCode).toBeNull();
      expect(pe.cause).toBeDefined();
    }
  });
});

describe("Result", () => {
  it("lines splits stdout", () => {
    const r = new Result("cmd", [], "a\nb\nc\n", "", 0, null, 0);
    expect(r.lines).toEqual(["a", "b", "c"]);
  });

  it("output combines stdout and stderr", () => {
    const r = new Result("cmd", [], "out", "err", 0, null, 0);
    expect(r.output).toBe("outerr");
  });

  it("json parses stdout", () => {
    const r = new Result("cmd", [], '{"x":1}', "", 0, null, 0);
    expect(r.json()).toEqual({ x: 1 });
  });

  it("throwIfFailed throws ProcessError on non-zero", () => {
    const r = new Result("mycmd", ["--flag"], "", "err", 2, null, 0);
    try {
      r.throwIfFailed();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProcessError);
      const pe = err as ProcessError;
      expect(pe.command).toBe("mycmd");
      expect(pe.args).toEqual(["--flag"]);
      expect(pe.kind).toBe("exit");
      expect(pe.exitCode).toBe(2);
      expect(pe.stderr).toBe("err");
    }
  });

  it("throwIfFailed returns this on success", () => {
    const r = new Result("cmd", [], "", "", 0, null, 0);
    expect(r.throwIfFailed()).toBe(r);
  });
});