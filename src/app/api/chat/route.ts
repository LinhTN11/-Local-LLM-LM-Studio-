import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { messages, model, stream } = await req.json();

    // Call 1: Classification (Fast, non-streaming)
    const lastUserMsgObj = messages && messages.length > 0
        ? [...messages].reverse().find(m => m.role === 'user')?.content
        : '';

    let lastUserMsg = '';
    if (typeof lastUserMsgObj === 'string') {
        lastUserMsg = lastUserMsgObj;
    } else if (Array.isArray(lastUserMsgObj)) {
        const textPart = lastUserMsgObj.find((p: { type: string; text?: string }) => p.type === 'text');
        lastUserMsg = textPart?.text || '';
    }

    // Heuristics to check for greetings, acknowledgments, or social chatter
    const isGreetingOrSocial = (text: string): boolean => {
        const clean = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ""); // remove punctuation
        if (!clean) return true;

        const exactMatches = [
            'chào', 'xin chào', 'chào bạn', 'chào nhé', 'chào nha', 'chào ad', 'chào bot', 'chào cả nhà', 'chào mọi người',
            'hi', 'hello', 'hey', 'alo', 'halo', 'halô', 'hé lô', 'helo',
            'cảm ơn', 'cám ơn', 'cảm ơn bạn', 'cám ơn bạn', 'thank', 'thanks', 'thank you', 'cảm ơn ad', 'cảm ơn bot',
            'ok', 'okay', 'oke', 'okey', 'được', 'được rồi', 'dạ', 'vâng', 'ừ', 'uh', 'uhm', 'có', 'không', 'đúng', 'sai',
            'bạn khỏe không', 'khoẻ không', 'bạn là ai', 'bạn tên gì', 'tên gì', 'ai đó',
            'good morning', 'good afternoon', 'good evening', 'bye', 'goodbye', 'tạm biệt'
        ];

        if (exactMatches.includes(clean)) return true;

        const pattern = /^(chào|xin chào|hello|hi|hey|cảm ơn|cám ơn|thank)\s+(bạn|mọi người|ad|bot|ai|nha|nhé|nhiều|nhe|nhiu)$/i;
        return pattern.test(clean);
    };

    const isSocial = isGreetingOrSocial(lastUserMsg);

    // Skip classification if this is a combined clarification response (our format: "Q → A")
    const nonEmptyLines = lastUserMsg.split('\n').filter((l: string) => l.trim());
    const isClarificationResponse = nonEmptyLines.length > 0 && nonEmptyLines.every((l: string) => l.includes(' → '));
    
    const shouldSkipClassification = isClarificationResponse || isSocial;

    if (shouldSkipClassification) {
        console.log(`[Classification] Skipping — reason: ${isClarificationResponse ? 'combined clarification' : 'social/greeting message'}`);
    }
        
    const recentHistory = messages && messages.length > 1
        ? messages.slice(-8, -1).map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : '[media]'}`).join('\n')
        : '';

    // Extract previously asked clarification questions to prevent repetition
    const previousClarifications: string[] = [];
    if (messages) {
        for (const m of messages) {
            if (m.role === 'assistant' && m.isClarification && m.questions) {
                for (const q of m.questions) {
                    if (q.message) previousClarifications.push(q.message);
                }
            }
        }
    }
    const antiRepeatBlock = previousClarifications.length > 0
        ? `\n\nCÁC CÂU HỎI ĐÃ TỪNG HỎI TRƯỚC ĐÓ (TUYỆT ĐỐI KHÔNG HỎI LẠI):\n${previousClarifications.map((q, i) => `${i+1}. "${q}"`).join('\n')}\nNếu người dùng đã trả lời câu hỏi nào rồi, coi như đã đủ thông tin cho phần đó.`
        : '';

    const userInstruction = recentHistory
        ? `Dưới đây là lịch sử cuộc trò chuyện gần đây:\n${recentHistory}\n\nTin nhắn mới nhất của người dùng cần bạn đánh giá:\n"${lastUserMsg}"${antiRepeatBlock}`
        : `Tin nhắn mới nhất của người dùng cần bạn đánh giá:\n"${lastUserMsg}"${antiRepeatBlock}`;

    const classifyMessages = [
        {
            role: 'system',
            content: `Bạn là trợ lý AI chuyên nghiệp phân tích và phân loại tin nhắn của người dùng trong một cuộc trò chuyện chatbot.
