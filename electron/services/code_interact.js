/**
 * Polaris Code Interaction v1.0
 * Read/write local project files for code-level assistance.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE_DIRS = [
  path.join(os.homedir(), 'Documents', 'GitHub'),
  path.join(os.homedir(), 'Documents'),
  path.join(os.homedir(), 'Desktop'),
];

/**
 * Find file(s) matching a pattern in base directories.
 * Returns list of { path, size, modified }.
 */
function findFiles(pattern) {
  const results = [];
  for (const base of BASE_DIRS) {
    try {
      _walk(base, pattern, results, 3);
    } catch (e) {}
  }
  return results.slice(0, 20);
}

function _walk(dir, pattern, results, depth) {
  if (depth <= 0 || results.length >= 20) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        _walk(path.join(dir, e.name), pattern, results, depth - 1);
      } else if (e.isFile() && e.name.toLowerCase().includes(pattern.toLowerCase())) {
        const fp = path.join(dir, e.name);
        results.push({
          path: fp,
          size: fs.statSync(fp).size,
          modified: fs.statSync(fp).mtime.toISOString(),
        });
      }
    }
  } catch (e) {}
}

/**
 * Read a file, return its content (capped at 5000 chars).
 */
function readFile(filepath) {
  try {
    return fs.readFileSync(filepath, 'utf8').slice(0, 5000);
  } catch (e) {
    return null;
  }
}

/**
 * Write content to a file.
 */
function writeFile(filepath, content) {
  try {
    fs.writeFileSync(filepath, content);
    return { success: true, path: filepath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { findFiles, readFile, writeFile };
