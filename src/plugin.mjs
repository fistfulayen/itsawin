// Native artwork views, session chooser, and input routing. The adapter passes
// a small API facade because the upstream artwork client is minified.
import { resumeClaude, resumeCodex } from "./agents.mjs";
import { hostname } from "node:os";
import { Herdr, cleanText, resolveDirectory } from "./herdr.mjs";
import { Session, cellText, cellAttribute } from "./session.mjs";
import { InputParser, artworkKey } from "./input.mjs";

export function install(api) {
  const { Window, View, Rect, Point, Line } = api;
  const demo = process.env.WIN_DEMO === "1";
  const chrome = process.env.WIN_CLAUDE_CHROME !== "0";
  delete process.env.WIN_CLAUDE_CHROME;
  const codexResume = process.env.WIN_CODEX_RESUME;
  delete process.env.WIN_CODEX_RESUME;
  const resume = codexResume || process.env.WIN_CLAUDE_RESUME;
  delete process.env.WIN_CLAUDE_RESUME;
  const backend = new Herdr();
  const windows = new Set();
  let picker,
    started = false,
    prefix = false,
    disposed = false;
  let cache = { terminals: [] };
  const host = cleanText(process.env.WIN_HOST_LABEL || hostname());
  const bank = process.env.WIN_THEME === "p3" ? 512 : 256;
  const palettes = ["p1", "p3"].map((name) =>
    api.palettes[name].Ph.map((v) =>
      [(v >> 8) & 15, (v >> 4) & 15, v & 15].map((n) => n * 17),
    ),
  );
  const tag = () => bank;
  // Tag at the final view write, after Turbo Vision's packed palette lookup.
  const originalWrite = View.prototype.ri;
  View.prototype.ri = function (x, y, width, data, offset = 0) {
    let owner = this;
    while (owner && !owner.winBank) owner = owner.Ut;
    if (owner && data instanceof Line) {
      for (let i = 0; i < data.bt.length; i++)
        if (data.bt[i] < 256) data.bt[i] |= owner.winBank;
    }
    return originalWrite.call(this, x, y, width, data, offset);
  };
  const repaint = (view) => {
    if (!disposed) view.Ws();
  };
  const label = (entry) => `${host} · ${entry.name}`;
  function bounds(width = 76, height = 24) {
    const d = api.desktop();
    const w = Math.min(width, d.size.x),
      h = Math.min(height, d.size.y);
    const offset = windows.size % 4;
    const x = Math.max(0, Math.min(d.size.x - w, 2 + offset * 2));
    const y = Math.max(0, Math.min(d.size.y - h, 1 + offset));
    return new Rect(x, y, x + w, y + h);
  }
  function decorate(win, bank) {
    win.options |= 128;
    win.winBank = bank;
    win.Ln = (desktop) => {
      const b = win.getBounds();
      const w = Math.min(win.size.x, desktop.size.x),
        h = Math.min(win.size.y, desktop.size.y);
      const x = Math.max(0, Math.min(b.a.x, desktop.size.x - w)),
        y = Math.max(0, Math.min(b.a.y, desktop.size.y - h));
      win.js(new Rect(x, y, x + w, y + h));
    };
  }
  class Content extends View {
    constructor(win, paint, event) {
      super(new Rect(1, 1, win.size.x - 1, win.size.y - 1));
      this.options |= 1;
      this.cs = 12;
      this.win = win;
      this.paint = paint;
      this.event = event;
    }
    draw() {
      this.paint(this);
    }
    *Pt(event) {
      yield* super.Pt(event);
      if (this.event) this.event(event, this);
    }
    row(y, text, attr = bank | 7) {
      const line = new Line(this.size.x);
      for (let x = 0; x < this.size.x; x++) {
        line.dt[x] = " ";
        line.bt[x] = attr;
      }
      // Dialog text is single-column only; never allow labels to shift frames.
      const chars = [...cleanText(text)].map((c) =>
        c.codePointAt(0) > 0x2fff ? "?" : c,
      );
      for (let x = 0; x < Math.min(chars.length, this.size.x); x++)
        line.dt[x] = chars[x];
      this.oi(0, y, this.size.x, 1, line);
    }
  }
  function attach(entry) {
    for (const win of windows)
      if (win.entry.address === entry.address) {
        if (win.session?.exited) {
          win.close();
          break;
        }
        win.select();
        return;
      }
    const win = new Window(
      bounds(),
      label(entry) + (entry.observe ? " · view only" : ""),
    );
    decorate(win, tag(entry));
    win.entry = entry;
    const view = new Content(win, (view) => {
      const session = win.session;
      if (!session) return;
      session.resize(Math.max(1, view.size.x), Math.max(1, view.size.y));
      const buffer = session.term.buffer.active;
      const base = Math.max(0, buffer.baseY - session.offset);
      for (let y = 0; y < view.size.y; y++) {
        const line = new Line(view.size.x),
          source = buffer.getLine(base + y);
        for (let x = 0; x < view.size.x; x++) {
          const cell = source?.getCell(x);
          line.dt[x] = cellText(cell);
          line.bt[x] = cellAttribute(cell) | tag(entry);
          if (
            !session.offset &&
            !session.exited &&
            win.state & 32 &&
            y === buffer.cursorY &&
            x === buffer.cursorX &&
            Math.floor(Date.now() / 600) % 2 === 0
          ) {
            const a = line.bt[x];
            line.bt[x] = (a & ~255) | ((a & 15) << 4) | ((a >> 4) & 15);
          }
        }
        view.oi(0, y, view.size.x, 1, line);
      }
    });
    win.Fi(view);
    win.content = view;
    const close = win.close.bind(win);
    win.close = () => {
      win.session?.dispose();
      windows.delete(win);
      close();
    };
    api.desktop().Fi(win);
    windows.add(win);
    try {
      // Interactive attachment claims the sidebar's return-to-viewer target.
      // Observe-only views must not redirect somebody else's agent row.
      if (!demo && !entry.observe)
        backend.associate(entry).catch(() => {
          if (!disposed && win.Ut) {
            win.title = `${label(entry)} · sidebar link failed`;
            win.dirty = true;
          }
        });
      win.session = new Session(entry, {
        cols: Math.max(1, view.size.x),
        rows: Math.max(1, view.size.y),
        demo,
        dirty: () => {
          win.dirty = true;
        },
        onExit: (code) => {
          win.title = `${label(entry)} · disconnected (${code})`;
          win.dirty = true;
        },
      });
    } catch (error) {
      win.close();
      choose(cleanText(error.message));
    }
  }
  class Picker extends Window {
    constructor(message = "") {
      super(
        bounds(82, 23),
        demo ? "WIN · Demo sessions" : "WIN · Connect session",
      );
      decorate(this, bank);
      this.selected = 0;
      this.query = "";
      this.message = message;
      this.busy = false;
      this.form = null;
      this.confirm = null;
      this.content = new Content(
        this,
        (view) => this.paint(view),
        (e, view) => this.event(e, view),
      );
      this.Fi(this.content);
    }
    entries() {
      const news = [{ create: true, name: "New Terminal…" }];
      return [...news, ...cache.terminals].filter((e) =>
        `${e.name} ${e.cwd || ""}`
          .toLowerCase()
          .includes(this.query.toLowerCase()),
      );
    }
    paint(v) {
      for (let y = 0; y < v.size.y; y++) v.row(y, "");
      if (this.form) {
        v.row(1, ` Create on ${host}`);
        v.row(3, ` Name: ${this.form.name}${this.field === "name" ? "_" : ""}`);
        v.row(5, " a-z, 0-9, - and _ (up to 32 characters)");
        v.row(
          7,
          ` Directory: ${this.form.cwd}${this.field === "cwd" ? "_" : ""}`,
        );
        v.row(9, " Tab: field · Ctrl-U: clear · Enter: create · Esc: cancel");
      } else if (this.confirm) {
        v.row(1, ` Connect to ${label(this.confirm)}?`);
        v.row(3, " This viewer may become the active input/resize owner.");
        v.row(5, " Enter: connect    O: observe only    Esc: cancel");
      } else {
        v.row(0, ` Search: ${this.query || "(type to filter)"}`);
        v.row(1, " HOST          TERMINAL                         STATE");
        const items = this.entries();
        this.selected = Math.max(0, Math.min(this.selected, items.length - 1));
        const count = Math.max(1, v.size.y - 6),
          start = Math.max(0, this.selected - count + 1);
        items.slice(start, start + count).forEach((entry, i) => {
          const text = ` ${host.slice(0, 12).padEnd(13)} ${entry.name.slice(0, 30).padEnd(31)} ${entry.create ? "+" : entry.status}`;
          v.row(
            i + 2,
            text,
            tag(entry) | (i + start === this.selected ? 112 : 7),
          );
        });
        if (!items.length) v.row(3, " No matching terminals.");
        v.row(v.size.y - 4, " Enter/click: select   F2: refresh   Esc: close");
        v.row(
          v.size.y - 3,
          " Ctrl-G then N: chooser · W: next · Z: zoom · D: detach",
        );
      }
      v.row(v.size.y - 2, this.busy ? " Working…" : ` ${this.message}`);
      v.row(
        v.size.y - 1,
        demo
          ? " DEMO · simulated sessions; no Herdr connection"
          : " Closing a WIN window detaches; the terminal keeps running.",
      );
    }
    event(e, view) {
      if (this.busy) {
        if (e.xt === 16 || e.xt === 1) e.xt = 0;
        return;
      }
      if (e.xt === 1 && !this.form && !this.confirm) {
        const p = view.Fs(e.Nt.Rt),
          count = Math.max(1, view.size.y - 6);
        const start = Math.max(0, this.selected - count + 1),
          index = start + p.y - 2;
        if (p.y >= 2 && p.y < 2 + count && index < this.entries().length) {
          this.selected = index;
          this.activate();
        }
        e.xt = 0;
        return;
      }
      if (e.xt === 1 && this.form) {
        const p = view.Fs(e.Nt.Rt);
        if (p.y === 3) this.field = "name";
        if (p.y === 7) this.field = "cwd";
        e.xt = 0;
        repaint(view);
        return;
      }
      if (e.xt !== 16) return;
      const { keyCode: key, charCode: char } = e.Et;
      if (key === "Escape") {
        if (this.form || this.confirm) {
          this.form = this.confirm = null;
        } else this.close();
      } else if (this.confirm) {
        if (key === "Enter" || key === "O") {
          const entry = { ...this.confirm, observe: key === "O" };
          this.close();
          attach(entry);
        }
      } else if (this.form) {
        if (key === "Enter") this.create();
        else if (key === "Tab" || key === "Shift+Tab")
          this.field = this.field === "name" ? "cwd" : "name";
        else if (key === "Backspace")
          this.form[this.field] = [...this.form[this.field]]
            .slice(0, -1)
            .join("");
        else if (
          this.field === "name" &&
          /^[a-z0-9_-]$/.test(char) &&
          this.form.name.length < 32
        )
          this.form.name += char;
        else if (
          this.field === "cwd" &&
          char &&
          !/[\x00-\x1f\x7f]/.test(char) &&
          this.form.cwd.length < 4096
        )
          this.form.cwd += char;
      } else if (key === "ArrowDown") this.selected++;
      else if (key === "ArrowUp") this.selected--;
      else if (key === "Enter") this.activate();
      else if (key === "F2") this.refresh();
      else if (key === "Backspace") {
        this.query = this.query.slice(0, -1);
        this.selected = 0;
      } else if (char) {
        this.query += char;
        this.selected = 0;
      }
      e.xt = 0;
      repaint(view);
    }
    activate() {
      const entry = this.entries()[this.selected];
      if (!entry) return;
      if (entry.create) {
        this.form = { name: "", cwd: process.cwd() };
        this.field = "name";
      } else this.confirm = entry;
      repaint(this.content);
    }
    async create() {
      if (!this.form.name) {
        this.message = "Enter a name first.";
        return;
      }
      this.busy = true;
      repaint(this.content);
      try {
        const cwd = await resolveDirectory(this.form.cwd);
        const entry = demo
          ? { ...this.form, cwd, address: this.form.name, status: "demo" }
          : await backend.create({ ...this.form, cwd });
        if (disposed) return;
        this.close();
        attach(entry);
      } catch (e) {
        this.message = e.message;
      } finally {
        this.busy = false;
        if (this.Ut) repaint(this.content);
      }
    }
    async refresh() {
      this.busy = true;
      repaint(this.content);
      try {
        cache = demo
          ? {
              terminals: [
                {
                  address: "demo-local",
                  name: "local-preview",
                  status: "demo",
                },
              ],
            }
          : await backend.list();
        this.message = `Sessions on ${host}`;
      } catch (e) {
        this.message = e.message;
      } finally {
        this.busy = false;
        if (this.Ut) repaint(this.content);
      }
    }
    close() {
      super.close();
      if (picker === this) picker = null;
    }
  }
  function choose(message = "") {
    if (!api.desktop()) return;
    if (picker?.Ut) {
      picker.select();
      return;
    }
    picker = new Picker(message);
    api.desktop().Fi(picker);
    picker.refresh();
  }
  function active() {
    return !api.menuActive() ? api.desktop()?.fi : null;
  }
  let previous;
  const parser = new InputParser((event) => {
    const win = active();
    if (event.type === "paste") {
      if (win === picker && picker.form && !picker.busy) {
        const field = picker.field,
          limit = field === "name" ? 32 : 4096;
        const text = event.data.replace(
          field === "name" ? /[^a-z0-9_-]/g : /[\x00-\x1f\x7f]/g,
          "",
        );
        picker.form[field] = (picker.form[field] + text).slice(0, limit);
        repaint(picker.content);
      } else win?.session?.paste(event.data);
      return;
    }
    if (
      event.type === "key" &&
      event.raw === "\x15" &&
      win === picker &&
      picker.form &&
      !picker.busy
    ) {
      picker.form[picker.field] = "";
      repaint(picker.content);
      return;
    }
    if (event.type === "mouse") {
      const hit = api.desktop()?.bi(new Point(event.x, event.y));
      if (hit?.session) {
        const p = hit.content.Fs(new Point(event.x, event.y));
        if (
          p.x >= 0 &&
          p.y >= 0 &&
          p.x < hit.content.size.x &&
          p.y < hit.content.size.y &&
          !api.menuActive()
        ) {
          hit.select();
          hit.content.select();
          const mode = hit.session.term.modes.mouseTrackingMode;
          if (mode !== "none") hit.session.mouse(event, p.x, p.y);
          else if (event.button & 64)
            hit.session.scroll(event.button & 1 ? -3 : 3);
          return;
        }
      }
      api.mouse(event);
      return;
    }
    const raw = event.raw;
    if (prefix) {
      prefix = false;
      if (raw === "n") choose();
      else if (raw === "w") api.command(7);
      else if (raw === "z") api.command(5);
      else if (raw === "d") win?.close();
      else if (raw === "r" && win?.session) {
        const entry = win.entry;
        win.close();
        attach(entry);
      } else if (raw === "q") api.quit();
      else if (raw === "m") api.key("F10", "");
      else if (raw === "\x07") win?.session?.input(raw);
      return;
    }
    if (raw === "\x07") {
      prefix = true;
      return;
    }
    if (win?.session) {
      win.session.input(raw);
      return;
    }
    if (raw === "\x03") {
      choose();
      return;
    }
    const key = artworkKey(raw);
    if (key) api.key(...key);
  });
  return {
    choose,
    input(data) {
      parser.feed(data);
    },
    colors(attr, fallback) {
      const p = palettes[(attr >> 8) - 1] || fallback;
      return [p[attr & 15], p[(attr >> 4) & 15]];
    },
    tick() {
      if (!started) {
        started = true;
        if (resume && !demo) {
          (codexResume
            ? resumeCodex(backend, resume, process.cwd())
            : resumeClaude(backend, resume, process.cwd(), undefined, {
                chrome,
              })
          )
            .then((entry) => {
              if (!disposed) attach(entry);
            })
            .catch((error) => {
              if (!disposed) choose(cleanText(error.message));
            });
        } else choose();
      }
      const focused = active();
      if (focused !== previous) {
        previous?.session?.focus(false);
        focused?.session?.focus(true);
        previous = focused;
      }
      for (const win of windows)
        if (win.dirty || win === focused) {
          win.dirty = false;
          repaint(win.content);
        }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      parser.dispose();
      for (const win of windows) win.session?.dispose();
      windows.clear();
    },
  };
}
