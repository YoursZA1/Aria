/** Fold typed/spoken punctuation so matchers see one shape of English. */

export function foldAsk(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u2018\u2019\u201B\u201C\u201D`´]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}
