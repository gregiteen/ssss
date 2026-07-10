/** Static guard for likely direct canonical writes outside approved SSSS adapters. */
import fs from 'node:fs';
import path from 'node:path';

const WRITE_PATTERNS = [
  /\bfs\.(?:writeFile|writeFileSync|appendFile|appendFileSync|rm|rmSync|unlink|unlinkSync|rename|renameSync)\s*\(/,
  /\b(?:writeFile|appendFile|unlink|rename)\s*\(/,
  /\b(?:insert|update|delete)\s*\([^)]*\)\s*\.?(?:values|set|where)?\s*\(/,
];

export function detectDirectWrites(root, options = {}) {
  const approved = (options.approved || []).map((entry) => entry.replaceAll('\\', '/'));
  const include = options.include || /\.(?:[cm]?[jt]sx?)$/;
  const findings = [];
  const stack = [path.resolve(root)];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(absolute); continue; }
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (!include.test(relative) || approved.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))) continue;
      const lines = fs.readFileSync(absolute, 'utf8').split('\n');
      for (const [index, line] of lines.entries()) {
        if (line.includes('ssss-direct-write-approved')) continue;
        if (WRITE_PATTERNS.some((pattern) => pattern.test(line))) findings.push({ file: relative, line: index + 1, source: line.trim() });
      }
    }
  }
  return findings;
}
