# AI improvement log

Engineering history for Aria. Each entry: what changed, why, what it solved, checks, eval before/after, whether it actually helped, lessons.

Do not invent scores. If the sample is too small, write **insufficient data**.

---

## 2026-08-15 — Controlled self-improvement loop

**What changed.** Gated Autopilot. Aria is architect/reviewer/PO. Cursor is the coding agent. Three permission levels. Nightly improvement cycle + eval snapshots from real messages/Cursor/research. `docs/` + Software Engineer skill. Engineer plugin: status, `aria/improve-*` branches, lint/test/typecheck. Merge endpoints refuse.

**Why.** Mando asked her to keep improving without freely rewriting production — especially Paidly money paths.

**Problem solved.** Autopilot could start Cursor jobs against the working tree with no branch/PR/eval gate.

**Test results.** Unit tests added for gates and eval honesty. Full suite runs via `npx vitest run`.

**Performance before/after.** No prior eval snapshot (insufficient data). Do not invent 92%.

**Did it improve the assistant?** It made her safer. Capability lift is unproven until samples exist.

**Lessons.** Level 1 cycle can run every Johannesburg night. Level 2 is the default (Branch writes on) unless Mando pauses her. Level 3 never ships itself.

---

## 2026-08-15 — Aria is the coding agent

**What changed.** Identity, prompts, kernel UI, and default write mode: Aria implements on `aria/improve-*`. Cursor is how she types. Existing localStorage migrates to `writeMode: 'branch'` unless it was explicitly `'off'`. Level 3 (merge, deploy, auth, Paidly payments) still requires Mando.

**Why.** Mando asked to make Aria a coding agent, not only an architect who tickets work for Cursor.

**Problem solved.** Default `writeMode: 'off'` plus “I am the architect” copy kept her from implementing.

**Test results.** Gates: Autopilot Level 2 allowed when write mode is branch; Level 3 still blocked without approval.

**Performance before/after.** Insufficient data.

**Did it improve the assistant?** It made her able to ship code. Merge/payment safety is unchanged.

**Lessons.** Being a coding agent is Level 2, not Level 3. Pause Branch writes to observe only.

---

## 2026-08-15 — Level 3 approval

**What changed.** Chat/kernel phrase “level 3 approved” sets `level3Approved`. Auth, payments, migrations, and security may be implemented on a branch. Merge, production deploy, delete data, and spend stay blocked. Cursor jobs are gated on the **title**, not the boilerplate prompt (which mentioned deploy/auth and was blocking every job).

**Why.** Mando approved Level 3. The old gate also false-positived on prompt text.

**Test results.** `npx vitest run` — merge/deploy still blocked after approval; Stripe/auth allowed after approval; “Work on Paidly” is not Level 3.

**Performance before/after.** Insufficient data.

**Did it improve the assistant?** It unblocked normal coding-agent jobs and recorded human approval correctly.

**Lessons.** Do not classify the safety prompt as the task. Approval ≠ merge.

---

## 2026-08-15 — `/__aria` on Vercel

**What changed.** Production was a static SPA. Every `/__aria/*` call 404ed. Same handlers now run behind `vercel.json` rewrite → `api/aria/[...path].ts` → `plugins/aria-serve.ts`. Cursor Agent.create still local-only (501), not a fake 200.

**Why.** Frontend already called real routes; Vercel never registered the Vite middleware.

**Test results.** Path mapping unit tests. Local Vite `/__aria/health` was already 200. Production was 404 HTML before this change.

**Did it improve the assistant?** It unblocks search/read/think/skills on the live site. Cursor spawn remains local.

**Lessons.** Do not stub `/__aria`. Register the existing plugin handlers.

---

## 2026-08-15 — Vercel `/__aria` native-binding crash

**What changed.** Production rewrite worked, then the function died with `Cannot find native binding` because `aria-browser.ts` / `aria-cursor.ts` imported `loadEnv` from `vite`. Env reads moved to `plugins/aria-env.ts` (`process.env` only). Local Vite still hydrates `.env` in `vite.config.ts`.

**Why.** The frontend 404s were routing. The follow-on 500s were bundling Vite into the serverless graph.

**Test results.** Unit tests assert the serverless files do not import `vite`. Local Vite `/__aria/health` stays the real handler.

**Did it improve the assistant?** It is required for search/read/think/skills on https://aria-khaki-one.vercel.app. Cursor spawn remains local.

**Lessons.** Vite plugins may import `vite`. The Vercel `/__aria` dispatcher may not. Nested catch-all `api/aria/[...path]` only matched one segment on this Vite project — use one `api/aria.ts` and pass the rest as `__path`.

---

## 2026-08-16 — ChatGPT writes the reply

**What changed.** Local brain still retrieves (ledger, skills, code, intent). ChatGPT (`POST /__aria/think`, gpt-4o-mini) writes the reply Mando sees for conversational intents. Mechanical OS actions stay local. If ChatGPT is down, Aria says so and keeps the retrieve draft.

**Why.** Most chat intents never called OpenAI, so Aria looked like a canned kernel even when the ChatGPT route existed.

**Test results.** `shouldUseGpt` unit tests: today/unpaid/hello go through ChatGPT; live-sync/ack/autopilot stay local.

**Did it improve the assistant?** It makes ChatGPT the voice. Production still needs `OPENAI_API_KEY` on the function at runtime.

**Lessons.** Retrieve first, then generate. Do not let a failed GPT call look like a successful canned answer.
