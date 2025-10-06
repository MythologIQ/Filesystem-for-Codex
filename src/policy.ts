import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export type Policy = {
  root: string;
  readAllow: string[];
  writeAllow: string[];
  deny: string[];
};

export function loadPolicy(file = 'policy.json'): Policy {
  const p = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8'));
  return p;
}

export function normalizeWinPath(p: string) {
  return p.replace(/\\/g, '/');
}
