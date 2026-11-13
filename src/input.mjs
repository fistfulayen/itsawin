// Decode only the outer terminal protocol. Shell bytes remain unchanged.
export class InputParser {
  constructor(emit) {
    this.emit = emit;
    this.pending = "";
    this.paste = false;
  }
  feed(chunk) {
    clearTimeout(this.timer);
    this.pending += chunk;
    while (this.pending) {
      if (this.paste) {
        const end = this.pending.indexOf("\x1b[201~");
        if (end < 0) break;
        this.emit({ type: "paste", data: this.pending.slice(0, end) });
        this.pending = this.pending.slice(end + 6);
        this.paste = false;
        continue;
      }
      if (this.pending.startsWith("\x1b[200~")) {
        this.paste = true;
        this.pending = this.pending.slice(6);
        continue;
      }
      let raw;
      if (this.pending[0] === "\x1b") {
        if (this.pending.length === 1) break;
        if (this.pending[1] === "[") {
          const m = this.pending.match(/^\x1b\[[0-?]*[ -/]*[@-~]/);
          if (!m) break;
          raw = m[0];
        } else if (this.pending[1] === "O") {
          if (this.pending.length < 3) break;
          raw = this.pending.slice(0, 3);
        } else raw = this.pending.slice(0, 2);
      } else raw = String.fromCodePoint(this.pending.codePointAt(0));
      this.pending = this.pending.slice(raw.length);
      const m = raw.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
      this.emit(
        m
          ? {
              type: "mouse",
              button: +m[1],
              x: +m[2] - 1,
              y: +m[3] - 1,
              up: m[4] === "m",
              raw,
            }
          : { type: "key", raw },
      );
    }
    if (this.pending && !this.paste)
      this.timer = setTimeout(() => {
        const raw = this.pending;
        this.pending = "";
        this.emit({ type: "key", raw });
      }, 60);
    // Bound a paste without turning embedded control bytes into commands.
    if (this.paste && this.pending.length > 1024 * 1024) {
      this.emit({ type: "paste", data: this.pending.slice(0, -6) });
      this.pending = this.pending.slice(-6);
    }
  }
  dispose() {
    clearTimeout(this.timer);
  }
}
export function artworkKey(raw) {
  const simple = {
    "\r": "Enter",
    "\n": "Enter",
    "\t": "Tab",
    "\x7f": "Backspace",
    "\b": "Backspace",
    "\x1b": "Escape",
  };
  if (simple[raw]) return [simple[raw], ""];
  const letters = {
    A: "ArrowUp",
    B: "ArrowDown",
    C: "ArrowRight",
    D: "ArrowLeft",
    H: "Home",
    F: "End",
    P: "F1",
    Q: "F2",
    R: "F3",
    S: "F4",
    Z: "Shift+Tab",
  };
  const numbers = {
    2: "Insert",
    3: "Delete",
    5: "PageUp",
    6: "PageDown",
    15: "F5",
    17: "F6",
    18: "F7",
    19: "F8",
    20: "F9",
    21: "F10",
    23: "F11",
    24: "F12",
  };
  const m = raw.match(/^\x1b(?:\[|O)(\d*)(?:;(\d+))?([A-Z~])$/);
  if (m) {
    const key = m[3] === "~" ? numbers[m[1]] : letters[m[3]];
    const mods = (+m[2] || 1) - 1;
    return key
      ? [(mods & 1 ? "Shift+" : "") + (mods & 2 ? "Alt+" : "") + key, ""]
      : null;
  }
  if (/^\x1b[^\x1b]$/.test(raw)) return ["Alt+" + raw[1].toUpperCase(), ""];
  return raw.codePointAt(0) >= 32 && !raw.startsWith("\x1b")
    ? [raw.toUpperCase(), raw]
    : null;
}
