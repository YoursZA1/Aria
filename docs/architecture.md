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
├── plugins/             Vite bridges (browser, code, Cursor, engineer, skills)
├── .cursor/skills/      Same skills Aria and Cursor load
├── docs/                Architecture + AI_IMPROVEMENT_LOG.md
├── tests live as src/**/*.test.ts
└── .env                 Local secrets — never commit
```

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
