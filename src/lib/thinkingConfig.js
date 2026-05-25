import { TIERS } from './modelTiers.js'

const THINKING_SYSTEM_PROMPT = `Khi trả lời câu hỏi phức tạp, hãy suy nghĩ trước rồi mới trả lời.
Định dạng bắt buộc:
<think>
[Viết quá trình suy nghĩ của bạn ở đây: phân tích vấn đề, các bước giải quyết, kiểm tra lại...]
</think>

[Câu trả lời cuối cùng của bạn ở đây]

Nếu câu hỏi đơn giản (chào hỏi, yes/no, định nghĩa ngắn), bỏ qua phần <think> và trả lời thẳng.`

export function buildRequestConfig(messages, tier, options = {}) {
  const { temperature, maxTokens = 8192 } = options

  const base = {
    messages,
    stream: true,
    max_tokens: maxTokens,
  }

  switch (tier) {
    case TIERS.NATIVE: {
      return {
        ...base,
        temperature: temperature ?? 0.6,
        top_p: 0.95,
        top_k: 20,
        chat_template_kwargs: { enable_thinking: true },
      }
    }

    case TIERS.INSTRUCTED: {
      const existingSystem = messages.find(m => m.role === 'system')
      const injectedMessages = existingSystem
        ? messages.map(m =>
            m.role === 'system'
              ? { ...m, content: m.content + '\n\n' + THINKING_SYSTEM_PROMPT }
              : m
          )
        : [{ role: 'system', content: THINKING_SYSTEM_PROMPT }, ...messages]

      return {
        ...base,
        messages: injectedMessages,
        temperature: temperature ?? 0.7,
      }
    }

    case TIERS.NONE:
    default:
      return { ...base, temperature: temperature ?? 0.7 }
  }
}

export function preprocessMessages(messages, tier, modelId) {
  if (tier !== TIERS.NATIVE) return messages

  const isQwen3 = /qwen3/i.test(modelId || '')
  if (!isQwen3) return messages

  return messages.map((m, i) => {
    const isLastUser = m.role === 'user' && i === messages.length - 1
    if (!isLastUser) return m
    
    // Content can be array for images
    let text = typeof m.content === 'string' ? m.content : '';
    if (Array.isArray(m.content)) {
      const textPart = m.content.find(p => p.type === 'text');
      text = textPart ? textPart.text : '';
    }

    const hasToken = /\/think|\/no-think/.test(text)
    if (hasToken) return m

    if (typeof m.content === 'string') {
      return { ...m, content: m.content.trimEnd() + ' /think' }
    } else {
      const newContent = m.content.map(p => 
        p.type === 'text' ? { ...p, text: p.text.trimEnd() + ' /think' } : p
      );
      return { ...m, content: newContent };
    }
  })
}
