import { useState } from 'react'
import { sendMessage } from '../lib/lmStudioClient'
import { detectModelTier, TIERS } from '../lib/modelTiers'

export function useAdaptiveThinking(selectedModel) {
  const [forceThinking, setForceThinking] = useState(null)  // null = adaptive
  
  const modelTier = selectedModel ? detectModelTier(selectedModel) : null
  const isNativeThinking = modelTier === TIERS.NATIVE

  const send = (messages, callbacks, options = {}) => {
    return sendMessage(selectedModel, messages, callbacks, { 
      ...options, 
      forceThinking 
    })
  }

  return {
    modelTier, 
    isNativeThinking, 
    forceThinking, 
    setForceThinking,
    send,
  }
}
