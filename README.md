# decoy-kit

**Inert decoy files that alert on a domain you control.** A free, dependency-free generator for honeytokens in the places intruders and AI agents look first: `.env`, kubeconfig, MCP client config, `.git-credentials`, `.npmrc`, SSH config and shell history.

Each decoy gets its own 8-character id, written into a hostname (`db-8b70a0e9.decoy.example.com`) and so into every request it causes. When something reads the file and uses what is in it, your server sees the request and the id tells you which file was found.

- **Web:** https://falsetrailhq.github.io/decoy-kit/ (runs entirely in your browser, nothing is sent anywhere)
- **CLI:** `node cli.mjs --domain decoy.example.com`
- **Listener:** `docker compose up -d` (Caddy for automatic HTTPS + `listener.mjs`), logs hits as JSON lines and posts to a webhook

No npm dependencies, no accounts, no hosted service. Node 20+ for the CLI; Docker for the listener server.

## Quick start (about 5 minutes)

You need a domain you own and a small server with ports 80 and 443 open.

```sh
# 1. DNS: a wildcard A record  *.decoy.example.com -> your server's IP
# 2. Generate decoys (writes the files, MANIFEST.csv and a Caddyfile)
git clone https://github.com/falsetrailhq/decoy-kit && cd decoy-kit
node cli.mjs --domain decoy.example.com --out ./decoys
# 3. Start the listener server (certificates are obtained automatically)
DECOYS=./decoys WEBHOOK_URL=https://hooks.slack.com/services/... docker compose up -d
# 4. Test one decoy, then plant the files
curl -s https://api-<id>.decoy.example.com/ ; docker compose logs listener
```

## Why

Credential theft is the common thread in recent intrusions and supply-chain attacks: secrets read from developer machines, CI runners and config files, then tried. AI coding agents and attack agents read the same files, faster. A decoy that nobody legitimate uses turns "someone read this file and tried what was in it" into a high-confidence alert.

Hosted canary services are a great start. decoy-kit is for when you want the decoys to point at **your own domain**, so they aren't recognisable as a public canary service and the evidence stays with you.

## Decoy types

| Kind | File | Plant it in | Fires on |
|---|---|---|---|
| `env` | `.env` | A project folder on a developer machine or build server | DNS lookup or connection to `db-<id>`, request to `api-<id>` |
| `kubeconfig` | `kubeconfig-prod-legacy.yaml` | `~/.kube/` on an admin workstation, a CI secret | Any client connecting to `k8s-<id>` |
| `mcp` | `mcp.backup.json` | Next to an AI client's MCP config, as a backup your clients don't load | An agent or person connecting to `mcp-<id>/mcp` |
| `gitcreds` | `.git-credentials` | Home directory of a build or deploy user | Any use of `git-<id>` |
| `npmrc` | `.npmrc` | Home directory or project on a build machine | `npm install` or a request to `npm-<id>` |
| `ssh` | `ssh_config.snippet` | Append to `~/.ssh/config` | DNS lookup or SSH to `bastion-<id>` |
| `history` | `bash_history.snippet` | Append to a shell history file | A request to `admin-<id>` |

