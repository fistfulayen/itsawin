// The only module that invokes hc. Addresses stay local to the current host;
// Herdr, rather than WIN, owns SSH connections and terminal lifetimes.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
const exec = promisify(execFile);

export const hcPath =
  process.env.WIN_HC ||
  (existsSync(`${homedir()}/.local/bin/hc`)
    ? `${homedir()}/.local/bin/hc`
    : "hc");
export function cleanText(value) {
  return String(value ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}
export function terminalAddress(value) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9_.-]+$/.test(value) ||
    value.startsWith("-")
  )
    throw new Error("WIN only accepts terminals on this machine");
  return value;
}
export function normalizeList(data, own = process.env.HC_TERMINAL_ID) {
  if (!Array.isArray(data.terminals))
    throw new Error("Unsupported hc list response: expected terminals array");
  return {
    terminals: data.terminals
      .filter(
        (t) =>
          t.state === "live" &&
          t.address !== own &&
          typeof t.address === "string" &&
          !t.address.includes("/"),
      )
      .map((t) => ({
        address: terminalAddress(t.address),
        name: cleanText(t.name || t.address),
        cwd: cleanText(t.foreground?.cwd || t.cwd),
        status: cleanText(
          t.status?.state ||
            (typeof t.status === "string" ? t.status : t.state),
        ),
      })),
  };
}
export async function resolveDirectory(value, base = process.cwd()) {
  if (typeof value !== "string" || !value || /[\x00-\x1f]/.test(value))
    throw new Error("Enter a directory.");
  if (value.startsWith("~") && value !== "~" && !value.startsWith("~/"))
    throw new Error("Use ~ or ~/folder for your home directory.");
  const path = resolve(
    base,
    value === "~"
      ? homedir()
      : value.startsWith("~/")
        ? homedir() + value.slice(1)
        : value,
  );
  try {
    if (!(await stat(path)).isDirectory()) throw new Error();
    await access(path, constants.X_OK);
  } catch {
    throw new Error(`Directory is missing or inaccessible: ${path}`);
  }
  return path;
}
export class Herdr {
  async call(args) {
    try {
      const { stdout } = await exec(hcPath, ["--json", ...args], {
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (error) {
      let message = error.stderr || error.message;
      try {
        message = JSON.parse(error.stderr).error.message;
      } catch {}
      throw new Error(cleanText(message));
    }
  }
  async list() {
    return normalizeList(await this.call(["ls"]));
  }
  async create({ name, machine = "", cwd = "" }) {
    if (!/^[a-z0-9_-]{1,32}$/.test(name))
      throw new Error("Name: 1–32 lowercase letters, numbers, - or _");
    const args = ["run", "--bg", "--no-parent", "--no-notify", "--name", name];
    if (machine)
      throw new Error(
        "Choose the host in Herdr; WIN creates terminals only on this machine",
      );
    cwd = await resolveDirectory(cwd || process.cwd());
    args.push("--cwd", cwd);
    // Explicit program bypasses the core's configured WIN launcher. The constant
    // command resolves the login shell on the target machine, not on the Mac.
    args.push("--", "/bin/sh", "-c", 'exec "${SHELL:-/bin/sh}" -l');
    const result = await this.call(args);
    return {
      address: terminalAddress(result.address),
      name,
      cwd,
      status: "live",
    };
  }
}
