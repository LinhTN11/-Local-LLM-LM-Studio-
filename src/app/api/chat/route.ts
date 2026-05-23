import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages, model, stream } = await req.json();

    // Proxy POST completions to local LM Studio
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
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
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
