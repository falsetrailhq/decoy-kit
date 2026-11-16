#!/usr/bin/env node
// decoy-kit CLI: node cli.mjs --domain decoy.example.com [--out ./decoys] [--kinds env,mcp]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generate, manifest, caddyfile, KIND_NAMES } from './generate.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes('-h') || args.includes('--help') || !opt('domain')) {
  console.log(`decoy-kit: inert decoy files that alert on a domain you control

Usage:
  node cli.mjs --domain decoy.example.com [--out ./decoys] [--kinds ${KIND_NAMES.join(',')}]

The domain must be yours, with wildcard DNS (*.decoy.example.com) pointing at a
server whose logs you watch, e.g. listener.mjs from this repo.
Only plant decoys on systems you own or are authorised to test.`);
  process.exit(opt('domain') ? 0 : 1);
}

try {
  const domain = opt('domain');
  const out = opt('out') ?? './decoys';
  const kinds = opt('kinds')?.split(',').map((s) => s.trim()).filter(Boolean);
  const decoys = generate({ domain, kinds });

  if (existsSync(out)) throw new Error(`${out} already exists; choose a new --out folder`);
  mkdirSync(out, { recursive: true });
  for (const x of decoys) writeFileSync(join(out, x.file), x.body);
  writeFileSync(join(out, 'MANIFEST.csv'), manifest(decoys, domain));
  const caddy = caddyfile(decoys);
  if (caddy) writeFileSync(join(out, 'Caddyfile'), caddy);

  console.log(`Wrote ${decoys.length} decoys to ${out}/\n`);
  for (const x of decoys) console.log(`  ${x.id}  ${x.file.padEnd(28)} ${x.suggested}`);
  console.log(`\nMove MANIFEST.csv somewhere safe, off the systems you plant on.\nCaddyfile is for the listener server: DECOYS=${out} docker compose up -d`);
} catch (err) {
  console.error(`decoy-kit: ${err.message}`);
  process.exit(1);
}
