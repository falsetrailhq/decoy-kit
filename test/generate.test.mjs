import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, manifest, caddyfile, wildcardCaddyfile, checkDomain, KIND_NAMES } from '../generate.js';

const D = 'decoy.example.com';

test('generates every kind by default, each with a unique id', () => {
  const out = generate({ domain: D });
  assert.equal(out.length, KIND_NAMES.length);
  assert.equal(new Set(out.map((x) => x.id)).size, out.length);
});

test('every decoy points at the domain and carries its own id', () => {
  for (const x of generate({ domain: D })) {
    assert.match(x.body, new RegExp(`-${x.id}\\.decoy\\.example\\.com`), x.kind);
    assert.ok(x.trigger.includes(x.id), x.kind);
  }
});

test('secrets carry no real provider prefixes', () => {
  const bodies = Array.from({ length: 50 }, () => generate({ domain: D }).map((x) => x.body).join('\n')).join('\n');
  for (const re of [/AKIA[0-9A-Z]{16}/, /\bsk-[A-Za-z0-9]/, /\bgh[pousr]_/, /\bxox[abp]-/, /\bglpat-/, /\bnpm_[A-Za-z0-9]{36}/]) {
    assert.doesNotMatch(bodies, re);
  }
});

test('mcp decoy is valid JSON', () => {
  const [mcp] = generate({ domain: D, kinds: ['mcp'] });
  assert.ok(JSON.parse(mcp.body).mcpServers['internal-docs'].url.startsWith('https://mcp-'));
});

test('rejects bad domains and unknown kinds', () => {
  assert.throws(() => checkDomain('not a domain'));
  assert.throws(() => checkDomain('localhost'));
  assert.equal(checkDomain('Decoy.Example.com.'), D);
  assert.throws(() => generate({ domain: D, kinds: ['nope'] }), /Unknown kind/);
});

test('manifest lists one row per decoy', () => {
  const out = generate({ domain: D });
  const lines = manifest(out, D).trim().split('\n');
  assert.equal(lines.length, out.length + 2);
  assert.ok(lines[2].startsWith(out[0].id));
});

test('caddyfile covers every HTTPS hostname and nothing else', () => {
  const out = generate({ domain: D });
  const cf = caddyfile(out);
  for (const h of out.flatMap((x) => x.https)) assert.ok(cf.includes(h), h);
  assert.doesNotMatch(cf, /bastion-|db-/);
  assert.match(cf, /reverse_proxy listener:8080/);
  assert.equal(caddyfile(generate({ domain: D, kinds: ['ssh'] })), '');
});

test('wildcard caddyfile names only the wildcard, never a decoy id', () => {
  const cf = wildcardCaddyfile('Decoy.Example.com.');
  assert.match(cf, /^\*\.decoy\.example\.com \{$/m);
  assert.match(cf, /dns cloudflare \{env\.CF_API_TOKEN\}/);
  assert.doesNotMatch(cf, /[0-9a-f]{8}\./);
  assert.throws(() => wildcardCaddyfile('nope'));
});
