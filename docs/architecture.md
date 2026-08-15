# Aria OS architecture

GitHub is the source of truth. This is the **real** tree — not a fictional `/agents` layout.

```text
business-ai (Aria)
│
├── src/                 UI + COO brain
│   ├── engine/          think, kernel, engineer, goal, cursor briefs
│   ├── pages/           Command, Finance, Aria kernel, …
│   ├── store/           localStorage OS state
│   └── components/
├── plugins/             Real /__aria handlers (Vite + Vercel)
├── api/aria/[...path]   Vercel rewrite target for /__aria/*
├── .cursor/skills/      Same skills Aria and Cursor load
├── docs/                Architecture + AI_IMPROVEMENT_LOG.md
├── tests live as src/**/*.test.ts
└── .env                 Local secrets — never commit
```

## `/__aria` service layer

The frontend calls `/__aria/*`. Those routes are **implemented**, not stubs.

| Runtime | How they run |
|---|---|
| `npm run dev` / `vite preview` | Vite middleware in `plugins/aria-browser.ts` and `plugins/aria-cursor.ts` |
| Vercel production | Rewrite `/__aria/:path*` → `/api/aria/:path*` → same handlers via `plugins/aria-serve.ts` |

| Route | What it does | Production |
|---|---|---|
| `GET /__aria/health` | Plugin + keys status | Live |
| `GET /__aria/search` | Web search (Google CSE or fallback) | Live if env set |
| `GET /__aria/read` | Fetch + extract a URL | Live |
| `POST /__aria/think` | OpenAI JSON reply | Live if `OPENAI_API_KEY` |
| `GET /__aria/skills` | Skill catalog | Live |
| `POST /__aria/skills/match` | Match a skill | Live |
| `GET /__aria/cursor/health` | Cursor key + status | Route live; **Agent.create is local Vite only** |
| `POST /__aria/cursor/run` | Spawn Cursor agent | **501 on Vercel** — needs `npm run dev` |
| `GET /__aria/code/*` | Read this repo | Live if source files are in the function bundle |
| ` /__aria/engineer/*` | Git/checks | Limited on serverless |

Do not invent fake 200s. If a capability cannot run (local Cursor agent on Vercel), return JSON that says so.

## Roles

| Role | Who |
|---|---|
| Coding agent (retrieve → patch on `aria/improve-*`) | Aria |
| Typing surface | Cursor |
| Merge / deploy | Mando |
| Auth / payments / migrations on a branch | Aria after “level 3 approved” |
| Auth / payments merge to production | Mando |

## Permission levels

1. Observe, ticket, eval, plan
2. Branch `aria/improve-*`, patch, checks, PR
3. Merge, deploy, migrations, auth, Paidly payments, delete data, security, spend

## Ultimate commercial goal

R0 → R1,000,000 verified ZAR collected. Empty ledger is R0.
