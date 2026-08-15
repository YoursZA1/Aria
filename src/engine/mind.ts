export type MindMood = 'idle' | 'listening' | 'thinking' | 'speaking'

function clamp01(n: number) {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

export function growFrom(skills: number, knowledge: number) {
  return clamp01((skills / (skills + 14)) * 0.78 + (knowledge / (knowledge + 8)) * 0.22)
}

export function mindTitle(skills: number, knowledge: number) {
  const grow = growFrom(skills, knowledge)
  if (grow < 0.18) return 'Nascent field'
  if (grow < 0.4) return 'Forming cortex'
  if (grow < 0.68) return 'Synaptic lattice'
  return 'Mature mind'
}
