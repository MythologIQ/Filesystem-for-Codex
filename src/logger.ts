import fs from 'fs';
import path from 'path';

const logDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const auditPath = path.join(logDir, 'audit.ndjson');

export function audit(entry: Record<string, any>) {
  entry.ts = new Date().toISOString();
  fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n');
}
