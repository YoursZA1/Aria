import { foldAsk } from '../lib/fold'

export { foldAsk }

export function isUnpaidAsk(t: string): boolean {
  const n = foldAsk(t).toLowerCase()
  if (/haven'?t paid|hasn'?t paid|not paid|overdue|who owes|unpaid|outstanding invoice/.test(n)) return true
  if (/which clients.*(haven'?t|hasn'?t|not) paid|who.*(haven'?t|hasn'?t) paid/.test(n)) return true
  if (/(who|which).*(client|customer).*(owe|overdue|late|outstanding|haven'?t paid|not paid)/.test(n)) return true
  if (/clients? (that |who )?(still )?(owe|haven'?t paid)/.test(n)) return true
  return false
}

export function isGoalAsk(t: string): boolean {
  const n = foldAsk(t).toLowerCase()
  if (/r\s*0\s*(to|->|→|-)\s*r?\s*1/.test(n)) return true
  if (/\br\s*1\s*(m|mil|million)\b/.test(n)) return true
  if (/\b1\s*(million|mil)\b/.test(n)) return true
  if (/1\s*,?\s*000\s*,?\s*000/.test(n)) return true
  if (/ultimate goal|million rand|million zar/.test(n)) return true
  if (/how (do|can|will) (i|we) (get|make|reach|hit|earn|turn).*(million|1m|r1)/.test(n)) return true
  if (/path to (a |the )?(million|r1)|turn r\s*0/.test(n)) return true
  return false
}

export function isWealthAsk(t: string): boolean {
  const n = foldAsk(t).toLowerCase()
  if (isGoalAsk(t)) return true
  if (/wealth path|financial independence|income streams|recurring vs project|asset vs/.test(n)) return true
  if (/\b(money|wealth|income)\s+levels?\b/.test(n)) return true
  if (/^(what'?s|whats|what is|what|which|where'?s|wheres|my|our|the)\s+(my\s+|the\s+)?(wealth\s+|money\s+|income\s+)?levels?\b/.test(n)) return true
  if (/^(am i|i am|i'?m|im)\s+(on\s+)?levels?\b/.test(n)) return true
  if (/\blevel\s*[1-6]\b/.test(n) && !/log\s*level|sea level|a-level/.test(n)) return true
  if (/^levels?\b/.test(n) && !/level up|next level|sea level|a-level|log level/.test(n)) return true
  return false
}
