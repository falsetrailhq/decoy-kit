import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { handler } from '../listener.mjs';

test('listener logs the decoy id from the Host header and answers 401', async (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(JSON.parse(line)));
  const server = http.createServer(handler).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  const res = await new Promise((resolve, reject) => {
    http.get({ port, host: '127.0.0.1', path: '/v2/users', headers: { host: 'api-8b70a0e9.decoy.example.com', authorization: 'Bearer x' } },
      (r) => { r.resume(); resolve(r); }).on('error', reject);
  });
  server.close();
  assert.equal(res.statusCode, 401);
  assert.match(res.headers['www-authenticate'], /^Basic /);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].id, '8b70a0e9');
  assert.equal(lines[0].path, '/v2/users');
  assert.equal(lines[0].authorization, 'present');
  assert.equal(lines[0].confidence, 'high');
});

test('a bare GET without a credential is low confidence', async (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(JSON.parse(line)));
  const server = http.createServer(handler).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    http.get({ port, host: '127.0.0.1', path: '/', headers: { host: 'api-8b70a0e9.decoy.example.com' } },
      (r) => { r.resume(); resolve(); }).on('error', reject);
  });
  server.close();
  assert.equal(lines[0].confidence, 'low');
});

test('a POST without a credential is low confidence', async (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(JSON.parse(line)));
  const server = http.createServer(handler).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    http.request({ port, host: '127.0.0.1', method: 'POST', path: '/graphql', headers: { host: 'api-8b70a0e9.decoy.example.com' } },
      (r) => { r.resume(); resolve(); }).on('error', reject).end('{}');
  });
  server.close();
  assert.equal(lines[0].confidence, 'low');
});
