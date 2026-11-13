import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeList, terminalAddress } from "../src/herdr.mjs";
import { InputParser } from "../src/input.mjs";
import { adapt } from "../src/adapter.mjs";
import { cellText } from "../src/session.mjs";

test("Herdr list excludes remote addresses and the viewer itself", () => {
  const list = normalizeList(
    {
      terminals: [
        { address: "t1", state: "live" },
        {
          address: "vps/t2",
          name: "\x1bBAD",
          state: "live",
          cwd: "/home/user",
        },
        { address: "t3", state: "finished" },
        { address: "t4", name: "\x1bBAD", state: "live" },
      ],
      machines: [{ name: "vps", state: "connected" }],
    },
    "t1",
  );
  assert.equal(list.terminals.length, 1);
  assert.equal(list.terminals[0].address, "t4");
  assert.ok(!list.terminals[0].name.includes("\x1b"));
  assert.throws(() => terminalAddress("--bad"));
  assert.throws(() => terminalAddress("vps/t2"));
  assert.equal(list.machines, undefined);
});
test("input buffers split escape sequences and isolates paste from commands", () => {
  const events = [],
    parser = new InputParser((e) => events.push(e));
  parser.feed("\x1b[");
  parser.feed("A\x1b[<0;");
  parser.feed("12;6M");
  parser.feed("\x1b[200~hello\x07q\x1b[20");
  parser.feed("1~");
  assert.equal(events[0].raw, "\x1b[A");
  assert.deepEqual(
    [events[1].type, events[1].x, events[1].y],
    ["mouse", 11, 5],
  );
  assert.deepEqual(events[2], { type: "paste", data: "hello\x07q" });
  parser.dispose();
});
test(
  "adapter rejects drift and keeps the original artwork header",
  { skip: !existsSync(new URL("../tty.mjs", import.meta.url)) },
  async () => {
    const source = await readFile(
      new URL("../tty.mjs", import.meta.url),
      "utf8",
    );
    const output = adapt(source, "file:///plugin.mjs");
    assert.match(output, /All rights reserved/);
    assert.match(output, /Connect|onnect session/);
    assert.match(output, /winPlugin.input/);
    assert.throws(
      () => adapt(source + " ", "file:///plugin.mjs"),
      /Unsupported/,
    );
  },
);
test("wide cells cannot spill through artwork window borders", () => {
  assert.equal(cellText({ getWidth: () => 2, getChars: () => "界" }), "□");
  assert.equal(cellText({ getWidth: () => 0 }), " ");
  assert.equal(cellText({ getWidth: () => 1, getChars: () => "é" }), "é");
});

test("working directory resolves home and relative paths and rejects files or missing folders", async () => {
  const { resolveDirectory } = await import("../src/herdr.mjs");
  const { homedir } = await import("node:os");
  const { resolve } = await import("node:path");
  assert.equal(await resolveDirectory("~"), homedir());
  assert.equal(await resolveDirectory("~/"), homedir());
  assert.equal(await resolveDirectory("src"), resolve("src"));
  await assert.rejects(
    resolveDirectory("package.json"),
    /missing or inaccessible/,
  );
  await assert.rejects(
    resolveDirectory("/no-such-win-directory-51739"),
    /missing or inaccessible/,
  );
  await assert.rejects(resolveDirectory("~someone"), /Use ~/);
});