Nhiệm vụ duy nhất của bạn là đánh giá xem tin nhắn mới nhất của người dùng có bị thiếu thông tin quan trọng hoặc quá chung chung không.

QUY TẮC PHÂN LOẠI BẮT BUỘC:
1. Nếu tin nhắn mới nhất quá ngắn, thiếu ngữ cảnh, mơ hồ hoặc có nhiều hướng triển khai rất khác nhau (Ví dụ: "tạo một app Android", "làm web bán hàng", "viết script python", "lỗi rồi", "giúp mình với", "học lập trình"):
   -> Bạn bắt buộc phải trả về type là "clarify".
   -> Trường "intro" là 1-2 câu dẫn dắt thân thiện bằng tiếng Việt (ví dụ: "Tôi rất vui được hỗ trợ bạn! Để giúp bạn hiệu quả nhất, tôi cần làm rõ:").
   -> Trường "questions" là mảng chứa 1-3 câu hỏi cần hỏi. Mỗi câu hỏi có "message" (câu hỏi ngắn gọn) và "suggestions" (2-3 lựa chọn CỤ THỂ, 2-5 từ mỗi cái).
   -> suggestions PHẢI là lựa chọn thực tế liên quan trực tiếp đến yêu cầu. TUYỆT ĐỐI KHÔNG DÙNG PLACEHOLDER.
   -> TUYỆT ĐỐI KHÔNG lặp lại câu hỏi đã từng hỏi trước đó trong lịch sử.

   Ví dụ cho "tạo một app Android":
   {
     "type": "clarify",
     "intro": "Tôi rất vui được hỗ trợ bạn xây dựng ứng dụng Android! Để đưa ra giải pháp phù hợp nhất, tôi cần biết thêm:",
     "questions": [
       {
         "message": "Bạn muốn dùng công nghệ nào để phát triển?",
         "suggestions": ["Kotlin/Java native", "React Native", "Flutter"]
       },
       {
         "message": "Ứng dụng này phục vụ mục đích gì?",
         "suggestions": ["App bán hàng", "Mạng xã hội", "Công cụ tiện ích"]
       }
     ]
   }

2. Nếu tin nhắn đã rõ ràng, đủ ngữ cảnh, hoặc đang trả lời câu hỏi làm rõ:
   -> Trả về type "answer":
   {
     "type": "answer",
     "intro": "",
     "questions": []
   }

