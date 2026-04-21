# Verbum — Deploying to Cloudflare Workers AI

A single-file Bible Q&A app powered by Cloudflare Workers AI. No API keys to manage, free tier is generous, and it deploys in about two minutes.

## Prerequisites

- A free Cloudflare account: https://dash.cloudflare.com/sign-up
- Node.js 18+ installed locally

## Deploy in 4 steps

### 1. Install Wrangler (Cloudflare's CLI)

```bash
npm install -g wrangler
```

### 2. Put the files in a folder

Create a new folder and drop both files into it:

```
verbum/
├── worker.js
└── wrangler.toml
```

### 3. Log in to Cloudflare

```bash
wrangler login
```

This opens a browser window to authorize Wrangler. Approve it and come back to the terminal.

### 4. Deploy

```bash
cd verbum
wrangler deploy
```

Wrangler prints a URL like `https://verbum.<your-subdomain>.workers.dev`. Open it — you're live.

## How it works

- `worker.js` serves the HTML page **and** exposes a `POST /api/ask` endpoint.
- The endpoint calls Cloudflare's Llama 3.3 70B model via the `env.AI` binding.
- No API keys live in the code — the AI binding is auto-authenticated.

## Customizing

**Change the model** — edit this line in `worker.js`:

```js
const aiResponse = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { ... });
```

Other good options on Workers AI:
- `@cf/meta/llama-3.1-8b-instruct-fast` — faster, cheaper, slightly less capable
- `@cf/mistral/mistral-7b-instruct-v0.1` — alternative architecture

Full catalog: https://developers.cloudflare.com/workers-ai/models/

**Custom domain** — In Cloudflare dashboard → Workers & Pages → your Worker → Settings → Domains & Routes, add a domain you own.

**Free tier limits** — 10,000 neurons/day on the free plan (~several hundred questions). If you exceed it, upgrade to Workers Paid ($5/month) for 10,000 neurons/day included plus pay-as-you-go beyond that.

## Local development

Run the Worker locally before deploying:

```bash
wrangler dev
```

Visit http://localhost:8787. Note: Workers AI calls still run against Cloudflare's remote inference endpoint even in dev mode, so you need internet.

## Caveats about accuracy

LLMs can occasionally misquote verses. The system prompt instructs the model to only cite verses it's confident about, but for a production app used in a church or ministry context, consider wiring in a deterministic Bible API (api.bible, bible-api.com) to fetch verse text by reference rather than relying on the model's memory. Happy to help with that next.
