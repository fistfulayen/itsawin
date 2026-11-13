#!/usr/bin/env node
// Obtain the original from its author, verify it, and only then replace our local copy.
// Downloading does not change the artwork's license or imply redistribution rights.
import { createHash } from "node:crypto";
import { writeFile, rename, rm } from "node:fs/promises";
import { SOURCE_HASH } from "../src/adapter.mjs";

const destination = new URL("../tty.mjs", import.meta.url);
const staged = new URL(`../.tty-${process.pid}.tmp`, import.meta.url);
try {
  const response = await fetch("https://itsa.win/tty.mjs", {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Artwork download returned HTTP ${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  const hash = createHash("sha256").update(source).digest("hex");
  if (hash !== SOURCE_HASH)
    throw new Error(
      `Artwork has changed (${hash}). This adapter needs ${SOURCE_HASH}. Existing local copy was not changed.`,
    );
  await writeFile(staged, source);
  await rename(staged, destination);
  console.log(
    "Verified tty.mjs from itsa.win. Artwork copyright remains with Andreas Gysin.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await rm(staged, { force: true });
}
