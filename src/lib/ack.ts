/** Short confirmations — route to brain ack handler, not voice filler or fallback misses. */
export function isAcknowledgment(text: string): boolean {
  return /^(ok|okay|k|got it|sure|yep|yeah|understood|alright|right|cool|copy|thanks|thank you)[.!?,\\s]*$/i.test(text.trim())
}
