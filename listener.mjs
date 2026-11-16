#!/usr/bin/env node
// decoy-kit listener: logs every request to your decoy domain as one JSON line,
// names the decoy id from the Host header, and optionally posts an alert to a webhook.
//
//   PORT=8080 node listener.mjs
//   WEBHOOK_URL=https://hooks.slack.com/services/... node listener.mjs
//   TLS_CERT=fullchain.pem TLS_KEY=privkey.pem PORT=443 node listener.mjs
//
// Every response is a 401 with no body. Nothing a decoy sends is stored except
// the request line, headers and source address.
import http from 'node:http';
import https from 'node:https';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT || 8080);
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const ID_RE = /^[a-z0-9]+-([0-9a-f]{8})\./;

async function alert(event) {
  if (!WEBHOOK_URL) return;
  const text = `decoy-kit: decoy ${event.id ?? '(unknown id)'} used. ${event.method} ${event.host}${event.path} from ${event.ip}`;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error(JSON.stringify({ error: 'webhook failed', message: err.message }));
  }
}

function handler(req, res) {
  const host = String(req.headers.host || '').toLowerCase().split(':')[0];
  const event = {
    time: new Date().toISOString(),
    id: host.match(ID_RE)?.[1] ?? null,
    host,
    method: req.method,
    path: req.url,
    ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] ?? null,
    authorization: req.headers.authorization ? 'present' : 'absent',
  };
  console.log(JSON.stringify(event));
  alert(event);
  res.writeHead(401, { 'content-length': '0' });
  res.end();
}

export { handler };

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const server = process.env.TLS_CERT && process.env.TLS_KEY
    ? https.createServer({ cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY) }, handler)
    : http.createServer(handler);
  server.listen(PORT, () => console.error(`decoy-kit listener on :${PORT}${WEBHOOK_URL ? ' (webhook on)' : ''}`));
}
