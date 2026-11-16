// decoy-kit: generates inert decoy files that point at a domain you control.
// Shared by the CLI (cli.mjs) and the web page (index.html). No dependencies.
//
// Every decoy gets its own short id. The id appears in a hostname label and in
// a URL path, so the request (or DNS lookup) that reaches your server tells you
// exactly which file was found and used.

const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const HEX = '0123456789abcdef';

function rand(len, chars = ALPHA) {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export const newId = () => rand(8, HEX);

// Neutral secret: no provider prefix (AKIA, sk-, ghp_, xox...), so secret scanners
// and provider revocation programs do not treat it as a real leaked key.
const secret = (len = 40) => rand(len);

const DOMAIN_RE = /^(?=.{4,200}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function checkDomain(domain) {
  const d = String(domain || '').trim().toLowerCase().replace(/\.$/, '');
  if (!DOMAIN_RE.test(d)) throw new Error(`"${domain}" is not a valid domain name, e.g. decoy.example.com`);
  return d;
}

// Each kind returns { file, suggested, trigger, https, body }; https lists the hostnames served over HTTPS.
const KINDS = {
  env: (d, id) => ({
    file: '.env',
    suggested: 'A project folder on a developer machine or build server, next to the real .env.example',
    trigger: `DNS lookup or connection to db-${id}.${d}, or a request to https://api-${id}.${d}`,
    https: [`api-${id}.${d}`],
    body: [
      '# Reporting service, staging. Do not commit.',
      `DATABASE_URL=postgres://svc_reporting:${secret(24)}@db-${id}.${d}:5432/reporting`,
      `INTERNAL_API_URL=https://api-${id}.${d}/v2`,
      `INTERNAL_API_TOKEN=${secret()}`,
      'LOG_LEVEL=info',
      '',
    ].join('\n'),
  }),

  kubeconfig: (d, id) => ({
    file: 'kubeconfig-prod-legacy.yaml',
    suggested: '~/.kube/ on an admin workstation, or a CI secret',
    trigger: `kubectl (or any client) connecting to https://k8s-${id}.${d}`,
    https: [`k8s-${id}.${d}`],
    body: [
      'apiVersion: v1',
      'kind: Config',
      'clusters:',
      '- name: prod-legacy',
      '  cluster:',
      `    server: https://k8s-${id}.${d}`,
      '    insecure-skip-tls-verify: true',
      'users:',
      '- name: deploy-admin',
      '  user:',
      `    token: ${secret(48)}`,
      'contexts:',
      '- name: prod-legacy',
      '  context:',
      '    cluster: prod-legacy',
      '    user: deploy-admin',
      'current-context: prod-legacy',
      '',
    ].join('\n'),
  }),

  mcp: (d, id) => ({
    file: 'mcp.backup.json',
    suggested: 'Next to an AI client MCP configuration, as a backup file your own clients do not load',
    trigger: `An agent or person connecting to https://mcp-${id}.${d}/mcp`,
    https: [`mcp-${id}.${d}`],
    body: JSON.stringify({
      mcpServers: {
        'internal-docs': {
          url: `https://mcp-${id}.${d}/mcp`,
          headers: { Authorization: `Bearer ${secret()}` },
        },
      },
    }, null, 2) + '\n',
  }),

  gitcreds: (d, id) => ({
    file: '.git-credentials',
    suggested: 'Home directory of a build or deploy user',
    trigger: `git (or anything else) using the URL https://git-${id}.${d}`,
    https: [`git-${id}.${d}`],
    body: `https://deploy-bot:${secret(32)}@git-${id}.${d}\n`,
  }),

  npmrc: (d, id) => ({
    file: '.npmrc',
    suggested: 'Home directory or a project folder on a build machine',
    trigger: `npm install or a request to https://npm-${id}.${d}`,
    https: [`npm-${id}.${d}`],
    body: [
      `@internal:registry=https://npm-${id}.${d}/`,
      `//npm-${id}.${d}/:_authToken=${secret()}`,
      '',
    ].join('\n'),
  }),

  ssh: (d, id) => ({
    file: 'ssh_config.snippet',
    suggested: 'Append to ~/.ssh/config on an admin workstation (no key needed; the lookup is the signal)',
    trigger: `DNS lookup or SSH connection to bastion-${id}.${d}`,
    https: [],
    body: [
      'Host legacy-bastion',
      `    HostName bastion-${id}.${d}`,
      '    User ops',
      '    Port 22',
      '',
    ].join('\n'),
  }),

  history: (d, id) => ({
    file: 'bash_history.snippet',
    suggested: 'Append a line to a shell history file on a server',
    trigger: `A request to https://admin-${id}.${d}`,
    https: [`admin-${id}.${d}`],
    body: `curl -s -H "Authorization: Bearer ${secret()}" https://admin-${id}.${d}/export/users.csv -o users.csv\n`,
  }),
};

export const KIND_NAMES = Object.keys(KINDS);

/**
 * Generate decoys.
 * @param {{ domain: string, kinds?: string[] }} opts
 * @returns {{ id: string, kind: string, file: string, suggested: string, trigger: string, https: string[], body: string }[]}
 */
export function generate({ domain, kinds = KIND_NAMES }) {
  const d = checkDomain(domain);
  return kinds.map((kind) => {
    const make = KINDS[kind];
    if (!make) throw new Error(`Unknown kind "${kind}". Choose from: ${KIND_NAMES.join(', ')}`);
    const id = newId();
    return { id, kind, ...make(d, id) };
  });
}

// A manifest to keep outside the systems you plant in: which id is which file, and where you put it.
export function manifest(decoys, domain) {
  const rows = [['id', 'kind', 'file', 'hostname_prefix', 'planted_at', 'suggested'].join(',')];
  for (const x of decoys) {
    const host = x.trigger.match(/([a-z0-9]+-[0-9a-f]{8})\./)?.[1] ?? '';
    rows.push([x.id, x.kind, x.file, host, '', `"${x.suggested.replace(/"/g, '""')}"`].join(','));
  }
  return `# decoy-kit manifest for ${checkDomain(domain)}. Keep this file OFF the systems you plant decoys on.\n` + rows.join('\n') + '\n';
}

// A Caddyfile for the listener server: one site block covering every HTTPS hostname,
// so Caddy obtains a certificate for each and forwards requests to listener.mjs.
export function caddyfile(decoys, upstream = 'listener:8080') {
  const hosts = decoys.flatMap((x) => x.https);
  if (!hosts.length) return '';
  return `# decoy-kit: generated for ${hosts.length} decoy hostnames. Regenerate when you add decoys.\n${hosts.join(', ')} {\n\treverse_proxy ${upstream}\n}\n`;
}

// A Caddyfile with one wildcard certificate (DNS challenge through Cloudflare), so certificate
// transparency logs show only *.domain and never the decoy ids. Covers decoys added later too.
export function wildcardCaddyfile(domain, upstream = 'listener:8080') {
  const d = checkDomain(domain);
  return `# decoy-kit: one wildcard certificate for *.${d}; decoy ids stay out of certificate transparency logs.\n*.${d} {\n\ttls {\n\t\tdns cloudflare {env.CF_API_TOKEN}\n\t}\n\treverse_proxy ${upstream}\n}\n`;
}
