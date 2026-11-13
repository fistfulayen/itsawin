import { chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
if (process.platform !== "win32") {
  const path = fileURLToPath(
    new URL(
      `../node_modules/node-pty/prebuilds/${process.platform}-${process.arch}/spawn-helper`,
      import.meta.url,
    ),
  );
  // node-pty 1.1.0's packaged macOS helper lacks the executable bit.
  if (existsSync(path)) chmodSync(path, 0o755);
}
