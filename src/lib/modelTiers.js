export const TIERS = { NATIVE: 'native', INSTRUCTED: 'instructed', NONE: 'none' }

const NATIVE_PATTERNS = [
  /deepseek.?r1/i,
  /qwq/i,
  /qwen3/i,
  /qvq/i,
  /sky.?t1/i,
  /marco.?o1/i,
  /light.?r1/i,
]

const INSTRUCTED_PATTERNS = [
  /llama/i,
  /mistral/i,
  /mixtral/i,
  /phi/i,
  /gemma/i,
  /qwen(?!3)/i,
  /falcon/i,
  /vicuna/i,
  /wizard/i,
  /openchat/i,
  /nous/i,
  /hermes/i,
]

const NONE_PATTERNS = [
  /embed/i,
  /1b$/i,
  /0\.5b/i,
]

export function detectModelTier(modelId) {
  if (!modelId) return TIERS.INSTRUCTED
  const id = modelId.toLowerCase()

  if (NONE_PATTERNS.some(p => p.test(id))) return TIERS.NONE
  if (NATIVE_PATTERNS.some(p => p.test(id))) return TIERS.NATIVE
  if (INSTRUCTED_PATTERNS.some(p => p.test(id))) return TIERS.INSTRUCTED

  return TIERS.INSTRUCTED
}
