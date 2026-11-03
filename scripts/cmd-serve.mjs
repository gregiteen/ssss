/**
 * ssss serve — reference HTTP server for the SSSS Operation Contract (spec §6.8).
 * Dependency-free implementation using Node's built-in http module.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/engine.mjs';
import { statusForResponse } from '../src/http.mjs';
import { parseArgs, wantsHelp } from './lib/cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = (() => {
  try { return fs.readFileSync(path.resolve(HERE, '..', 'VERSION'), 'utf8').trim(); }
  catch { return '0.0.0'; }
})();

export function createServer(options = {}) {
  const vaultRoot = path.resolve(options.vault || '.');
  const engine = options.engine || createEngine({
    registryDir: options.registryDir,
    extensionFile: options.extensionFile,
  });

  let expectedToken = null;
  if (options.token) {
    expectedToken = options.token.trim();
  } else if (options.tokenFile) {
    expectedToken = fs.readFileSync(path.resolve(options.tokenFile), 'utf8').trim();
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, version: VERSION }));
      return;
    }

    const hostHeader = req.headers.host || 'localhost';
    const parsedUrl = new URL(req.url, `http://${hostHeader}`);

    if (req.method !== 'POST' || (parsedUrl.pathname !== '/v1/operations' && parsedUrl.pathname !== '/')) {
      res.writeHead(404);
      res.end(JSON.stringify({
        success: false,
        error: { code: 'not_found', message: `Route '${req.method} ${parsedUrl.pathname}' not found.` },
      }));
      return;
    }

    if (expectedToken) {
      const authHeader = req.headers.authorization || '';
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      const token = match ? match[1].trim() : null;
      if (!token || token !== expectedToken) {
        res.writeHead(401);
        res.end(JSON.stringify({
          success: false,
          error: { code: 'unauthorized', message: 'Missing or invalid bearer token.' },
        }));
        return;
      }
    }

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      let payload;
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        payload = JSON.parse(text);
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({
          success: false,
          error: { code: 'invalid_request', message: `Malformed JSON: ${err.message}` },
        }));
        return;
      }

      const envelope = payload?.envelope || payload;
      const callOptions = {};
      if (payload?.principal) callOptions.principal = payload.principal;

      try {
        const response = await engine.processOperation(envelope, vaultRoot, callOptions);
        const status = statusForResponse(response);
        res.writeHead(status);
        res.end(JSON.stringify(response));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({
          success: false,
          error: { code: 'internal_error', message: err.message },
        }));
      }
    });

    req.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: { code: 'internal_error', message: err.message } }));
      }
    });
  });

  return server;
}

export async function run(argv) {
  if (wantsHelp(argv)) {
    console.log(`Usage: ssss serve [options]

Start a reference HTTP server exposing the SSSS Operation Contract (POST /v1/operations).

Options:
  --vault <dir>       Path to vault directory (default: '.')
  --port <num>        Port to listen on (default: 8443, 0 for dynamic)
  --host <ip>         Host address to bind to (default: 127.0.0.1)
  --token <pat>       Optional bearer token required for requests
  --token-file <file> Optional path to bearer token file
  --registry <dir>    Path to registry directory
  --extension <file>  Path to extension registry file
  --quiet             Suppress listening message
  --help, -h          Show help`);
    return;
  }

  const { flags } = parseArgs(argv, { booleans: ['quiet'] });
  const vault = flags.vault || '.';
  const port = flags.port != null ? parseInt(flags.port, 10) : 8443;
  const host = flags.host || '127.0.0.1';
  const token = flags.token;
  const tokenFile = flags['token-file'];
  const registryDir = flags.registry;
  const extensionFile = flags.extension;

  const server = createServer({ vault, token, tokenFile, registryDir, extensionFile });
  server.listen(port, host, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' ? addr.port : port;
    if (!flags.quiet) {
      console.log(`SSSS reference server listening on http://${host}:${actualPort} (vault: ${path.resolve(vault)})`);
    }
  });

  const close = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
