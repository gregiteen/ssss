/**
 * find-skills.mjs — skills.sh Registry Search & Parser
 *
 * Parses the raw CLI output from `npx skills find <query>` into
 * structured skill records. Used by the Sovereign Skill Manager to
 * search, rank, and install community skills from skills.sh.
 *
 * Output format from `skills find`:
 *   Install with npx skills add <owner/repo@skill>
 *
 *   steipete/clawdis@github 1.7K installs
 *   └ https://skills.sh/steipete/clawdis/github
 *
 *   jiulingyun/openclaw-cn@github 21 installs
 *   └ https://skills.sh/jiulingyun/openclaw-cn/github
 */

import { execSync } from 'node:child_process';

// ─── Install Count Parser ────────────────────────────────────────────────────

/**
 * Convert a human-readable install count (e.g. "1.7" + "K") to an integer.
 *
 * @param {string} value - Numeric portion of the install count (e.g. "1.7", "21", "2.1")
 * @param {string} unit  - SI suffix: "K" (thousands), "M" (millions), or "" (raw count)
 * @returns {number} Integer install count, or 0 if parsing fails
 *
 * @example
 *   parseInstalls("1.7", "K")   // → 1700
 *   parseInstalls("21.3", "K")  // → 21300
 *   parseInstalls("2.1", "M")   // → 2100000
 *   parseInstalls("120", "")    // → 120
 *   parseInstalls("invalid", "K") // → 0
 */
export function parseInstalls(value, unit) {
  const num = parseFloat(value);
  if (isNaN(num)) return 0;

  switch (unit.toUpperCase()) {
    case 'K': return Math.round(num * 1_000);
    case 'M': return Math.round(num * 1_000_000);
    case 'B': return Math.round(num * 1_000_000_000);
    default:  return Math.round(num);
  }
}

// ─── CLI Output Parser ──────────────────────────────────────────────────────

/**
 * Parse the raw multi-line output of `npx skills find <query>` into
 * an array of structured skill records.
 *
 * Each record in the output spans two lines:
 *   Line 1:  `owner/repo@skill <count>[K|M] installs`
 *   Line 2:  `└ https://skills.sh/owner/repo/skill`
 *
 * @param {string} rawOutput - Raw stdout from `npx skills find`
 * @returns {Array<{ name: string, installs: number, url: string }>}
 *          Sorted by install count (highest first).
 */
export function parseFindOutput(rawOutput) {
  const results = [];
  const lines = rawOutput.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Match skill line:  "steipete/clawdis@github 1.7K installs"
    //                    "jiulingyun/openclaw-cn@github 21 installs"
    const skillMatch = line.match(
      /^(\S+@\S+)\s+([\d.]+)\s*(K|M|B)?\s*installs?$/i
    );

    if (!skillMatch) continue;

    const name = skillMatch[1];
    const installs = parseInstalls(skillMatch[2], skillMatch[3] || '');

    // Next non-empty line should be the URL (prefixed with └ or similar box-drawing chars)
    let url = '';
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j].trim();
      if (!nextLine) continue;

      const urlMatch = nextLine.match(/^[└┗├│─\s]*(https?:\/\/\S+)/);
      if (urlMatch) {
        url = urlMatch[1];
        i = j; // advance past the URL line
      }
      break; // only check the very next non-empty line
    }

    results.push({ name, installs, url });
  }

  return results;
}

// ─── Live Registry Search ───────────────────────────────────────────────────

/**
 * Execute `npx skills find <query>` and return parsed results.
 * Falls back gracefully if the `skills` CLI is not installed.
 *
 * @param {string} query - Search term for the skills.sh registry
 * @param {object} [options]
 * @param {number} [options.timeoutMs=15000] - Max execution time in ms
 * @returns {Array<{ name: string, installs: number, url: string }>}
 */
export function searchRegistry(query, { timeoutMs = 15_000 } = {}) {
  try {
    const output = execSync(`npx -y skills find "${query.replace(/"/g, '\\"')}"`, {
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return parseFindOutput(output);
  } catch (err) {
    // skills CLI not installed or network error — degrade gracefully
    return [];
  }
}
