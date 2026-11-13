#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { adapt } from "../src/adapter.mjs";
import { hostname } from "node:os";
import { Herdr, hcPath, resolveDirectory } from "../src/herdr.mjs";

import { sessionId } from "../src/agents.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`WIN — Win-Win artwork + persistent Herdr terminals

Usage: npm start -- [--demo] [--theme p1|p3] [--host-label name] [--source path]
       npm start -- --claude-resume UUID --cwd DIRECTORY [--chrome|--no-chrome]
       npm start -- --codex-resume UUID --cwd DIRECTORY
       npm start -- --doctor

Window > Connect session… or Ctrl-G, N opens the chooser.
Ctrl-G, W: next window    Ctrl-G, Z: zoom    Ctrl-G, D: detach
Ctrl-G, M: menu           Ctrl-G, Q: quit    Ctrl-G twice: literal Ctrl-G
Ctrl-G, R: reconnect the focused terminal
Ctrl-C and other application keys go to the focused terminal.

All windows use the selected theme. Only this machine’s sessions are offered.
New terminals belong to Herdr and outlive this viewer.
WIN_HC overrides the hc executable. --demo never connects to Herdr.
`);
  process.exit(0);
}
if (args.includes("--doctor")) {
  try {
    const list = await new Herdr().list();
    console.log(JSON.stringify({ hc: hcPath, ...list }, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
} else {
  try {
    if (!process.stdout.isTTY)
      throw new Error(
        "WIN needs an interactive terminal. Run npm start in a Herdr or Ghostty terminal tab.",
      );
    let sourcePath = resolve(root, "tty.mjs"),
      theme = "p1";
    process.env.WIN_HOST_LABEL ||=
      process.platform === "darwin" ? "Mac" : hostname();
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--demo") process.env.WIN_DEMO = "1";
      else if (args[i] === "--chrome") process.env.WIN_CLAUDE_CHROME = "1";
      else if (args[i] === "--no-chrome") process.env.WIN_CLAUDE_CHROME = "0";
      else if (args[i] === "--codex-resume" && args[i + 1])
        process.env.WIN_CODEX_RESUME = sessionId(args[++i]);
      else if (args[i] === "--claude-resume" && args[i + 1])
        process.env.WIN_CLAUDE_RESUME = sessionId(args[++i]);
      else if (args[i] === "--cwd" && args[i + 1])
        process.chdir(await resolveDirectory(args[++i]));
      else if (args[i] === "--host-label" && args[i + 1])
        process.env.WIN_HOST_LABEL = args[++i];
      else if (args[i] === "--source" && args[i + 1])
        sourcePath = resolve(args[++i]);
      else if (args[i] === "--theme" && args[i + 1]) theme = args[++i];
      else throw new Error(`Unknown or incomplete option: ${args[i]}`);
    }
    if (!["p1", "p3"].includes(theme))
      throw new Error("Theme must be p1 or p3");
    process.env.WIN_THEME = theme;
    const source = await readFile(sourcePath, "utf8");
    const output = adapt(
      source,
      pathToFileURL(resolve(root, "src/plugin.mjs")).href,
    );
    const cache = resolve(root, ".win-cache");
    await mkdir(cache, { recursive: true });
    const target = resolve(cache, "client.mjs");
    await writeFile(target, output);
    process.argv = [
      process.argv[0],
      target,
      `theme=${theme}`,
      "menuFeedback=false",
      "cursorFeedback=false",
    ];
    await import(pathToFileURL(target).href);
  } catch (e) {
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}
