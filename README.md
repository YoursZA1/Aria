# Business AI

Your business. One intelligent assistant.

A React operating layer for a studio — not a chatbot. Seeded as an **OnTheDesign** tenant, with specialised agents that read clients, projects, money, and the diary, then **prepare work for you to approve**.

## Run it

```bash
cd business-ai
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## What this MVP does

1. **Command dashboard** — greeting, live insights, morning briefing, AI alert with Handle / View / Ignore.
2. **Business data** — clients, projects, tasks, calendar, invoices, leads, brand kits.
3. **Agents** — CEO, Client, Project, Finance, Marketing, Creative (or Auto).
4. **AI actions** — draft and send payment reminders, reschedule a delayed shoot, follow up with quiet clients, send the Veld Electric proposal. Nothing goes out until you approve.

Try:

- “Show me everything I need to deal with today.”
- “Which clients haven’t paid?”
- “Send reminders.”
- “Handle the Meridian delay.”

Edits persist in this browser (`localStorage`). **Reset** in the sidebar restores the seed.

## Product shape

Business AI is the SaaS shell. OnTheDesign is the first company on it. Paidly and analytics are stubbed as later systems on the Systems page.
