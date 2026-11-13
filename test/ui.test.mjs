import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import pty from "node-pty";
import xterm from "@xterm/headless";
import { fileURLToPath } from "node:url";

for (const [theme, host, color, other] of [
  ["p1", "Mac", 40, 166],
  ["p3", "VPS", 166, 40],
])
  test(
    `${host}: local chooser, theme, terminal I/O, resize, detach and quit`,
    {
      timeout: 20000,
      skip: !existsSync(new URL("../tty.mjs", import.meta.url)),
    },
    async (t) => {
      const screen = new xterm.Terminal({
        cols: 110,
        rows: 38,
        allowProposedApi: true,
      });
      const child = pty.spawn(
        process.execPath,
        ["bin/win.mjs", "--demo", "--theme", theme, "--host-label", host],
        {
          cwd: fileURLToPath(new URL("..", import.meta.url)),
          cols: 110,
          rows: 38,
          env: { ...process.env, TERM: "xterm-256color" },
        },
      );
      let output = "",
        exited = false;
      const waiters = new Set();
      const text = () =>
        Array.from(
          { length: screen.rows },
          (_, i) => screen.buffer.active.getLine(i)?.translateToString() || "",
        ).join("\n");
      const update = () => {
        for (const fn of waiters) fn();
      };
      child.onData((data) => {
        output += data;
        screen.write(data, update);
      });
      child.onExit(() => {
        exited = true;
        update();
      });
      t.after(() => {
        if (!exited) child.kill();
        screen.dispose();
      });
      const until = (predicate, description) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            waiters.delete(check);
            reject(
              new Error(`${description}\n${text()}\n${output.slice(-1200)}`),
            );
          }, 4000);
          function check() {
            if (predicate()) {
              clearTimeout(timer);
              waiters.delete(check);
              resolve();
            }
          }
          waiters.add(check);
          check();
        });
      await until(() => text().includes("local-preview"), "chooser");
      assert.ok(!text().includes("remote-preview"));
      child.write("\x1b[B\r");
      await until(
        () => text().includes(`Connect to ${host}`),
        "connect confirmation",
      );
      child.write("\r");
      await until(() => text().includes("Simulated session"), "local terminal");
      child.write("hello-win\r");
      await until(
        () => text().includes("You typed: hello-win"),
        "typing reaches terminal",
      );
      assert.ok(output.includes(`38;5;${color}`));
      assert.ok(!output.includes(`38;5;${other}m`));
      child.write("\x07n");
      await until(
        () =>
          text().includes("local-preview") && text().includes("New Terminal"),
        "new terminal chooser",
      );
      child.write("\r");
      await until(() => text().includes("Directory:"), "creation form");
      const directory = fileURLToPath(new URL("..", import.meta.url)).replace(
        /\/$/,
        "",
      );
      child.write(
        "dir-test\t" +
          "\x7f".repeat(directory.length) +
          "/no-such-win-directory-51739\r",
      );
      await until(
        () => text().includes("Directory is missing"),
        "invalid directory stays in form",
      );
      child.write("\x15\x1b[200~~\x1b[201~\r");
      await until(
        () =>
          text().includes(`${host} · dir-test`) &&
          text().includes("Simulated session"),
        "create with edited directory",
      );
      child.write("\x07z");
      await until(
        () => text().includes("Resized:"),
        "window zoom resizes child PTY",
      );
      screen.resize(90, 30);
      child.resize(90, 30);
      await until(() => text().includes("88 × 26"), "outer terminal resize");
      child.write("\x07d\x07n");
      await until(
        () => text().includes("WIN · Demo sessions"),
        "detach returns to desktop",
      );
      child.write("\x07q");
      await until(() => exited, "quit");
      assert.ok(output.endsWith("\x1b[?1049l"), "outer terminal restored");
      assert.doesNotMatch(output, /TypeError|ReferenceError/);
    },
  );
