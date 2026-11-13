#!/usr/bin/env node
// Contract fixture for hc 0.1.x JSON and PTY attach behavior. No real core touched.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
const path = process.env.WIN_FIXTURE_STATE;
if (!path) throw new Error("Test fixture requires WIN_FIXTURE_STATE");
const args = process.argv.slice(2).filter((a) => a !== "--json");
appendFileSync(`${path}.calls`, JSON.stringify(args) + "\n");
const load = () => JSON.parse(readFileSync(path, "utf8"));
const json = (data) => console.log(JSON.stringify(data));
const option = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
if (args[0] === "ls") json(load());
else if (args[0] === "run") {
  if (!args.includes("--no-parent") || !args.includes("--bg"))
    throw new Error("Persistent independent terminal required");
  if (args[args.indexOf("--") + 1] !== "/bin/sh")
    throw new Error("Inner terminals must bypass the default WIN launcher");
  const data = load(),
    machine = option("--on"),
    name = option("--name");
  if (!/^[a-z0-9_-]{1,32}$/.test(name))
    throw new Error("hc names must be 1–32 of a-z 0-9 - _");
  const address = `${machine ? machine + "/" : ""}t${data.terminals.length + 1}`;
  data.terminals.push({
    address,
    name,
    state: "live",
    cwd: option("--cwd") || "/home/test",
    status: { state: "idle" },
  });
  writeFileSync(path, JSON.stringify(data));
  json({ address });
} else if (args[0] === "attach") {
  if (!process.stdin.isTTY) throw new Error("attach requires a PTY");
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdout.write("\x1b[2J\x1b[HHC_FIXTURE_READY\r\n");
  process.stdin.on("data", (data) => {
    if (args.includes("--observe")) return;
    process.stdout.write(data);
  });
  process.stdout.on("resize", () =>
    process.stdout.write(
      `\r\nSIZE:${process.stdout.columns}x${process.stdout.rows}\r\n`,
    ),
  );
  for (const signal of ["SIGTERM", "SIGHUP"])
    process.on(signal, () => {
      appendFileSync(
        `${path}.calls`,
        JSON.stringify(["viewer-disconnected", signal]) + "\n",
      );
      process.exit(0);
    });
} else throw new Error(`Unexpected hc command ${args[0]}`);
