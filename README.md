# Local LLM Chatbot UI for LM Studio

A polished Next.js chat interface for running local AI models through [LM Studio](https://lmstudio.ai). The app proxies chat and model requests to a local LM Studio instance, giving you a Claude-inspired experience with streaming responses, model switching, file attachments, and rich message rendering.

## Features

- Local-first chat via LM Studio on `http://127.0.0.1:1234`
- Model browser with native LM Studio API support and OpenAI-compatible fallback
- Streaming chat completion proxy for responsive replies
- Claude-style chat input with attachment handling and pasted snippet support
- Rich message rendering for code blocks, math, markdown, and copy-to-clipboard actions
- Modern Next.js App Router structure with TypeScript and Tailwind CSS

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- Shiki for code highlighting
- KaTeX for math rendering
- Lucide React for icons

## Prerequisites

Before running the app, make sure you have:

1. Node.js 20 or newer
2. LM Studio installed locally
3. A model downloaded and available in LM Studio

LM Studio should be running on the default local API address:

```text
http://127.0.0.1:1234
```

## Getting Started

1. Install dependencies

```bash
npm install
```

2. Start LM Studio and load a local model

3. Run the development server

```bash
npm run dev
```

4. Open the app

```text
http://localhost:3000
```

## Available Scripts

- `npm run dev` - start the development server
- `npm run build` - create a production build
- `npm run start` - run the production server
- `npm run lint` - run ESLint

## How It Works

- `src/app/api/models/route.ts` queries LM Studio and normalizes available models for the UI.
- `src/app/api/chat/route.ts` proxies chat completions to LM Studio and supports streaming responses.
- `src/components/demo.tsx` renders the main chatbot experience, including message history, attachments, and formatting.

## Notes

- This project is designed to work with a local LM Studio instance only.
- If LM Studio is offline, model and chat requests will fail until the local server is available again.
- The UI is optimized for a Claude-like workflow, but the backend is fully local.

## License

No license has been added yet. Add one if you plan to publish or share the project publicly.
