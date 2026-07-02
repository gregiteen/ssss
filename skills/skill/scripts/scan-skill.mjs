/**
 * scan-skill.mjs — Static Security Scanner for Skill Scripts
 *
 * Performs pattern-based static analysis on skill files to detect
 * potential security risks before installation. Catches:
 *
 *   CRITICAL:
 *     - Dynamic command injection (exec/spawn with template literals/variables)
 *     - Unsafe code evaluation (eval, new Function, vm.runInNewContext)
 *
 *   WARNING:
 *     - External HTTP/network calls (fetch, axios, http.get, XMLHttpRequest)
 *     - Filesystem access outside .agent/ scope
 *     - Environment variable exfiltration
 *
 *   INFO:
 *     - Use of child_process with static args (acceptable but noted)
 *     - Crypto operations
 *
 * Each finding is: { severity, rule, line, snippet, file }
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── Detection Rules ────────────────────────────────────────────────────────

const RULES = [
  // ── CRITICAL: Command injection ─────────────────────────────────────────
  {
    severity: 'CRITICAL',
    rule: 'Dynamic Command Injection',
    // exec/execSync/spawn/spawnSync with template literal or variable interpolation
    pattern: /\b(exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\(\s*(`[^`]*\$\{|[a-zA-Z_$][\w$]*\s*[+,])/,
    description: 'Detects shell commands built with dynamic interpolation — high injection risk.',
  },
  // ── CRITICAL: Code evaluation ───────────────────────────────────────────
  {
    severity: 'CRITICAL',
    rule: 'Unsafe Code Evaluation',
    pattern: /\b(eval|Function)\s*\(/,
    description: 'eval() or new Function() allows arbitrary code execution.',
  },
  {
    severity: 'CRITICAL',
    rule: 'Unsafe Code Evaluation',
    pattern: /\bvm\.(runInNewContext|runInThisContext|compileFunction)\s*\(/,
    description: 'Node.js vm module running dynamic code.',
  },
  // ── WARNING: Network access ─────────────────────────────────────────────
  {
    severity: 'WARNING',
    rule: 'External HTTP/Network Call',
    pattern: /\b(fetch|axios|got|node-fetch|http\.get|https\.get|http\.request|https\.request|XMLHttpRequest|WebSocket)\s*\(/,
    description: 'Makes outbound network requests — verify destination.',
  },
  // ── WARNING: Broad filesystem access ────────────────────────────────────
  {
    severity: 'WARNING',
    rule: 'Filesystem Traversal Risk',
    pattern: /\.\.\//,
    context: /fs\.(read|write|unlink|rmdir|rm|mkdir|access|stat|chmod|rename)/,
    description: 'Path traversal near filesystem operations — verify scope.',
  },
  // ── WARNING: Environment leaks ──────────────────────────────────────────
  {
    severity: 'WARNING',
    rule: 'Environment Variable Access',
    pattern: /process\.env(?!\.(NODE_ENV|HOME|PATH|AGENT_DIR|USER|SHELL|TERM))/,
    description: 'Accesses environment variables beyond standard set.',
  },
  // ── INFO: Static child_process usage (acceptable) ───────────────────────
  {
    severity: 'INFO',
    rule: 'Static Command Execution',
    pattern: /\b(exec|execSync|spawn|spawnSync)\s*\(\s*['"][^'"]*['"]/,
    description: 'Runs a command with static string args — lower risk but noted.',
  },
];

// ─── Scanner ────────────────────────────────────────────────────────────────

/**
 * Scan a single file for security risks.
 *
 * @param {string} filePath - Absolute path to the file to scan
 * @returns {Array<{ severity: string, rule: string, line: number, snippet: string, file: string }>}
 *          Array of findings, empty if the file is clean.
 */
export function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const findings = [];
  const seen = new Set(); // deduplicate: one finding per rule per line

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Skip comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    for (const rule of RULES) {
      // If rule has a context pattern, both must match on the same line
      if (rule.context && !rule.context.test(line)) continue;

      if (rule.pattern.test(line)) {
        const key = `${rule.rule}:${lineNum}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Skip INFO-level "Static Command" if a CRITICAL "Dynamic Command Injection"
        // was already found on the same line
        if (rule.severity === 'INFO' && rule.rule === 'Static Command Execution') {
          const hasCritical = findings.some(
            f => f.line === lineNum && f.rule === 'Dynamic Command Injection'
          );
          if (hasCritical) continue;
        }

        findings.push({
          severity: rule.severity,
          rule: rule.rule,
          line: lineNum,
          snippet: line.trim().slice(0, 120),
          file: filePath,
        });
      }
    }
  }

  return findings;
}

/**
 * Scan all .mjs/.js/.cjs files in a directory recursively.
 *
 * @param {string} dirPath - Root directory to scan
 * @param {object} [options]
 * @param {string[]} [options.extensions] - File extensions to scan (default: .mjs, .js, .cjs)
 * @param {string[]} [options.ignore] - Directory names to skip
 * @returns {Array<{ severity: string, rule: string, line: number, snippet: string, file: string }>}
 */
export function scanDirectory(dirPath, {
  extensions = ['.mjs', '.js', '.cjs'],
  ignore = ['node_modules', '.git', '.system_generated'],
} = {}) {
  const allFindings = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!ignore.includes(entry.name)) walk(full);
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        allFindings.push(...scanFile(full));
      }
    }
  }

  walk(dirPath);

  // Sort: CRITICAL first, then WARNING, then INFO
  const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  allFindings.sort((a, b) =>
    (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  return allFindings;
}

/**
 * Generate a human-readable security report.
 *
 * @param {Array<{ severity: string, rule: string, line: number, snippet: string, file: string }>} findings
 * @returns {string} Formatted report
 */
export function formatReport(findings) {
  if (findings.length === 0) return '✅ No security findings detected.\n';

  const icons = { CRITICAL: '🚨', WARNING: '⚠️', INFO: 'ℹ️' };
  const critCount = findings.filter(f => f.severity === 'CRITICAL').length;
  const warnCount = findings.filter(f => f.severity === 'WARNING').length;
  const infoCount = findings.filter(f => f.severity === 'INFO').length;

  let report = `\n── Security Scan Report ──────────────────────────────────────\n`;
  report += `   🚨 ${critCount} critical  ⚠️ ${warnCount} warning  ℹ️ ${infoCount} info\n\n`;

  for (const f of findings) {
    const icon = icons[f.severity] || '❓';
    const relFile = path.relative(process.cwd(), f.file);
    report += `${icon} [${f.severity}] ${f.rule}\n`;
    report += `   ${relFile}:${f.line}\n`;
    report += `   │ ${f.snippet}\n\n`;
  }

  if (critCount > 0) {
    report += `🚫 BLOCKED: ${critCount} CRITICAL finding(s) must be resolved before installation.\n`;
  }

  return report;
}
