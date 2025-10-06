import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { loadPolicy } from './policy.js';
import { audit } from './logger.js';

const app = express();
const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = String(process.env.MAX_BODY || '1mb');
const API_KEY = process.env.MCP_API_KEY;
const FS_COMMAND = process.env.FS_MCP_COMMAND || 'node';
const FS_ARGS = (process.env.FS_MCP_ARGS || '').split(' ').filter(Boolean);

if (!API_KEY) {
  console.error('MCP_API_KEY not set');
  process.exit(1);
}

app.use(express.json({ limit: MAX_BODY }));
app.use(morgan('combined'));

// Simple API key check
app.use((req, res, next) => {
  const header = req.get('authorization') || req.get('x-api-key') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (token !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
});

// Load and print policy
const policy = loadPolicy();
console.log('Loaded policy root:', policy.root);

// Spawn upstream FS MCP stdio server
const child = spawn(FS_COMMAND, FS_ARGS, { stdio: ['pipe', 'pipe', 'inherit'] });
child.on('exit', (code) => {
  console.error('Upstream FS MCP server exited with code', code);
  process.exit(code || 1);
});

// For each request, send a single JSON-RPC line and await one line back
app.post('/mcp', async (req, res) => {
  const id = req.body?.id ?? null;
  const method = req.body?.method ?? 'unknown';
  const argsHash = crypto.createHash('sha1').update(JSON.stringify(req.body?.params || {})).digest('hex').slice(0, 10);
  const start = Date.now();

  // Extra gate for file methods to enforce jail policy at gateway level if params include paths
  // This is a conservative check. The upstream server should also enforce policy.
  try {
    guardPolicy(req.body);
  } catch (e: any) {
    audit({ kind: 'deny', method, id, reason: e.message });
    return res.status(403).json({ error: 'policy_denied', details: e.message });
  }

  const line = JSON.stringify(req.body) + '\n';
  child.stdin.write(line);

  let buf = '';
  const onData = (chunk: Buffer) => {
    buf += chunk.toString();
    const firstLine = buf.split('\n').find((l) => l.trim());
    if (firstLine) {
      child.stdout.off('data', onData);
      try {
        const parsed = JSON.parse(firstLine);
        const duration = Date.now() - start;
        audit({ kind: 'ok', method, id, argsHash, bytes: firstLine.length, ms: duration });
        return res.json(parsed);
      } catch (err) {
        const duration = Date.now() - start;
        audit({ kind: 'bad_json', method, id, argsHash, ms: duration });
        return res.status(502).json({ error: 'bad_upstream_json' });
      }
    }
  };
  child.stdout.on('data', onData);
});

function guardPolicy(msg: any) {
  const p = msg?.params || {};
  const paths: string[] = collectPaths(p);
  if (!paths.length) return;

  for (const fp of paths) {
    if (!isInsideRoot(fp, policy.root)) {
      throw new Error('Path outside jail: ' + fp);
    }
  }

  // If method looks like write, check write allow
  const m: string = msg?.method || '';
  const isWrite = /write|delete|move|copy|mkdir|append/i.test(m);
  if (isWrite) {
    for (const fp of paths) {
      if (!isInWriteAllow(fp, policy.writeAllow)) {
        throw new Error('Write not allowed here: ' + fp);
      }
    }
  }

  // Denylist basic check
  for (const fp of paths) {
    if (matchesAny(fp, policy.deny)) {
      throw new Error('Path denied by policy: ' + fp);
    }
  }
}

function collectPaths(obj: any): string[] {
  const out: string[] = [];
  if (!obj) return out;
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (typeof cur === 'string' && looksLikePath(cur)) out.push(cur);
    else if (cur && typeof cur === 'object') {
      for (const v of Object.values(cur)) stack.push(v);
    }
  }
  return out;
}

function looksLikePath(s: string) {
  return /[\/]/.test(s) || s.startsWith('file://');
}

function isInsideRoot(fp: string, root: string) {
  const normFp = normalize(fp);
  const normRoot = normalize(root);
  return normFp.toLowerCase().startsWith(normRoot.toLowerCase());
}

function isInWriteAllow(fp: string, allow: string[]) {
  const rel = toRelative(fp);
  // Very simple glob check. Upstream server should have its own checks too.
  return allow.some(glob => simpleMatch(rel, glob));
}

function matchesAny(fp: string, globs: string[]) {
  const rel = toRelative(fp);
  return globs.some(glob => simpleMatch(rel, glob));
}

function normalize(p: string) {
  if (p.startsWith('file://')) return p.replace(/\\/g, '/');
  // assume Windows file path to URL-like prefix for comparisons
  const fp = p.replace(/\\/g, '/');
  const root = (policy.root || '').replace('file://', '');
  return 'file://' + joinUrlish(root, fp);
}

function toRelative(p: string) {
  const root = (policy.root || '').replace('file://', '');
  const fp = p.replace('file://', '').replace(/\\/g, '/');
  if (fp.toLowerCase().startsWith(root.toLowerCase())) {
    return fp.slice(root.length).replace(/^\//, '');
  }
  return fp;
}

function joinUrlish(a: string, b: string) {
  if (a.endsWith('/')) a = a.slice(0, -1);
  if (b.startsWith('/')) b = b.slice(1);
  return a + '/' + b;
}

function simpleMatch(text: string, glob: string) {
  // minimal ** glob
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
  return new RegExp('^' + esc + '$').test(text);
}

app.listen(PORT, () => {
  console.log('Filesystem for Codex gateway listening on', PORT);
});