For more placements, mapped to MITRE ATT&CK and D3FEND, see [34 honeytoken examples](https://falsetrail.com/guides/honeytoken-examples/) and the [ATT&CK to deception mapping](https://github.com/falsetrailhq/attack-deception-mapping).

## Setup

### 1. Pick a domain

Use a subdomain you own and that looks unremarkable next to your real names, e.g. `int.example-corp.net` rather than `honeypot.example.com`. Create a wildcard DNS record `*.int.example-corp.net` pointing at the machine that will run the listener.

### 2. Generate

```sh
git clone https://github.com/falsetrailhq/decoy-kit && cd decoy-kit
node cli.mjs --domain int.example-corp.net --out ./decoys
# or only some kinds
node cli.mjs --domain int.example-corp.net --out ./decoys --kinds env,mcp,kubeconfig
```

This writes one file per decoy plus `MANIFEST.csv`. Fill in where you planted each one, and **keep the manifest off the systems you plant on**.

### 3. Watch for hits

The easy way is Docker Compose. The CLI wrote a `Caddyfile` listing every decoy hostname; Caddy gets a Let's Encrypt certificate for each one and forwards requests to `listener.mjs`:

```sh
DECOYS=./decoys WEBHOOK_URL=https://hooks.slack.com/services/... docker compose up -d
docker compose logs -f listener
```

Regenerate decoys into a new folder? Point `DECOYS` at it and run `docker compose up -d` again. Without Docker, run the listener directly behind your own TLS proxy, or give it a certificate:

```sh
WEBHOOK_URL=https://hooks.slack.com/services/... PORT=8080 node listener.mjs
TLS_CERT=fullchain.pem TLS_KEY=privkey.pem PORT=443 node listener.mjs
```

Every request is logged as one JSON line (time, decoy id, host, method, path, source IP, user agent, whether an Authorization header was sent) and answered with an empty `401` Basic challenge, so git, npm and similar clients retry with the planted credential. With `WEBHOOK_URL` set, it also posts `{"text": "..."}`, which Slack, Mattermost and most chat webhooks accept. Ship the log to your SIEM like any other.

If you run the listener without Compose, put it behind a reverse proxy that terminates TLS and forwards `X-Forwarded-For`, or give it a wildcard certificate. Some triggers (the SSH snippet, a database URL that is only resolved) produce only a DNS lookup; to see those, enable query logging on the authoritative DNS for your decoy domain.

**Certificate transparency noise.** Every certificate a public CA issues is published in CT logs, and internet scanners watch those logs and probe new hostnames within minutes. With one certificate per decoy hostname (the Compose setup), expect a few requests from scanners soon after the certificates are issued and whenever they renew. They usually ask for `/` with no `Authorization` header from a hosting provider address. A request that carries a credential, or asks for the exact path written in the decoy, is a real trigger. To avoid the noise entirely, use one wildcard certificate (`*.decoy.example.com`, issued with a DNS challenge), which shows only the wildcard in CT logs, not the decoy ids.

### 4. Plant and test

Copy each file to its place, then trigger one yourself (`curl https://api-<id>.<your-domain>/`) and confirm the alert arrives. A decoy that silently stops alerting is worse than none.

## Safety

- **Only plant decoys on systems you own or are authorised to test.**
- **No real provider formats.** Secrets are random alphanumeric strings with no `AKIA`, `sk-`, `ghp_`, `xox` or similar prefix, so they don't trigger GitHub secret scanning, provider revocation programs or your own secret scanners, and nobody wastes time on a "leaked" key.
- **No real brands or services.** Decoys point only at your domain. If you want a real cloud access key canary, use your cloud provider's own tooling or a canary service, with a key that has no permissions.
- **Alert on use, not on reads.** Backup, sync and indexing tools read files; they don't connect to the hosts inside them. That's why every trigger here is a network request, not a file open.
- **Expect your own tools.** IDE extensions, `kubectl` context switchers and link checkers may touch a decoy. Note their source addresses in a short learning period and exclude them.

## Limits

decoy-kit gives you a tripwire: one decoy, one alert. It doesn't follow what the intruder does next, manage the lifecycle of hundreds of placements, or deliver findings to a SIEM with context. If you need that, look at a deception platform; [FalseTrail](https://falsetrail.com/) is one, built for AI-driven attacks and run entirely in your own environment.

## Related

- [Canary tokens, explained](https://falsetrail.com/guides/canary-tokens/)
- [Honeytoken examples mapped to ATT&CK](https://falsetrail.com/guides/honeytoken-examples/)
- [MCP security guide](https://falsetrail.com/guides/mcp-security/)
- [AI agent security guide](https://falsetrail.com/guides/ai-agent-security/)
- [awesome-deception](https://github.com/falsetrailhq/awesome-deception)

## License

MIT. Made by [FalseTrail](https://falsetrail.com/).
