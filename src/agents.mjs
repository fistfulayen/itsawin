// Create persistent agent terminals independently of the artwork viewer.
// Stable short names make sequential resume requests reuse a live terminal.
import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  resolveDirectory,
  terminalAddress,
  viewerLabelArgs,
} from "./herdr.mjs";

export function sessionId(value) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value || "",
    )
  )
    throw new Error("Agent resume requires a conversation UUID.");
  return value.toLowerCase();
}
export function resumeClaude(
  backend,
  id,
  directory,
  findExecutable,
  { chrome = true } = {},
) {
  return resumeAgent(
    "claude",
    backend,
    id,
    directory,
    findExecutable,
    chrome ? ["--chrome"] : ["--no-chrome"],
  );
}
export function resumeCodex(backend, id, directory, findExecutable) {
  return resumeAgent("codex", backend, id, directory, findExecutable);
}
async function resumeAgent(
  agent,
  backend,
  id,
  directory,
  findExecutable = () => agentExecutable(agent),
  flags = [],
) {
  id = sessionId(id);
  const cwd = await resolveDirectory(directory);
  // hc accepts only 1–32 lowercase letters, digits, hyphens and underscores.
  const name = `${agent === "claude" ? "wc" : "wx"}-${createHash("sha256")
    .update(agent + ":" + id)
    .digest("hex")
    .slice(0, 28)}`;
  const existing = (await backend.list()).terminals.find(
    (t) => t.name === name,
  );
  if (existing) return existing;
  const executable = await findExecutable();
  // Arguments are passed separately, never interpolated into shell source.
  const result = await backend.call([
    "run",
    "--bg",
    "--no-parent",
    "--no-notify",
    ...viewerLabelArgs(),
    "--label",
    `itsawin.agent=${agent}`,
    "--name",
    name,
    "--cwd",
    cwd,
    "--",
    "/bin/sh",
    "-c",
    'exec "$@"',
    `win-${agent}`,
    executable,
    agent === "codex" ? "resume" : "--resume",
    id,
    ...flags,
  ]);
  return {
    address: terminalAddress(result.address),
    name,
    cwd,
    status: "live",
  };
}

async function agentExecutable(agent) {
  const candidates = [
    join(homedir(), ".local/bin", agent),
    ...(process.env.PATH || "")
      .split(":")
      .filter(Boolean)
      .map((p) => join(p, agent)),
  ];
  let executable;
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK);
      executable = path;
      break;
    } catch {}
  }
  if (!executable)
    throw new Error(`${agent} is not installed or not on this host’s PATH.`);
  return executable;
}
