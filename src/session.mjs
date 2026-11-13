// Bridge one hc attach PTY into a headless VT emulator. Rendering reads cells
// from that emulator; disposing this bridge closes the viewer, not the shell.
import pty from "node-pty";
import xterm from "@xterm/headless";
import { hcPath, terminalAddress } from "./herdr.mjs";

export class Session {
  constructor(entry, { cols, rows, dirty, demo = false, onExit = () => {} }) {
    this.entry = entry;
    this.dirty = dirty;
    this.exited = false;
    this.term = new xterm.Terminal({
      cols,
      rows,
      scrollback: 3000,
      allowProposedApi: true,
    });
    this.focusReports = false;
    this.sgrMouse = false;
    for (const final of ["h", "l"])
      this.term.parser.registerCsiHandler({ prefix: "?", final }, (params) => {
        if (params.includes(1004)) this.focusReports = final === "h";
        if (params.includes(1006)) this.sgrMouse = final === "h";
        return false;
      });
    this.offset = 0;
    const args = demo
      ? [
          new URL("../test/fixtures/demo-terminal.mjs", import.meta.url)
            .pathname,
          process.env.WIN_HOST_LABEL || "This host",
        ]
      : [
          "attach",
          ...(entry.observe ? ["--observe"] : []),
          terminalAddress(entry.address),
        ];
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };
    delete env.TMUX;
    delete env.STY;
    this.process = pty.spawn(demo ? process.execPath : hcPath, args, {
      cols,
      rows,
      name: "xterm-256color",
      env,
    });
    this.term.onData((data) => {
      if (!this.exited) this.process.write(data);
    });
    this.pendingBytes = 0;
    this.process.onData((data) => {
      if (this.disposed) return;
      this.pendingBytes += data.length;
      if (this.pendingBytes > 262144 && !this.paused) {
        this.process.pause();
        this.paused = true;
      }
      this.term.write(data, () => {
        this.pendingBytes -= data.length;
        if (this.disposed) return;
        if (this.paused && this.pendingBytes < 65536) {
          this.process.resume();
          this.paused = false;
        }
        dirty();
      });
    });
    this.process.onExit(({ exitCode }) => {
      this.exited = true;
      if (!this.disposed) {
        onExit(exitCode);
        dirty();
      }
    });
  }
  input(data) {
    if (!this.exited && !this.entry.observe) {
      this.offset = 0;
      this.process.write(data);
    }
  }
  focus(on) {
    if (!this.exited && !this.entry.observe && this.focusReports)
      this.process.write(on ? "\x1b[I" : "\x1b[O");
  }
  mouse(event, x, y) {
    const mode = this.term.modes.mouseTrackingMode;
    if (
      event.button & 32 &&
      mode !== "any" &&
      (mode !== "drag" || (event.button & 3) === 3)
    )
      return;
    if (mode === "x10" && event.up) return;
    if (this.sgrMouse)
      this.input(
        `\x1b[<${event.button};${x + 1};${y + 1}${event.up ? "m" : "M"}`,
      );
    else if (x < 223 && y < 223)
      this.input(
        "\x1b[M" +
          String.fromCharCode(
            32 + (event.up ? 3 : event.button),
            x + 33,
            y + 33,
          ),
      );
  }
  paste(data) {
    this.input(
      this.term.modes.bracketedPasteMode ? `\x1b[200~${data}\x1b[201~` : data,
    );
  }
  resize(cols, rows) {
    if (
      cols < 1 ||
      rows < 1 ||
      (cols === this.term.cols && rows === this.term.rows)
    )
      return;
    this.term.resize(cols, rows);
    if (!this.exited) this.process.resize(cols, rows);
  }
  scroll(lines) {
    this.offset = Math.max(
      0,
      Math.min(this.term.buffer.active.baseY, this.offset + lines),
    );
    this.dirty();
  }
  dispose() {
    // This is only the attach client. Never call hc kill/rm on the terminal.
    this.disposed = true;
    if (!this.exited) {
      try {
        this.process.kill();
      } catch {}
      this.exited = true;
    }
    this.term.dispose();
  }
}

export function cellText(cell) {
  if (!cell || cell.getWidth() === 0) return " ";
  // Artwork's compositor has one glyph per cell; wide glyphs use a safe fallback.
  if (cell.getWidth() > 1) return "□";
  const value = cell.getChars() || " ";
  return /[\x00-\x1f\x7f-\x9f]/.test(value) ? " " : value;
}
export function cellAttribute(cell) {
  if (!cell) return 7;
  let fg = 7,
    bg = 0;
  if (cell.isFgPalette()) fg = cell.getFgColor() % 16;
  if (cell.isBgPalette()) bg = cell.getBgColor() % 16;
  if (cell.isFgRGB()) fg = rgbIndex(cell.getFgColor());
  if (cell.isBgRGB()) bg = rgbIndex(cell.getBgColor());
  if (cell.isBold()) fg |= 8;
  if (cell.isInverse()) [fg, bg] = [bg, fg];
  if (cell.isInvisible()) fg = bg;
  return fg | (bg << 4);
}
function rgbIndex(rgb) {
  const r = (rgb >> 16) & 255,
    g = (rgb >> 8) & 255,
    b = rgb & 255;
  return (
    (r > 96 ? 1 : 0) |
    (g > 96 ? 2 : 0) |
    (b > 96 ? 4 : 0) |
    (Math.max(r, g, b) > 180 ? 8 : 0)
  );
}
