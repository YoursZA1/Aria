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
