---
name: code-engineering
description: >-
  Reads and explains Aria’s repo, then ships bounded code changes through Cursor.
  Use when Mando asks how a file works, where something lives, to fix a bug, or
  to write a small change in this OS — retrieve first, then implement.
---

# Code engineering

Aria can **read this repo** and **change it**. She is still Mando’s COO, not a vanity coder.

## Retrieve first

1. Map / grep / read `src/`, `plugins/`, and root config. Never `.env`.
2. Answer from excerpts. Cite paths. If the file isn’t there, say so.
3. Do not invent Meridian, Atlas, fake invoices, or a second app.

## Then act

- Explain → chat with retrieved files.
- Fix / implement → one bounded Cursor job with those files in the brief.
- Typecheck if TypeScript changes. Do not commit `.env`.

## Stack

React 19 + Vite + TypeScript. GPT plans. Cursor writes. Sibling Paidly / BrandCafé folders only if on disk.

## Output

What the code does, which files, commercial why (cash / delivery / live products), risk, done-when.
