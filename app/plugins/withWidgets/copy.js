const fs = require('fs');
const path = require('path');

/**
 * Recursively copy `src` into `dest`, merging into existing directories
 * rather than replacing them — the Android res/ and java/ trees already
 * contain files the Expo prebuild generated.
 *
 * An optional `transform(fileName, content)` rewrites file content on the way
 * across. It must return the content unchanged for files it does not target —
 * returning the input string verbatim makes the file a byte-for-byte copy, so
 * binaries (fonts) pass through safely as latin1 round-trips.
 *
 * @param {string} src
 * @param {string} dest
 * @param {((fileName: string, content: string) => string) | undefined} [transform]
 */
function copyDirMerge(src, dest, transform) {
  if (!fs.existsSync(src)) {
    throw new Error(`withWidgets: missing source directory ${src}`);
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirMerge(from, to, transform);
    } else if (transform) {
      // latin1 is a lossless byte<->string round-trip, so untargeted files
      // (including binaries) come out identical.
      const content = fs.readFileSync(from, 'latin1');
      fs.writeFileSync(to, transform(entry.name, content), 'latin1');
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

/**
 * Fail the prebuild loudly when an expected asset is absent.
 *
 * Without this a bad checkout produces a widget that silently renders in the
 * system font — which reads as a design bug, not a build one, and costs far
 * more to track down than a hard failure here.
 *
 * @param {string} target
 * @param {string} label
 */
function assertExists(target, label) {
  if (!fs.existsSync(target)) {
    throw new Error(`withWidgets: expected ${label} at ${target}`);
  }
}

module.exports = { copyDirMerge, assertExists };
