import { detectModelTier, TIERS } from './modelTiers.js'
import { shouldThink } from './adaptiveGate.js'
import { buildRequestConfig, preprocessMessages } from './thinkingConfig.js'
import { UniversalThinkParser } from './universalThinkParser.js'

export async function sendMessage(modelId, messages, callbacks, options = {}) {
  const tier = detectModelTier(modelId)
  const needsThinking = shouldThink(messages, options.forceThinking)

  const effectiveTier = needsThinking ? tier : TIERS.NONE

  const processedMessages = preprocessMessages(messages, effectiveTier, modelId)
  const requestBody = buildRequestConfig(processedMessages, effectiveTier, options)

  requestBody.model = modelId

  let response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: options.signal
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      callbacks.onDone?.({ tier: effectiveTier, aborted: true });
      return;
    }
    callbacks.onError?.(new Error('Không kết nối được. Kiểm tra LM Studio đang chạy?'))
    return
  }

  if (!response.ok) {
    callbacks.onError?.(new Error(`LM Studio trả về ${response.status}`))
    return
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (data.type === 'clarify') {
      callbacks.onClarify?.(data);
    } else {
      const text = data.choices?.[0]?.message?.content || data.message || '';
      callbacks.onTextChunk?.(text);
    }
    callbacks.onDone?.({ tier: effectiveTier, aborted: false });
    return;
  }

  const parser = new UniversalThinkParser()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let thinkingStarted = false
  let thinkingEnded = false
  let thinkStartTime = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()

      for (const line of lines) {
        const raw = line.trim()
        if (!raw.startsWith('data: ')) continue
        const dataStr = raw.slice(6).trim()
        
        if (dataStr === '[DONE]') {
          const flushed = parser.flush()
          if (flushed.thinking) callbacks.onThinkingChunk?.(flushed.thinking)
          if (flushed.text) callbacks.onTextChunk?.(flushed.text)
          if (thinkingStarted && !thinkingEnded) {
            callbacks.onThinkingEnd?.()
            thinkingEnded = true
          }
          callbacks.onDone?.({
            thinking: parser.thinking,
            text: parser.text,
            tier: effectiveTier,
            hasThinking: parser.thinking.length > 0,
            thinkDurationMs: thinkStartTime ? Date.now() - thinkStartTime : 0,
            aborted: false
          })
          return
        }

        let data
        try { data = JSON.parse(dataStr) } catch { continue }

        const delta = data.choices?.[0]?.delta
        if (!delta) continue

        const result = parser.process(delta)

        if (result.thinking) {
          if (!thinkingStarted) {
            thinkStartTime = Date.now()
            callbacks.onThinkingStart?.()
            thinkingStarted = true
          }
          callbacks.onThinkingChunk?.(result.thinking)
        }

        if (result.text) {
          if (thinkingStarted && !thinkingEnded) {
            callbacks.onThinkingEnd?.()
            thinkingEnded = true
          }
          callbacks.onTextChunk?.(result.text)
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
       callbacks.onDone?.({ tier: effectiveTier, aborted: true });
       return;
    }
    callbacks.onError?.(err);
  }
}
