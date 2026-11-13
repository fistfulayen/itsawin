import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test(
  "hc contract: discover, create on this host, attach, resize, detach without killing terminal",
  { timeout: 10000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "win-provider-"));
    const fixture = fileURLToPath(
      new URL("./fixtures/fake-hc.mjs", import.meta.url),
    );
    await chmod(fixture, 0o755);
    process.env.WIN_HC = fixture;
    process.env.WIN_FIXTURE_STATE = join(dir, "state.json");
    await writeFile(
      process.env.WIN_FIXTURE_STATE,
      JSON.stringify({
        terminals: [],
        machines: [{ name: "vps", state: "connected" }],
      }),
    );
    const { Herdr } = await import("../src/herdr.mjs");
    const { Session } = await import("../src/session.mjs");
    const backend = new Herdr();
    assert.equal((await backend.list()).machines, undefined);
    await assert.rejects(
      backend.create({ name: "bad", machine: "vps" }),
      /Choose the host/,
    );
    const entry = await backend.create({ name: "work", cwd: "/tmp" });
    assert.equal(entry.address, "t1");
    assert.equal(entry.cwd, "/tmp");
    let session, waiter;
    const text = () =>
      Array.from(
        { length: session.term.rows },
        (_, i) =>
          session.term.buffer.active.getLine(i)?.translateToString() || "",
      ).join("\n");
    const until = (marker) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiter = undefined;
          reject(new Error(`Missing ${marker}: ${text()}`));
        }, 2000);
        waiter = () => {
          if (text().includes(marker)) {
            clearTimeout(timer);
            waiter = undefined;
            resolve();
          }
        };
        waiter();
      });
    session = new Session(entry, {
      cols: 60,
      rows: 18,
      dirty: () => waiter?.(),
    });
    t.after(async () => {
      session.dispose();
      await rm(dir, { recursive: true, force: true });
    });
    await until("HC_FIXTURE_READY");
    session.input("HELLO_CORE");
    await until("HELLO_CORE");
    session.resize(72, 22);
    await until("SIZE:72x22");
    session.dispose();
    const oldOwner = process.env.HC_TERMINAL_ID;
    process.env.HC_TERMINAL_ID = "tviewer";
    try {
      await backend.associate(entry);
    } finally {
      if (oldOwner === undefined) delete process.env.HC_TERMINAL_ID;
      else process.env.HC_TERMINAL_ID = oldOwner;
    }
    const state = JSON.parse(
      await readFile(process.env.WIN_FIXTURE_STATE, "utf8"),
    );
    assert.equal(state.terminals[0].labels["itsawin.viewer"], "tviewer");
    assert.ok(!state.terminals[0].labels["herdr.space"]);
    const after = await backend.list();
    assert.equal(after.terminals[0].address, "t1");
    assert.equal(after.terminals[0].status, "idle");
    const { resumeClaude } = await import("../src/agents.mjs");
    const id = "12345678-abcd-4321-abcd-123456789012";
    const resumed = await resumeClaude(
      backend,
      id,
      dir,
      async () => "/fixture/claude",
    );
    assert.match(resumed.name, /^wc-[a-f0-9]{28}$/);
    assert.equal(
      (await resumeClaude(backend, id, dir)).address,
      resumed.address,
    );
    await assert.rejects(
      backend.call([
        "run",
        "--bg",
        "--no-parent",
        "--name",
        `win-claude-${id}`,
        "--",
        "/bin/sh",
      ]),
      /1–32/,
    );
    const calls = (
      await readFile(`${process.env.WIN_FIXTURE_STATE}.calls`, "utf8")
    )
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.ok(calls.some((c) => c[0] === "attach" && c[1] === "t1"));
    assert.ok(!calls.some((c) => c.includes("--on")));
    assert.ok(!calls.some((c) => ["kill", "rm", "server"].includes(c[0])));
  },
);
