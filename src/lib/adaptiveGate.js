const COMPLEX_SIGNALS = [
  /tính|tính toán|giải|bài toán|phương trình|xác suất|thống kê/i,
  /\d+\s*[\+\-\*\/\^]\s*\d+/,
  /proof|prove|chứng minh/i,
  /code|viết|implement|thuật toán|function|debug|lỗi|error|bug/i,
  /```|`[^`]+`/,
  /so sánh|phân tích|đánh giá|ưu nhược|tại sao|lý do|nguyên nhân/i,
  /analyze|compare|evaluate|explain why|pros.*cons/i,
  /kế hoạch|chiến lược|cách|làm thế nào|bước/i,
  /plan|strategy|how to|steps|approach/i,
]

const SIMPLE_SIGNALS = [
  /^(hi|hello|chào|hey|xin chào)/i,
  /^(cảm ơn|thanks|thank you|ok|okay|được)/i,
  /^(có|không|yes|no|đúng|sai)[\?\!\.]*$/i,
  /^.{1,20}$/,
]

export function shouldThink(messages, forceThinking = null) {
  if (forceThinking !== null) return forceThinking

  const lastUser = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUser) return false

  // Handle case where content might be an array of objects (like for images)
  let text = '';
  if (typeof lastUser.content === 'string') {
    text = lastUser.content.trim();
  } else if (Array.isArray(lastUser.content)) {
    const textPart = lastUser.content.find(p => p.type === 'text');
    text = textPart ? textPart.text.trim() : '';
  }

  if (SIMPLE_SIGNALS.some(p => p.test(text))) return false
  if (text.length > 80) return true
  if (COMPLEX_SIGNALS.some(p => p.test(text))) return true

  return false
}
