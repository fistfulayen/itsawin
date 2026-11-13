import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeClaude, sessionId } from "../src/agents.mjs";

const id = "12345678-abcd-4321-abcd-123456789012";
test("resume passes UUID and directory as arguments, reuses live WIN terminal, and never kills sessions", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "win project $() "));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const calls = [],
    terminals = [];
  const backend = {
    list: async () => ({ terminals }),
    call: async (args) => {
      calls.push(args);
      return { address: "t99" };
    },
  };
  const entry = await resumeClaude(
    backend,
    id,
    cwd,
    async () => "/some path/claude",
  );
  assert.equal(entry.address, "t99");
  assert.equal(calls.length, 1);
  assert.match(entry.name, /^wc-[a-f0-9]{28}$/);
  assert.deepEqual(calls[0].slice(-8), [
    "/bin/sh",
    "-c",
    'exec "$@"',
    "win-claude",
    "/some path/claude",
    "--resume",
    id,
    "--chrome",
  ]);
  assert.equal(calls[0][calls[0].indexOf("--cwd") + 1], cwd);
  assert.ok(calls[0].includes("--no-parent"));
  terminals.push({ ...entry, cwd: "/a/different/current/folder" });
  assert.equal((await resumeClaude(backend, id, cwd)).address, "t99");
  assert.equal(calls.length, 1);
  await assert.rejects(resumeClaude(backend, "--bad", cwd), /UUID/);
  await assert.rejects(
    resumeClaude(backend, id, join(cwd, "missing")),
    /Directory/,
  );
  assert.equal(calls.length, 1);
  assert.equal(sessionId(id.toUpperCase()), id);
});

test("Codex resumes the exact conversation with its own CLI syntax", async () => {
  const { resumeCodex } = await import("../src/agents.mjs");
  let command;
  const backend = {
    list: async () => ({ terminals: [] }),
    call: async (args) => {
      command = args;
      return { address: "t100" };
    },
  };
  await resumeCodex(
    backend,
    id,
    process.cwd(),
    async () => "/opt/homebrew/bin/codex",
  );
  assert.deepEqual(command.slice(-3), [
    "/opt/homebrew/bin/codex",
    "resume",
    id,
  ]);
  assert.match(command[command.indexOf("--name") + 1], /^wx-[a-f0-9]{28}$/);
});

test("Chrome can be explicitly disabled for a newly resumed Claude terminal", async () => {
  let command;
  const backend = {
    list: async () => ({ terminals: [] }),
    call: async (args) => {
      command = args;
      return { address: "t101" };
    },
  };
  await resumeClaude(
    backend,
    id,
    process.cwd(),
    async () => "/fixture/claude",
    { chrome: false },
  );
  assert.equal(command.at(-1), "--no-chrome");
  assert.ok(!command.includes("--chrome"));
});
