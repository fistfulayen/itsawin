// Interactive fixture, not a shell. Safe demo without contacting any core.
const host = process.argv[2] || "Mac";
process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
let line = "";
const out = (s) => process.stdout.write(s);
const prompt = () => out(`\r\n\x1b[36m${host}\x1b[0m › `);
out("\x1b[2J\x1b[HWIN terminal preview\r\n");
out("Simulated session. Try: help, colors, size, clear, exit\r\n");
prompt();
process.stdout.on("resize", () =>
  out(`\r\nResized: ${process.stdout.columns} × ${process.stdout.rows}\r\n`),
);
process.stdin.on("data", (data) => {
  data = data.replace(/\x1b\[[IO]/g, "").replace(/\x1b\[\??[0-9;]*[cnR]/g, "");
  for (const c of data) {
    if (c === "\x03") {
      line = "";
      out("^C");
      prompt();
    } else if (c === "\x7f") {
      if (line) {
        line = line.slice(0, -1);
        out("\b \b");
      }
    } else if (c === "\r" || c === "\n") {
      out("\r\n");
      if (line.trim() === "exit") process.exit(0);
      if (line.trim() === "clear") out("\x1b[2J\x1b[H");
      else if (line.trim() === "size")
        out(`${process.stdout.columns} × ${process.stdout.rows}`);
      else if (line.trim() === "colors")
        for (let i = 0; i < 16; i++) out(`\x1b[38;5;${i}mColor ${i}  `);
      else
        out(
          `\x1b[0m${line.trim() === "help" ? "help · colors · size · clear · exit" : `You typed: ${line}`}`,
        );
      line = "";
      out("\x1b[0m");
      prompt();
    } else if (c >= " ") {
      line += c;
      out(c);
    }
  }
});