3. TUYỆT ĐỐI KHÔNG phân loại các tin nhắn xã giao, chào hỏi, cảm ơn, tạm biệt, các câu hỏi xã giao về bản thân trợ lý AI, hoặc các phản hồi ngắn đơn giản của cuộc hội thoại bình thường (Ví dụ: "xin chào", "hello", "bạn khỏe không", "cảm ơn bạn nhé", "ok", "tốt", "bye") vào nhóm "clarify". Đối với các tin nhắn này, bắt buộc phải trả về type "answer" để hệ thống trả lời trực tiếp mà không hiển thị bảng câu hỏi làm rõ.`
        },
        {
            role: 'user',
            content: userInstruction
        }
    ];

    const jsonSchemaFormat = {
        type: "json_schema",
        json_schema: {
            name: "clarification_response",
            strict: true,
            schema: {
                type: "object",
                properties: {
                    type: {
                        type: "string",
                        enum: ["clarify", "answer"]
                    },
                    intro: {
                        type: "string"
                    },
                    questions: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string"
                                },
                                suggestions: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    }
                                }
                            },
                            required: ["message", "suggestions"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["type", "intro", "questions"],
                additionalProperties: false
            }
        }
    };

    if (!shouldSkipClassification) {
    try {
        console.log(`[Classification Pass] Input: "${lastUserMsg}"`);
        const classifyResponse = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model || 'local-model',
                messages: classifyMessages,
                stream: false,
                max_tokens: 400,
                response_format: jsonSchemaFormat
            }),
            cache: 'no-store',
        });

        if (classifyResponse.ok) {
            const classifyData = await classifyResponse.json();
            const content = (
                classifyData.choices?.[0]?.message?.content || 
                classifyData.choices?.[0]?.message?.reasoning_content || 
                ''
            ).trim();
            console.log(`[Classification Raw Output]:`, content);
            
            let parsed: any = null;
            
            // 1. Try normal JSON parse
            try {
                parsed = JSON.parse(content);
            } catch (e) {
                // 2. Try regex extraction of JSON
                const match = content.match(/\{[\s\S]*\}/);
                if (match) {
                    try { parsed = JSON.parse(match[0]); } catch (e) {}
                }
            }

            // 3. Backward compat: if old format (message/suggestions at top level), convert to questions[]
            if (parsed && parsed.type === 'clarify' && !parsed.questions && parsed.message && parsed.suggestions) {
                parsed.questions = [{ message: parsed.message, suggestions: parsed.suggestions }];
            }

            // 4. Fallback heuristic: Parse standard text if model didn't output JSON
            if (!parsed || (parsed.type !== 'clarify' && parsed.type !== 'answer')) {
                console.log(`[Classification] JSON parsing failed or invalid. Attempting heuristic parsing...`);
                const lines = content.split('\n').map((l: string) => l.trim()).filter(Boolean);
                const suggestions: string[] = [];
                const questionLines: string[] = [];
                const listPattern = /^(?:\d+\.\s*|[-*+•]\s+)(.+)$/;

                for (const line of lines) {
                    const match = line.match(listPattern);
                    if (match) {
                        const itemText = match[1].trim();
                        if (itemText && !itemText.toLowerCase().startsWith('ví dụ') && !itemText.toLowerCase().startsWith('hay một')) {
                            suggestions.push(itemText);
                        }
                    } else {
                        if (suggestions.length === 0) {
                            questionLines.push(line);
                        }
                    }
                }

                if (suggestions.length >= 2) {
                    let question = questionLines.join(' ');
                    const questionMarkIndex = question.lastIndexOf('?');
                    if (questionMarkIndex !== -1) {
                        const startOfSentence = question.lastIndexOf('.', questionMarkIndex - 1);
                        question = question.slice(startOfSentence !== -1 ? startOfSentence + 1 : 0).trim();
                    } else {
                        question = questionLines[questionLines.length - 1] || "Bạn cần làm rõ điều gì?";
                    }

                    const cleanedSuggestions = suggestions
                        .filter(s => s.length > 0 && s.length < 100)
                        .slice(0, 4);

                    if (cleanedSuggestions.length >= 2) {
                        parsed = {
                            type: 'clarify',
                            intro: '',
                            questions: [{ message: question, suggestions: cleanedSuggestions }]
                        };
                        console.log(`[Classification] Heuristic successfully parsed:`, parsed);
                    }
                }
            }

            if (parsed && parsed.type === 'clarify' && parsed.questions && parsed.questions.length > 0) {
                console.log(`[Classification Result] Triggering clarification with ${parsed.questions.length} question(s)!`);
                return NextResponse.json(parsed);
            } else {
                console.log(`[Classification Result] Proceeding to stream standard answer.`);
            }
        } else {
            console.error(`[Classification Pass] Failed to call model API. Status: ${classifyResponse.status}`);
        }
    } catch (err) {
        console.error('Error during classification pass:', err);
        // Fallback to normal stream if classification fails
    }
    } // end !shouldSkipClassification

    // Call 2: Normal execution (Proxy POST completions to local LM Studio)
    const response = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'local-model',
        messages: messages || [],
        stream: stream ?? false,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LM Studio error: ${response.status} - ${errorText}`);
    }

    // Handle Server-Sent Events (SSE) streaming proxy
    if (stream) {
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Standard JSON response proxy
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to communicate with LM Studio';
    console.error('Error in chat proxy route:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
