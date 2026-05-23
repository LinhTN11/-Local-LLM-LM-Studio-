"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import katex from 'katex';
import type { Highlighter } from 'shiki';
import ClaudeChatInput from './ui/claude-style-chat-input';
import { 
    Loader2, 
    RotateCcw, 
    Pencil, 
    Copy, 
    Sparkles, 
    ChevronDown, 
    ChevronUp, 
    Search, 
    Plus, 
    Download, 
    X, 
    ChevronRight,
    ChevronLeft,
    MessageCircle,
    Check
} from 'lucide-react';

interface AttachedFile {
    id: string;
    file: File;
    type: string;
    preview: string | null;
    uploadStatus: string;
    content?: string;
}

interface PastedSnippet {
    id: string;
    content: string;
    timestamp: Date;
}

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
    versions?: string[];
    activeVersion?: number;
}

interface Model {
    id: string;
    name: string;
    description: string;
    badge?: string;
}

interface ModelApiItem {
    id: string;
    name?: string;
    description?: string;
    badge?: string;
}

interface ChatSession {
    id: string;
    title: string;
    messages: Message[];
    timestamp: number;
    dateCategory: 'Today' | 'Yesterday' | 'Past week' | 'Past month';
    starred?: boolean;
}

// Standard Lucide circular chat bubble icon (matching New chat and Search style)
const ChatIcon = MessageCircle;

const APP_NAME = "菊玄";

type AppLogoProps = {
    className?: string;
};

const AppLogo: React.FC<AppLogoProps> = ({ className }) => (
    <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg" role="presentation">
        <defs>
            <ellipse id="petal-pair" cx="100" cy="100" rx="90" ry="22" />
        </defs>
        <g fill="currentColor" fillRule="evenodd">
            <use href="#petal-pair" transform="rotate(0 100 100)" />
            <use href="#petal-pair" transform="rotate(45 100 100)" />
            <use href="#petal-pair" transform="rotate(90 100 100)" />
            <use href="#petal-pair" transform="rotate(135 100 100)" />
        </g>
    </svg>
);

const DEFAULT_MODELS: Model[] = [
    { id: "sonnet-4.6", name: "Sonnet 4.6", description: "Responsive everyday work" }
];

const VIETNAMESE_DIACRITIC_REGEX = /[\u00C0-\u1EF9]/i;
const VIETNAMESE_WORD_REGEX = /\b(anh|em|ban|bạn|toi|tôi|minh|mình|khong|không|co|có|la|là|lam|làm|sao|gi|gì|giup|giúp|hay|hãy|cho|voi|với|cua|của|nay|này|do|đó|duoc|được|tieng|tiếng|viet|việt|loi|lỗi|phan|phần|tra|trả|loi|lời|ngon|ngôn|ngu|ngữ|dong|đồng|bo|bộ)\b/i;
const EMOJI_REGEX = /[\p{Extended_Pictographic}\uFE0F]/gu;

const DEFAULT_SYSTEM_PROMPT_TEMPLATE =
    `You are a helpful, extremely professional, and warm AI assistant.\n` +
    `IMPORTANT INSTRUCTIONS:\n` +
    `1. THINKING & RESPONSE LANGUAGE ALIGNMENT:\n` +
    `   - You must detect the language of the user's latest query (detected language: {{language}}).\n` +
    `   - ALWAYS think and respond in that SAME language. If the user asks in Vietnamese, your entire thinking process (enclosed inside <think> and </think> tags) AND your final response MUST be in Vietnamese. Do NOT write your thinking process in English when the user is querying in Vietnamese or other non-English languages.\n` +
    `   - Do not mix languages inside one sentence unless the user explicitly asks for translation, quotes, code, names, or terminology that must stay unchanged.\n` +
    `2. VISUAL FORMATTING & HUMAN-LIKE STYLE:\n` +
    `   - Write elegant, clean, and beautifully structured responses. Avoid robotic structures. Use conversational, natural language.\n` +
    `   - Do not use emoji unless the user explicitly asks for emoji or the task is specifically about emoji.\n` +
    `   - Make use of rich styling: Markdown headers (#, ##, ###) for sections, bullet points (- or *) for lists, bold (**text**) for emphasis. Use blockquotes (> quote) ONLY when directly quoting someone or something — do NOT overuse them for grouping or decoration.\n` +
    `   - If explaining multiple choices or scenarios, feel free to structure them clearly, explaining different options or drafting different viewpoints if helpful. Avoid showing raw formatting tags in simple views.`;

const isLikelyVietnamese = (text: string) => {
    const normalized = text.normalize("NFC").toLowerCase();
    return VIETNAMESE_DIACRITIC_REGEX.test(normalized) || VIETNAMESE_WORD_REGEX.test(normalized);
};

const removeUnrequestedEmoji = (text: string) => text.replace(EMOJI_REGEX, '').replace(/[ \t]{2,}/g, ' ');

// Custom lightweight robust Markdown Renderer
interface MarkdownRendererProps {
    text: string;
}

const getSharedHighlighter = async () => {
    const cache = globalThis as typeof globalThis & {
        __shikiHighlighterPromise?: Promise<Highlighter>;
    };

    if (!cache.__shikiHighlighterPromise) {
        cache.__shikiHighlighterPromise = (async () => {
            const [{ createHighlighter }, { bundledLanguages }] = await Promise.all([
                import('shiki'),
                import('shiki/langs')
            ]);
            return createHighlighter({
                themes: ['github-dark'],
                langs: Object.keys(bundledLanguages)
            });
        })();
    }

    return cache.__shikiHighlighterPromise;
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text }) => {
    if (!text) return null;

    const [copiedCodeBlockIdx, setCopiedCodeBlockIdx] = useState<number | null>(null);
    const [highlightedBlocks, setHighlightedBlocks] = useState<Record<number, string>>({});
    const [highlighterReady, setHighlighterReady] = useState(false);
    const highlighterRef = useRef<Highlighter | null>(null);

    // Normalizing Vietnamese precomposed Unicode (NFC)
    const normalized = text.normalize("NFC");

    // Split text by code fences and block math
    const parts = useMemo(() => normalized.split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$)/g), [normalized]);

    const renderMath = (mathText: string, displayMode: boolean) => {
        try {
            return katex.renderToString(mathText, {
                displayMode,
                throwOnError: false
            });
        } catch {
            return '';
        }
    };

    useEffect(() => {
        let cancelled = false;

        const initHighlighter = async () => {
            try {
                const highlighter = await getSharedHighlighter();
                if (cancelled) return;
                highlighterRef.current = highlighter;
                setHighlighterReady(true);
            } catch {
                if (!cancelled) {
                    setHighlighterReady(false);
                }
            }
        };

        initHighlighter();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!highlighterReady || !highlighterRef.current) return;

        const highlighter = highlighterRef.current;
        const availableLanguages = new Set(highlighter.getLoadedLanguages());
        const languageAliases: Record<string, string> = {
            js: 'javascript',
            ts: 'typescript',
            tsx: 'tsx',
            py: 'python',
            sh: 'bash',
            shell: 'bash',
            zsh: 'bash',
            yml: 'yaml'
        };

        const nextBlocks: Record<number, string> = {};

        parts.forEach((part, partIdx) => {
            if (part.startsWith('```') && part.endsWith('```')) {
                const lines = part.split('\n');
                const firstLine = lines[0] || '```';
                const rawLanguage = firstLine.slice(3).trim().toLowerCase();
                const resolvedLanguage = languageAliases[rawLanguage] || rawLanguage || 'text';
                const code = lines.slice(1, -1).join('\n');

                const safeLanguage = availableLanguages.has(resolvedLanguage)
                    ? resolvedLanguage
                    : (availableLanguages.has('plaintext') ? 'plaintext' : 'text');

                nextBlocks[partIdx] = highlighter.codeToHtml(code, {
                    lang: safeLanguage,
                    theme: 'github-dark'
                });
            }
        });

        setHighlightedBlocks(nextBlocks);
    }, [parts, highlighterReady]);

    return (
        <div className="space-y-2.5 w-full select-text leading-relaxed text-[#ececec]">
            {parts.map((part, partIdx) => {
                if (part.startsWith('```') && part.endsWith('```')) {
                    const lines = part.split('\n');
                    const firstLine = lines[0] || '```';
                    const language = firstLine.slice(3).trim() || 'javascript';
                    const code = lines.slice(1, -1).join('\n');
                    
                    const highlightedHtml = highlightedBlocks[partIdx];

                    return (
                        <div key={partIdx} className="my-3.5 rounded-xl overflow-hidden border border-[#2f2f2e] bg-[#161615] font-mono text-[13px] text-zinc-300">
                            <div className="flex items-center justify-between px-4 py-2 bg-[#20201f] border-b border-[#2f2f2e] text-xs text-zinc-500 font-sans select-none">
                                <span className="uppercase font-semibold tracking-wider text-[10px]">{language}</span>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(code);
                                        setCopiedCodeBlockIdx(partIdx);
                                        setTimeout(() => setCopiedCodeBlockIdx(null), 2000);
                                    }}
                                    className="hover:text-white transition-colors flex items-center gap-1"
                                >
                                    {copiedCodeBlockIdx === partIdx ? (
                                        <Check className="w-3.5 h-3.5" />
                                    ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                    )}
                                </button>
                            </div>
                            {highlightedHtml ? (
                                <div
                                    className="p-4 overflow-x-auto whitespace-pre no-scrollbar leading-normal"
                                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                                />
                            ) : (
                                <pre className="p-4 overflow-x-auto whitespace-pre no-scrollbar leading-normal">
                                    <code>{code}</code>
                                </pre>
                            )}
                        </div>
                    );
                }

                if (part.startsWith('$$') && part.endsWith('$$')) {
                    const mathText = part.slice(2, -2).trim();
                    const html = renderMath(mathText, true);
                    return (
                        <div
                            key={partIdx}
                            className="my-3 px-2"
                            dangerouslySetInnerHTML={{ __html: html || mathText }}
                        />
                    );
                }

                const lines = part.split('\n');
                let listItems: React.ReactNode[] = [];
                let orderedListItems: React.ReactNode[] = [];
                let blockquoteLines: string[] = [];
                let blockMode: 'quote' | 'box' | null = null;
                const renderedElements: React.ReactNode[] = [];

                const flushList = (key: string) => {
                    if (listItems.length > 0) {
                        renderedElements.push(
                            <ul key={`ul-${key}`} className="list-none space-y-1.5 pl-4 my-2.5">
                                {listItems}
                            </ul>
                        );
                        listItems = [];
                    }
                };

                const flushOrderedList = (key: string) => {
                    if (orderedListItems.length > 0) {
                        renderedElements.push(
                            <ol key={`ol-${key}`} className="list-decimal space-y-1.5 pl-6 my-2.5">
                                {orderedListItems}
                            </ol>
                        );
                        orderedListItems = [];
                    }
                };

                const flushBlockquote = (key: string) => {
                    if (blockquoteLines.length > 0) {
                        const content = blockquoteLines.join('\n');
                        const quoteLines = content.split('\n');
                        renderedElements.push(
                            <div 
                                key={`bq-${key}`} 
                                className="my-3 border-l-3 border-[#D46B4F] bg-white/5 px-4 py-3 rounded-r-xl text-[14px] text-zinc-300"
                            >
                                <div className="w-full flex flex-col justify-center gap-1">
                                    {quoteLines.map((line, lineIdx) => {
                                        const trimmed = line.trim();
                                        if (!trimmed) {
                                            return <div key={`bq-sp-${key}-${lineIdx}`} className="h-2" />;
                                        }
                                        return (
                                            <p key={`bq-ln-${key}-${lineIdx}`} className="text-[14px] leading-snug font-sans font-normal">
                                                {parseInline(line)}
                                            </p>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                        blockquoteLines = [];
                    }
                    blockMode = null;
                };

                const parseInline = (inlineText: string) => {
                    if (!inlineText) return "";
                    const tokens: React.ReactNode[] = [];
                    const inlineRegex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\$([^$\n]+)\$)/g;
                    let match;
                    let lastIdx = 0;
                    let tokenKey = 0;

                    while ((match = inlineRegex.exec(inlineText)) !== null) {
                        const matchIdx = match.index;
                        if (matchIdx > lastIdx) {
                            tokens.push(<span key={`txt-${tokenKey++}`}>{inlineText.substring(lastIdx, matchIdx)}</span>);
                        }

                        const [, , boldContent, italicContent, codeContent, mathContent] = match;
                        if (boldContent) {
                            tokens.push(<strong key={`b-${tokenKey++}`} className="font-semibold text-white">{boldContent}</strong>);
                        } else if (italicContent) {
                            tokens.push(<em key={`i-${tokenKey++}`} className="italic text-zinc-200">{italicContent}</em>);
                        } else if (codeContent) {
                            tokens.push(<code key={`c-${tokenKey++}`} className="px-1.5 py-0.5 mx-0.5 bg-[#252524] border border-[#3c3c3b] rounded font-mono text-[12px] text-[#D46B4F]">{codeContent}</code>);
                        } else if (mathContent) {
                            const html = renderMath(mathContent.trim(), false);
                            tokens.push(
                                <span
                                    key={`m-${tokenKey++}`}
                                    className="inline-block align-middle"
                                    dangerouslySetInnerHTML={{ __html: html || mathContent }}
                                />
                            );
                        }

                        lastIdx = inlineRegex.lastIndex;
                    }

                    if (lastIdx < inlineText.length) {
                        tokens.push(<span key={`txt-${tokenKey++}`}>{inlineText.substring(lastIdx)}</span>);
                    }

                    return tokens.length > 0 ? tokens : inlineText;
                };

                const parseTableRow = (line: string) => {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
                    return trimmed.slice(1, -1).split('|').map(cell => cell.trim());
                };

                const isTableSeparator = (line: string) => {
                    const cells = parseTableRow(line);
                    return Boolean(cells && cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell)));
                };

                for (let i = 0; i < lines.length; i++) {
                    const rawLine = lines[i];
                    const trimmedLine = rawLine.trim();

                    // Detect block box tags
                    if (trimmedLine === '[box]' || trimmedLine === ':::box') {
                        flushList(`b-${partIdx}-${i}`);
                        flushOrderedList(`b-${partIdx}-${i}`);
                        flushBlockquote(`b-${partIdx}-${i}`);
                        blockMode = 'box';
                        continue;
                    }
                    if (trimmedLine === '[/box]' || trimmedLine === ':::') {
                        flushBlockquote(`b-${partIdx}-${i}`);
                        continue;
                    }

                    // Blockquotes starting with >
                    if (rawLine.startsWith('>')) {
                        flushList(`bq-${partIdx}-${i}`);
                        flushOrderedList(`bq-${partIdx}-${i}`);
                        blockMode = blockMode || 'quote';
                        const quoteLine = rawLine.slice(1).trimStart();
                        if (quoteLine !== '[box]' && quoteLine !== '[/box]' && quoteLine !== ':::box' && quoteLine !== ':::') {
                            blockquoteLines.push(quoteLine);
                        }
                        continue;
                    } else if (blockMode === 'box') {
                        if (trimmedLine === '') {
                            blockquoteLines.push('');
                        } else {
                            blockquoteLines.push(rawLine);
                        }
                        continue;
                    } else if (blockMode === 'quote' && !rawLine.startsWith('>')) {
                        if (trimmedLine === '') {
                            blockquoteLines.push('');
                            continue;
                        } else {
                            flushBlockquote(`bq-${partIdx}-${i}`);
                        }
                    }

                    // Horizontal rules
                    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) {
                        flushList(`hr-${partIdx}-${i}`);
                        flushOrderedList(`hr-${partIdx}-${i}`);
                        flushBlockquote(`hr-${partIdx}-${i}`);
                        renderedElements.push(
                            <hr key={`hr-${partIdx}-${i}`} className="my-5 border-0 border-t border-[#3c3c3b]" />
                        );
                        continue;
                    }

                    // Markdown tables
                    const tableHeader = parseTableRow(rawLine);
                    const nextLine = lines[i + 1] || '';
                    if (tableHeader && isTableSeparator(nextLine)) {
                        flushList(`tbl-${partIdx}-${i}`);
                        flushOrderedList(`tbl-${partIdx}-${i}`);
                        flushBlockquote(`tbl-${partIdx}-${i}`);
                        const rows: string[][] = [];
                        let cursor = i + 2;
                        while (cursor < lines.length) {
                            const row = parseTableRow(lines[cursor]);
                            if (!row) break;
                            rows.push(row);
                            cursor++;
                        }
                        renderedElements.push(
                            <div key={`tbl-${partIdx}-${i}`} className="my-4 w-full overflow-x-auto rounded-xl border border-[#3c3c3b] bg-[#20201f]">
                                <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
                                    <thead className="bg-white/5 text-white">
                                        <tr>
                                            {tableHeader.map((cell, cellIdx) => (
                                                <th key={`th-${cellIdx}`} className="border-b border-r border-[#3c3c3b] last:border-r-0 px-3.5 py-2.5 font-semibold align-top">
                                                    {parseInline(cell)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, rowIdx) => (
                                            <tr key={`tr-${rowIdx}`} className="odd:bg-black/5">
                                                {tableHeader.map((_, cellIdx) => (
                                                    <td key={`td-${rowIdx}-${cellIdx}`} className="border-t border-r border-[#30302e] last:border-r-0 px-3.5 py-2.5 align-top text-zinc-300">
                                                        {parseInline(row[cellIdx] || '')}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                        i = cursor - 1;
                        continue;
                    }

                    // Headings starting with #
                    if (trimmedLine.startsWith('#')) {
                        flushList(`h-${partIdx}-${i}`);
                        flushOrderedList(`h-${partIdx}-${i}`);
                        const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);
                        if (headingMatch) {
                            const level = headingMatch[1].length;
                            const headingText = headingMatch[2];
                            const parsedTitle = parseInline(headingText);

                            if (level === 1) {
                                renderedElements.push(
                                    <h1 key={`h1-${partIdx}-${i}`} className="text-xl font-bold text-white tracking-tight mt-5 mb-2 font-sans leading-snug">
                                        {parsedTitle}
                                    </h1>
                                );
                            } else if (level === 2) {
                                renderedElements.push(
                                    <h2 key={`h2-${partIdx}-${i}`} className="text-lg font-bold text-white tracking-tight mt-4 mb-2 font-sans leading-snug">
                                        {parsedTitle}
                                    </h2>
                                );
                            } else {
                                renderedElements.push(
                                    <h3 key={`h3-${partIdx}-${i}`} className="text-[15px] font-semibold text-white tracking-tight mt-3 mb-1.5">
                                        {parsedTitle}
                                    </h3>
                                );
                            }
                            continue;
                        }
                    }

                    // Unordered list items starting with - or *
                    const bulletMatch = rawLine.match(/^(\s*)([-*])\s+(.*)$/);
                    if (bulletMatch) {
                        flushOrderedList(`l-${partIdx}-${i}`);
                        const itemText = bulletMatch[3];
                        listItems.push(
                            <li key={`li-${partIdx}-${i}`} className="flex items-start gap-2 text-[15px] pl-1 py-0.5">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#D46B4F] shrink-0 mt-[9px] opacity-90" />
                                <span className="flex-1">{parseInline(itemText)}</span>
                            </li>
                        );
                        continue;
                    }

                    // Ordered list items starting with numbered items
                    const orderedMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
                    if (orderedMatch) {
                        flushList(`ol-${partIdx}-${i}`);
                        const itemText = orderedMatch[3];
                        orderedListItems.push(
                            <li key={`oli-${partIdx}-${i}`} className="pl-1 py-0.5 text-[15px] leading-relaxed">
                                {parseInline(itemText)}
                            </li>
                        );
                        continue;
                    }

                    if (trimmedLine !== '') {
                        flushList(`p-${partIdx}-${i}`);
                        flushOrderedList(`p-${partIdx}-${i}`);
                    }

                    // Paragraphs
                    if (trimmedLine === '') {
                        flushList(`space-${partIdx}-${i}`);
                        flushOrderedList(`space-${partIdx}-${i}`);
                        renderedElements.push(<div key={`space-${partIdx}-${i}`} className="h-2" />);
                    } else {
                        renderedElements.push(
                            <p key={`p-${partIdx}-${i}`} className="text-[15px] leading-relaxed font-sans font-normal mb-1">
                                {parseInline(rawLine)}
                            </p>
                        );
                    }
                }

                flushList(`end-${partIdx}`);
                flushOrderedList(`end-${partIdx}`);
                flushBlockquote(`end-${partIdx}`);

                return (
                    <div key={partIdx} className="w-full space-y-0.5">
                        {renderedElements}
                    </div>
                );
            })}
        </div>
    );
};



const ChatboxDemo = () => {
    // Start with a single blank "New chat" session - no fake/mock history
    const initialSessions: ChatSession[] = [
        {
            id: 'session-1',
            title: 'New chat',
            timestamp: Date.now(),
            dateCategory: 'Today',
            messages: []
        }
    ];

    // State management
    const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
    const [activeSessionId, setActiveSessionId] = useState<string>('session-1');
    const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
    
    // Search Dialog States
    const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');

    // LLM Connection States
    const [isGenerating, setIsGenerating] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [models, setModels] = useState<Model[]>(DEFAULT_MODELS);
    const [selectedModel, setSelectedModel] = useState("sonnet-4.6");
    const [isThinkingEnabled, setIsThinkingEnabled] = useState(false); // Default OFF
    const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
    const [loadingModelName, setLoadingModelName] = useState<string>("");

    // UI Editing States
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingText, setEditingText] = useState<string>("");
    const abortControllerRef = useRef<AbortController | null>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const modelSnapshotRef = useRef<string>(JSON.stringify(DEFAULT_MODELS));
    const streamResponseRef = useRef<string>('');
    const streamReasoningRef = useRef<string>('');
    const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Chats manager states
    const [isChatsViewActive, setIsChatsViewActive] = useState<boolean>(false);
    const [chatsSearchQuery, setChatsSearchQuery] = useState<string>('');
    const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
    const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
    const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);

    // Helpers
    const formatSessionTime = (ts: number | string): string => {
        if (typeof ts === 'string') return ts;
        const now = Date.now();
        const diff = now - ts;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 21600000) return `${Math.floor(diff / 3600000)}h ago`;
        const date = new Date(ts);
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            let h = date.getHours();
            const m = date.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return `${h}:${m < 10 ? '0' + m : m} ${ampm}`;
        }
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
        if (diff < 604800000) return date.toLocaleDateString('en-US', { weekday: 'long' });
        if (diff < 2592000000) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const filteredChatsForManager = sessions.filter(s => 
        s.title.toLowerCase().includes(chatsSearchQuery.toLowerCase())
    );

    const handleChatRowClick = (sessionId: string) => {
        if (isSelectMode) {
            setSelectedSessionIds(prev => {
                const next = new Set(prev);
                if (next.has(sessionId)) {
                    next.delete(sessionId);
                } else {
                    next.add(sessionId);
                }
                return next;
            });
        } else {
            setActiveSessionId(sessionId);
            setIsChatsViewActive(false);
        }
    };

    const handleSelectAllChats = () => {
        if (selectedSessionIds.size === filteredChatsForManager.length) {
            setSelectedSessionIds(new Set());
        } else {
            setSelectedSessionIds(new Set(filteredChatsForManager.map(s => s.id)));
        }
    };

    const handleDeleteSelectedChats = () => {
        if (selectedSessionIds.size === 0) return;
        const confirmDelete = window.confirm(`Delete ${selectedSessionIds.size} selected chat(s)?`);
        if (!confirmDelete) return;

        const remaining = sessions.filter(s => !selectedSessionIds.has(s.id));
        setSessions(remaining);
        setSelectedSessionIds(new Set());
        setIsSelectMode(false);

        // If active session was deleted, switch active session
        if (selectedSessionIds.has(activeSessionId)) {
            if (remaining.length > 0) {
                setActiveSessionId(remaining[0].id);
            } else {
                // Initialize with a clean New chat session if empty
                const defaultSessionId = `session-${Date.now()}`;
                setSessions([
                    {
                        id: defaultSessionId,
                        title: 'New chat',
                        timestamp: Date.now(),
                        dateCategory: 'Today',
                        messages: []
                    }
                ]);
                setActiveSessionId(defaultSessionId);
            }
        }
    };

    const handleRenameChat = (sessionId: string, currentTitle: string) => {
        setActiveMenuSessionId(null);
        const newTitle = window.prompt("Enter new chat title:", currentTitle);
        if (newTitle === null || !newTitle.trim()) return;

        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                return { ...s, title: newTitle.trim() };
            }
            return s;
        }));
    };

    const handleDeleteChat = (sessionId: string) => {
        setActiveMenuSessionId(null);
        const confirmDelete = window.confirm("Are you sure you want to delete this chat?");
        if (!confirmDelete) return;

        const remaining = sessions.filter(s => s.id !== sessionId);
        setSessions(remaining);

        if (sessionId === activeSessionId) {
            if (remaining.length > 0) {
                setActiveSessionId(remaining[0].id);
            } else {
                const defaultSessionId = `session-${Date.now()}`;
                setSessions([
                    {
                        id: defaultSessionId,
                        title: 'New chat',
                        timestamp: Date.now(),
                        dateCategory: 'Today',
                        messages: []
                    }
                ]);
                setActiveSessionId(defaultSessionId);
            }
        }
    };

    // Active thoughts expand
    const [showThoughts, setShowThoughts] = useState<Record<number, boolean>>({});

    const chatEndRef = useRef<HTMLDivElement>(null);
    const editAreaRef = useRef<HTMLTextAreaElement>(null);

    const activeSession = useMemo(
        () => sessions.find(s => s.id === activeSessionId) || sessions[0],
        [sessions, activeSessionId]
    );
    const messages = useMemo(() => activeSession?.messages ?? [], [activeSession]);

    useEffect(() => {
        const sessionTitle = activeSession?.title || "";
        document.title = sessionTitle ? `${sessionTitle} - ${APP_NAME}` : APP_NAME;
    }, [activeSession?.title]);

    // Auto-scroll
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-grow inline edit box
    useEffect(() => {
        if (editAreaRef.current) {
            editAreaRef.current.style.height = "auto";
            editAreaRef.current.style.height = editAreaRef.current.scrollHeight + "px";
        }
    }, [editingText, editingIndex]);

    const [systemPromptTemplate, setSystemPromptTemplate] = useState<string>(DEFAULT_SYSTEM_PROMPT_TEMPLATE);

    useEffect(() => {
        let cancelled = false;

        const loadSystemPrompt = async () => {
            try {
                const res = await fetch('/system-prompt.txt', { cache: 'no-store' });
                if (!res.ok) return;
                const text = await res.text();
                if (!cancelled && text.trim()) {
                    setSystemPromptTemplate(text);
                }
            } catch {
                if (!cancelled) {
                    setSystemPromptTemplate(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
                }
            }
        };

        loadSystemPrompt();
        return () => {
            cancelled = true;
        };
    }, []);

    const applyModels = useCallback((nextModels: Model[]) => {
        const snapshot = JSON.stringify(nextModels);
        if (modelSnapshotRef.current !== snapshot) {
            modelSnapshotRef.current = snapshot;
            setModels(nextModels);
        }
    }, []);

    const fetchModels = useCallback(async () => {
        if (isLoadingModel) return;

        try {
            const res = await fetch('/api/models', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data && data.data && data.data.length > 0) {
                    const mapped = (data.data as ModelApiItem[]).map((m) => ({
                        id: m.id,
                        name: m.name || m.id.split('/').pop()?.split('\\').pop() || m.id,
                        description: m.description || `Local model active on LM Studio`,
                        badge: m.badge || 'LM Studio'
                    }));
                    applyModels(mapped);

                    setSelectedModel(prev => {
                        if (mapped.some((item) => item.id === prev)) return prev;
                        const firstActive = mapped.find((item) => item.badge === 'Active');
                        return firstActive ? firstActive.id : mapped[0].id;
                    });
                    setIsConnected(true);
                    return;
                }
            }
            setIsConnected(false);
            applyModels(DEFAULT_MODELS);
        } catch {
            setIsConnected(false);
            applyModels(DEFAULT_MODELS);
        }
    }, [applyModels, isLoadingModel, setSelectedModel]);

    // Fetch once on first page load.
    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

    const handleSelectModel = async (modelId: string) => {
        setSelectedModel(modelId);

        // Find the model details
        const targetModel = models.find(m => m.id === modelId);
        if (targetModel && targetModel.badge === 'Downloaded') {
            setIsLoadingModel(true);
            setLoadingModelName(targetModel.name);
            const waitForModelActive = async (targetId: string) => {
                const startTime = Date.now();
                const timeoutMs = 120000;
                const intervalMs = 2000;

                while (Date.now() - startTime < timeoutMs) {
                    const modelsRes = await fetch('/api/models', { cache: 'no-store' });
                    if (modelsRes.ok) {
                        const modelsData = await modelsRes.json();
                        if (modelsData && modelsData.data) {
                            const mapped = (modelsData.data as ModelApiItem[]).map((m) => ({
                                id: m.id,
                                name: m.name || m.id.split('/').pop()?.split('\\').pop() || m.id,
                                description: m.description || `Local model active on LM Studio`,
                                badge: m.badge || 'LM Studio'
                            }));
                            setModels(mapped);
                            const active = mapped.find((item) => item.id === targetId && item.badge === 'Active');
                            if (active) return true;
                        }
                    }

                    await new Promise((resolve) => setTimeout(resolve, intervalMs));
                }

                return false;
            };

            try {
                const res = await fetch('/api/models', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ model: modelId }),
                });

                if (!res.ok && res.status !== 202) {
                    throw new Error('Failed to load model on LM Studio');
                }

                const isActive = await waitForModelActive(modelId);
                if (!isActive) {
                    alert(`Model ${targetModel.name} is still loading in LM Studio. It may take longer to finish.`);
                }
            } catch (err) {
                console.error('Error triggering model load in LM Studio:', err);
                alert(`Error loading model ${targetModel.name}. Please ensure your local LM Studio server is running on port 1234.`);
            } finally {
                setIsLoadingModel(false);
                setLoadingModelName("");
            }
        }
    };

    const [nowTime, setNowTime] = useState(() => new Date());

    // Get time-of-day greeting (Morning / Afternoon / Evening)
    const getGreetingText = () => {
        const hour = nowTime.getHours();
        if (hour >= 5 && hour < 12) return 'Morning';
        if (hour >= 12 && hour < 18) return 'Afternoon';
        return 'Evening';
    };

    // Precomposed Unicode Trần (immune to NFD separation bugs)
    const getGreetingTitle = () => {
        return `${getGreetingText()}, Tr\u1ea7n`.normalize("NFC");
    };

    const formatCurrentTime = () => {
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; 
        const minutesStr = minutes < 10 ? '0' + minutes : minutes;
        return `${hours}:${minutesStr} ${ampm}`;
    };

    useEffect(() => {
        const intervalId = setInterval(() => {
            setNowTime(new Date());
        }, 60000);

        return () => clearInterval(intervalId);
    }, []);

    const handleNewChat = () => {
        const newSessionId = `session-${Date.now()}`;
        const newSession: ChatSession = {
            id: newSessionId,
            title: 'New chat',
            timestamp: Date.now(),
            dateCategory: 'Today',
            messages: []
        };
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSessionId);
        setIsChatsViewActive(false);
    };

    const handleSendMessage = async (
        data: {
            message: string;
            files: AttachedFile[];
            pastedContent: PastedSnippet[];
            model: string;
            isThinkingEnabled: boolean;
        },
        customHistory?: Message[],
        targetAssistantIndex?: number
    ) => {
        if (targetAssistantIndex === undefined && !data.message.trim() && data.files.length === 0 && data.pastedContent.length === 0) return;

        let fullUserText = data.message;
        if (data.files.length > 0) {
            fullUserText += `\n\n*(Uploaded ${data.files.length} file(s): ${data.files.map(f => f.file.name).join(', ')})*`;
        }
        if (data.pastedContent.length > 0) {
            fullUserText += `\n\n*(Attached ${data.pastedContent.length} pasted text snippet(s))*`;
        }

        const timeStr = formatCurrentTime();
        const baseHistory = customHistory || messages;
        
        const newMessages: Message[] = [
            ...baseHistory,
            { role: 'user', content: fullUserText, timestamp: timeStr }
        ];

        // If targetAssistantIndex is provided, we use the session history up to targetAssistantIndex
        const promptMessages = targetAssistantIndex !== undefined
            ? [...messages.slice(0, targetAssistantIndex)]
            : [...newMessages];

        if (targetAssistantIndex === undefined) {
            // Auto update session title if it's currently a new chat
            const updatedTitle = activeSession.title === 'New chat' 
                ? (data.message.length > 30 ? data.message.slice(0, 30) + '...' : data.message)
                : activeSession.title;

            setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                    return {
                        ...s,
                        title: updatedTitle,
                        messages: newMessages
                    };
                }
                return s;
            }));
        }

        // Detect latest user message language to enforce thoughts and response matching language
        const latestUserMsg = promptMessages[promptMessages.length - 1];
        const userContent = latestUserMsg ? latestUserMsg.content : '';
        const isVietnamese = isLikelyVietnamese(userContent);
        const detectLang = isVietnamese ? "Vietnamese" : "the same language as the user's latest query";
        const systemPromptBase = (systemPromptTemplate || DEFAULT_SYSTEM_PROMPT_TEMPLATE)
            .replaceAll('{{language}}', isVietnamese ? 'Vietnamese' : 'same as query')
            .replaceAll('{{detectLang}}', detectLang);
        const systemPrompt = data.isThinkingEnabled
            ? systemPromptBase
            : `${systemPromptBase}\n\nIMPORTANT:\n* Do not include hidden reasoning or <think> blocks. Respond directly with the final answer.`;

        setIsGenerating(true);

        try {
            if (data.isThinkingEnabled) {
                promptMessages.unshift({
                    role: 'system',
                    content: systemPrompt + `\n3. START with a deep, step-by-step reasoning thought process block enclosed exactly between <think> and </think> tags. The thought process MUST be strictly in ${detectLang}.`
                });
            } else {
                promptMessages.unshift({
                    role: 'system',
                    content: systemPrompt
                });
            }

            abortControllerRef.current = new AbortController();

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: data.model,
                    messages: promptMessages.map(m => ({ role: m.role, content: m.content })),
                    stream: true
                }),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) {
                throw new Error('Failed to fetch completion from LM Studio');
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) throw new Error('No stream reader available');

            const assistantMsgIndex = targetAssistantIndex !== undefined ? targetAssistantIndex : newMessages.length;
            
            // Pre-create or update active assistant bubble
            setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                    const updatedMsgList = [...s.messages];
                    if (targetAssistantIndex !== undefined) {
                        const existingMsg = updatedMsgList[targetAssistantIndex];
                        const currentVersions = existingMsg.versions || [existingMsg.content];
                        const newVersions = [...currentVersions, ''];
                        updatedMsgList[targetAssistantIndex] = {
                            ...existingMsg,
                            versions: newVersions,
                            activeVersion: newVersions.length - 1,
                            content: ''
                        };
                    } else {
                        updatedMsgList.push({
                            role: 'assistant',
                            content: '',
                            versions: [''],
                            activeVersion: 0
                        });
                    }
                    return {
                        ...s,
                        messages: updatedMsgList
                    };
                }
                return s;
            }));

            setShowThoughts(prev => ({ ...prev, [assistantMsgIndex]: false }));
            
            streamResponseRef.current = '';
            streamReasoningRef.current = '';

            const extractFinalAnswer = (text: string) => {
                const match = text.match(/(?:final\s*answer|final|answer)\s*[:\-]\s*([\s\S]*)/i);
                return match ? match[1].trim() : text.trim();
            };

            const buildCombinedStreamText = () => {
                const accumulatedResponse = streamResponseRef.current;
                const accumulatedReasoning = streamReasoningRef.current;

                if (!data.isThinkingEnabled) {
                    if (accumulatedResponse.length > 0) return accumulatedResponse;
                    if (!accumulatedReasoning) return '';
                    return extractFinalAnswer(accumulatedReasoning);
                }

                if (!accumulatedReasoning) return accumulatedResponse;
                if (accumulatedResponse.length === 0) return `<think>${accumulatedReasoning}`;

                const cleanResponse = accumulatedResponse.replace(/<\/?think>/gi, '').trimStart();
                return `<think>${accumulatedReasoning}</think>\n${cleanResponse}`;
            };

            const flushAssistantMessage = () => {
                if (streamFlushTimerRef.current) {
                    clearTimeout(streamFlushTimerRef.current);
                    streamFlushTimerRef.current = null;
                }

                const combinedText = buildCombinedStreamText();
                setSessions(prev => prev.map(s => {
                    if (s.id === activeSessionId) {
                        const updatedMsgList = [...s.messages];
                        if (updatedMsgList.length > assistantMsgIndex && updatedMsgList[assistantMsgIndex].role === 'assistant') {
                            const existingMsg = updatedMsgList[assistantMsgIndex];
                            const currentVersions = existingMsg.versions || [''];
                            const activeVer = existingMsg.activeVersion ?? 0;
                            const updatedVersions = [...currentVersions];
                            updatedVersions[activeVer] = combinedText;

                            updatedMsgList[assistantMsgIndex] = {
                                ...existingMsg,
                                content: combinedText,
                                versions: updatedVersions,
                                activeVersion: activeVer
                            };
                        }
                        return {
                            ...s,
                            messages: updatedMsgList
                        };
                    }
                    return s;
                }));
            };

            const scheduleAssistantFlush = () => {
                if (streamFlushTimerRef.current) return;
                streamFlushTimerRef.current = setTimeout(flushAssistantMessage, 50);
            };

            let sseBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });
                const lines = sseBuffer.split('\n');
                sseBuffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;

                    if (trimmedLine.startsWith('data: ')) {
                        const dataStr = trimmedLine.slice(6).trim();
                        if (dataStr === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(dataStr);
                            const delta = parsed.choices?.[0]?.delta;
                            const content = delta?.content || '';
                            const reasoning = delta?.reasoning_content || '';

                            const safeContent = data.isThinkingEnabled
                                ? content
                                : content.replace(/<\/?think>/gi, '');

                            streamResponseRef.current += removeUnrequestedEmoji(safeContent);
                            streamReasoningRef.current += removeUnrequestedEmoji(reasoning);
                            scheduleAssistantFlush();
                        } catch (e) {
                            console.warn('SSE parse error - incomplete chunk:', dataStr, e);
                        }
                    }
                }
            }

            sseBuffer += decoder.decode();
            if (sseBuffer.trim()) {
                const trimmedLine = sseBuffer.trim();
                if (trimmedLine.startsWith('data: ')) {
                    const dataStr = trimmedLine.slice(6).trim();
                    if (dataStr !== '[DONE]') {
                        try {
                            const parsed = JSON.parse(dataStr);
                            const delta = parsed.choices?.[0]?.delta;
                            const content = delta?.content || '';
                            const reasoning = delta?.reasoning_content || '';
                            const safeContent = data.isThinkingEnabled
                                ? content
                                : content.replace(/<\/?think>/gi, '');
                            streamResponseRef.current += removeUnrequestedEmoji(safeContent);
                            streamReasoningRef.current += removeUnrequestedEmoji(reasoning);
                        } catch {
                            // Ignore trailing incomplete data
                        }
                    }
                }
            }
            flushAssistantMessage();
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('Generation aborted by user');
                return;
            }
            console.error('Error contacting local model server:', error);
            const fallbackText = isConnected
                ? `Error communicating with the loaded model. Please verify that your local LM Studio server has the model fully loaded and listening on port 1234.`
                : `*(LM Studio Offline)* Hello Trần! You sent: "${targetAssistantIndex !== undefined ? messages[targetAssistantIndex - 1].content : data.message}". I'm currently running in mock mode because your local LM Studio server is offline. Load a model in LM Studio, toggle the server on, and I'll talk to your local LLM in real time.`;
            
            setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                    const updatedMsgList = [...s.messages];
                    if (targetAssistantIndex !== undefined) {
                        const existingMsg = updatedMsgList[targetAssistantIndex];
                        const currentVersions = existingMsg.versions || [''];
                        const activeVer = existingMsg.activeVersion ?? 0;
                        const updatedVersions = [...currentVersions];
                        updatedVersions[activeVer] = fallbackText;
                        updatedMsgList[targetAssistantIndex] = {
                            ...existingMsg,
                            content: fallbackText,
                            versions: updatedVersions,
                            activeVersion: activeVer
                        };
                    } else {
                        updatedMsgList.push({
                            role: 'assistant',
                            content: fallbackText,
                            versions: [fallbackText],
                            activeVersion: 0
                        });
                    }
                    return {
                        ...s,
                        messages: updatedMsgList
                    };
                }
                return s;
            }));
        } finally {
            if (streamFlushTimerRef.current) {
                clearTimeout(streamFlushTimerRef.current);
                streamFlushTimerRef.current = null;
            }
            setIsGenerating(false);
            abortControllerRef.current = null;
        }
    };

    const handleStopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsGenerating(false);
    };

    const handleCopy = (text: string, index?: number) => {
        navigator.clipboard.writeText(text);
        if (index !== undefined) {
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        }
    };

    const handleRetry = (index: number) => {
        let userMsgIndex = -1;
        for (let i = index; i >= 0; i--) {
            if (messages[i].role === 'user') {
                userMsgIndex = i;
                break;
            }
        }
        if (userMsgIndex === -1) return;

        const userMsg = messages[userMsgIndex];
        const truncatedHistory = messages.slice(0, userMsgIndex);
        
        handleSendMessage({
            message: userMsg.content,
            files: [],
            pastedContent: [],
            model: selectedModel,
            isThinkingEnabled: isThinkingEnabled
        }, truncatedHistory);
    };

    const handleSwitchVersion = (messageIndex: number, versionIndex: number) => {
        setSessions(prev => prev.map(s => {
            if (s.id === activeSessionId) {
                const updatedMessages = [...s.messages];
                const msg = updatedMessages[messageIndex];
                if (msg && msg.role === 'assistant' && msg.versions && versionIndex >= 0 && versionIndex < msg.versions.length) {
                    updatedMessages[messageIndex] = {
                        ...msg,
                        activeVersion: versionIndex,
                        content: msg.versions[versionIndex]
                    };
                }
                return { ...s, messages: updatedMessages };
            }
            return s;
        }));
    };

    const handleRegenerateVersion = (messageIndex: number) => {
        let userMsgIndex = -1;
        for (let i = messageIndex - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                userMsgIndex = i;
                break;
            }
        }
        if (userMsgIndex === -1) return;

        const userMsg = messages[userMsgIndex];
        
        handleSendMessage({
            message: userMsg.content,
            files: [],
            pastedContent: [],
            model: selectedModel,
            isThinkingEnabled: isThinkingEnabled
        }, undefined, messageIndex);
    };

    const handleStartEdit = (index: number, content: string) => {
        setEditingIndex(index);
        setEditingText(content);
    };

    const handleSaveEdit = (index: number) => {
        if (!editingText.trim()) return;

        const truncatedHistory = messages.slice(0, index);
        setEditingIndex(null);

        handleSendMessage({
            message: editingText,
            files: [],
            pastedContent: [],
            model: selectedModel,
            isThinkingEnabled: isThinkingEnabled
        }, truncatedHistory);
    };

    const formatVietnameseText = (text: string) => {
        if (!text) return "";
        return removeUnrequestedEmoji(text.normalize("NFC"));
    };

    const parseThinkingContent = (content: string) => {
        if (!content) return { thoughts: "", response: "", isThinking: false };
        
        let thoughts = "";
        let response = content;
        
        // Find all <think> ... </think> blocks
        const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
        const matches = [...content.matchAll(thinkRegex)];
        
        if (matches.length > 0) {
            // Combine all complete thought processes
            thoughts = matches.map(m => m[1].trim()).join("\n\n");
            // Remove the <think>...</think> blocks from response
            response = content.replace(thinkRegex, "").trim();
        }
        
        // Check for any unclosed <think> block at the very end (streaming)
        const lastThinkStart = response.lastIndexOf("<think>");
        const lastThinkEnd = response.lastIndexOf("</think>");
        
        if (lastThinkStart !== -1 && (lastThinkEnd === -1 || lastThinkStart > lastThinkEnd)) {
            // There is an unclosed <think> block at the end
            const unclosedThoughts = response.slice(lastThinkStart + 7).trim();
            thoughts = thoughts ? `${thoughts}\n\n${unclosedThoughts}` : unclosedThoughts;
            response = response.slice(0, lastThinkStart).trim();
            return { thoughts, response, isThinking: true };
        }
        
        // Also strip any leftover raw tags just in case
        response = response.replace(/<\/think>/gi, "").trim();
        response = response.replace(/<think>/gi, "").trim();
        
        return { thoughts, response, isThinking: false };
    };

    const toggleThoughts = (index: number) => {
        setShowThoughts(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const getMessageLocale = (index: number) => {
        for (let i = index - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                return isLikelyVietnamese(messages[i].content) ? 'vi' : 'default';
            }
        }
        return 'default';
    };

    // Filter sessions based on search query
    const filteredSessions = sessions.filter(s => 
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="flex h-screen w-full bg-[#1e1e1e] overflow-hidden text-zinc-100 relative select-none">
            
            {/* 1. App Sidebar */}
            <div className={`
                ${isSidebarOpen ? 'w-64' : 'w-16'} 
                bg-[#171717] border-r border-[#2c2c2b] flex flex-col h-full shrink-0 relative transition-[width] duration-300 ease-[var(--ease-silk)] overflow-hidden z-30
            `}>
                <div className="w-64 flex flex-col h-full">
                {isSidebarOpen ? (
                    /* Expanded Sidebar Panel */
                    <>
                        <div className="h-14 px-3.5 flex items-center justify-between">
                            <div className="flex items-center gap-2 pl-1 shrink-0">
                                <span className="font-japanese-logo whitespace-nowrap text-[20px] font-normal text-zinc-100 leading-none">{APP_NAME}</span>
                            </div>
                            <button 
                                onClick={() => setIsSidebarOpen(false)}
                                className="w-9 h-9 flex items-center justify-center hover:bg-white/5 rounded-xl text-zinc-400 hover:text-white transition-colors shrink-0"
                                title="Collapse sidebar"
                            >
                                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect width="18" height="18" x="3" y="3" rx="2" />
                                    <path d="M9 3v18" />
                                </svg>
                            </button>
                        </div>

                        {/* Left Sidebar wide buttons */}
                        <div className="px-2.5 space-y-1">
                            <button 
                                onClick={handleNewChat}
                                className="w-full h-9 flex items-center gap-2.5 px-3.5 hover:bg-white/5 rounded-xl text-[13.5px] font-medium text-zinc-300 hover:text-white transition-colors text-left whitespace-nowrap overflow-hidden"
                            >
                                <Plus className="w-[18px] h-[18px] shrink-0 text-zinc-400" />
                                <span className="min-w-0 truncate">New chat</span>
                            </button>
                            <button 
                                onClick={() => {
                                    setIsSearchOpen(true);
                                    setSearchQuery('');
                                }}
                                className="w-full h-9 flex items-center gap-2.5 px-3.5 hover:bg-white/5 rounded-xl text-[13.5px] font-medium text-zinc-300 hover:text-white transition-colors text-left whitespace-nowrap overflow-hidden"
                            >
                                <Search className="w-[18px] h-[18px] shrink-0 text-zinc-400" />
                                <span className="min-w-0 truncate">Search</span>
                            </button>
                            <button 
                                onClick={() => setIsChatsViewActive(true)}
                                className={`w-full h-9 flex items-center gap-2.5 px-3.5 hover:bg-white/5 rounded-xl text-[13.5px] font-medium transition-colors text-left whitespace-nowrap overflow-hidden ${isChatsViewActive ? 'bg-white/5 text-white font-medium' : 'text-zinc-300 hover:text-white'}`}
                            >
                                <ChatIcon className="w-[18px] h-[18px] shrink-0 text-zinc-400" />
                                <span className="min-w-0 truncate">Chats</span>
                            </button>
                        </div>

                        {/* Recents Scrollable List */}
                        <div className="flex-1 overflow-y-auto no-scrollbar px-2.5 mt-4">
                            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-3.5 mb-2.5 select-none">Recents</p>
                            <div className="space-y-0.5 pb-6">
                                {sessions.map(s => {
                                    const isActive = s.id === activeSessionId;
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => {
                                                setActiveSessionId(s.id);
                                                setIsChatsViewActive(false);
                                            }}
                                            className={`
                                                w-full text-left px-3.5 py-2 rounded-xl text-[13.5px] truncate transition-colors block whitespace-nowrap overflow-hidden
                                                ${isActive 
                                                    ? 'bg-white/5 text-white font-medium' 
                                                    : 'text-zinc-300 hover:text-white hover:bg-white/5'}
                                            `}
                                            title={s.title}
                                        >
                                            <span className="min-w-0 truncate">{s.title}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Profile Footer Panel */}
                        <div className="p-3 border-t border-[#2c2c2b] bg-[#141414] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                                <div className="w-8 h-8 rounded-full bg-[#1b1b1b] border border-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-sm shrink-0 select-none">
                                    N
                                </div>
                                <div className="flex flex-col truncate min-w-0">
                                    <span className="text-[13.5px] font-semibold text-white truncate leading-tight">Trần</span>
                                    <span className="text-[11px] text-zinc-500 leading-tight">Free plan</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-zinc-400 shrink-0">
                                <button className="p-1 hover:text-white rounded transition-colors" title="Download app">
                                    <Download className="w-4 h-4" />
                                </button>
                                <div className="flex flex-col text-[8px] leading-none shrink-0 opacity-70">
                                    <span>▲</span>
                                    <span>▼</span>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    /* Narrow Sidebar - matching Screenshot 3 exactly */
                    <div className="flex flex-col items-start justify-between h-full w-full pl-3.5">
                        {/* Top: Toggle Icon */}
                        <div className="flex flex-col items-start w-full">
                            <button 
                                onClick={() => setIsSidebarOpen(true)}
                                className="w-9 h-9 mt-2.5 flex items-center justify-center hover:bg-white/5 rounded-xl text-zinc-400 hover:text-white transition-colors shrink-0"
                                title="Expand sidebar"
                            >
                                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect width="18" height="18" x="3" y="3" rx="2" />
                                    <path d="M9 3v18" />
                                </svg>
                            </button>

                            {/* Middle Icons vertically stacked */}
                            <div className="flex flex-col items-start gap-1 mt-[9px]">
                                <button 
                                    onClick={handleNewChat}
                                    className="w-9 h-9 hover:bg-white/5 rounded-xl text-zinc-300 hover:text-white transition-all flex items-center justify-center cursor-pointer shrink-0"
                                    title="New chat"
                                >
                                    <Plus className="w-[18px] h-[18px]" />
                                </button>
                                <button 
                                    onClick={() => {
                                        setIsSearchOpen(true);
                                        setSearchQuery('');
                                    }}
                                    className="w-9 h-9 hover:bg-white/5 rounded-xl text-zinc-400 hover:text-white transition-colors flex items-center justify-center shrink-0"
                                    title="Search"
                                >
                                    <Search className="w-[18px] h-[18px]" />
                                </button>
                                <button
                                    onClick={() => setIsChatsViewActive(true)}
                                    className={`w-9 h-9 rounded-xl transition-colors flex items-center justify-center shrink-0 ${isChatsViewActive ? 'bg-white/5 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
                                    title="Chats"
                                >
                                    <ChatIcon className="w-[18px] h-[18px]" />
                                </button>
                            </div>
                        </div>

                        {/* Bottom Icons stacked */}
                        <div className="flex flex-col items-start gap-3 py-3">
                            <button className="w-9 h-9 hover:bg-white/5 rounded-xl text-zinc-400 hover:text-white transition-colors flex items-center justify-center shrink-0" title="Download app">
                                <Download className="w-4 h-4" />
                            </button>
                            <div className="w-8 h-8 rounded-full bg-[#E5E2D9] text-[#1E1E1E] flex items-center justify-center font-bold text-[13px] select-none shadow-sm cursor-pointer hover:bg-[#d9d5cb] transition-colors shrink-0">
                                T
                            </div>
                        </div>
                    </div>
                )}
                </div>
            </div>

            {/* 2. Main Chat Workspace */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative select-text">
                

                {/* Main scrollable body */}
                <div className="flex-1 w-full flex flex-col justify-between relative select-text pb-36 h-full overflow-hidden">
                    
                    {isChatsViewActive ? (
                        /* Chats Manager Page */
                        <div className="flex-1 w-full max-w-4xl mx-auto py-10 px-6 overflow-y-auto no-scrollbar h-full">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6">
                                <h1 className="text-2xl font-semibold text-zinc-100">Chats</h1>
                                <div className="flex items-center gap-3">
                                    {isSelectMode ? (
                                        <div className="flex items-center gap-2 select-none">
                                            <span className="text-[13px] text-zinc-400 font-medium mr-1.5">
                                                {selectedSessionIds.size} selected
                                            </span>
                                            <button
                                                onClick={handleSelectAllChats}
                                                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#2c2b2a] border border-[#3c3c3b] hover:bg-[#3d3c3b] rounded-lg transition-all cursor-pointer"
                                            >
                                                Select all
                                            </button>
                                            <button
                                                onClick={handleDeleteSelectedChats}
                                                disabled={selectedSessionIds.size === 0}
                                                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#2c2b2a] border border-[#3c3c3b] hover:bg-red-600 hover:border-red-600 disabled:opacity-40 disabled:hover:bg-[#2c2b2a] disabled:hover:border-[#3c3c3b] rounded-lg transition-all cursor-pointer"
                                            >
                                                Delete
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setIsSelectMode(false);
                                                    setSelectedSessionIds(new Set());
                                                }}
                                                className="px-3.5 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => setIsSelectMode(true)}
                                                className="px-3.5 py-1.5 text-xs text-white border border-[#3c3c3b] hover:bg-white/5 rounded-lg font-medium transition-colors"
                                            >
                                                Select chats
                                            </button>
                                            <button
                                                onClick={() => {
                                                    handleNewChat();
                                                    setIsChatsViewActive(false);
                                                }}
                                                className="px-3.5 py-1.5 text-xs text-[#1f1e1d] bg-[#eaeaea] hover:bg-white rounded-lg font-semibold transition-colors"
                                            >
                                                New chat
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Inner Search Box */}
                            <div className="w-full bg-[#222222] border border-[#2f2f2e] rounded-xl flex items-center px-3.5 py-2 mb-6">
                                <Search className="w-4.5 h-4.5 text-zinc-500 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Search chats..."
                                    className="w-full bg-transparent border-none outline-none text-white placeholder:text-zinc-500 text-sm ml-2.5 py-0.5 focus:ring-0"
                                    value={chatsSearchQuery}
                                    onChange={(e) => setChatsSearchQuery(e.target.value)}
                                />
                                {chatsSearchQuery && (
                                    <button
                                        onClick={() => setChatsSearchQuery('')}
                                        className="p-1 hover:bg-white/5 rounded text-zinc-400 hover:text-white transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Chats List */}
                            <div className="flex flex-col gap-2 mt-4">
                                {filteredChatsForManager.length > 0 ? (
                                    filteredChatsForManager.map((session) => {
                                        const isSelected = selectedSessionIds.has(session.id);
                                        const isMenuOpen = activeMenuSessionId === session.id;

                                        return (
                                            <div
                                                key={session.id}
                                                onClick={() => handleChatRowClick(session.id)}
                                                className={`group relative flex items-center justify-between py-3 px-4 rounded-xl transition-all cursor-pointer border ${
                                                    isSelected 
                                                        ? 'bg-[#2c2b2a] border-[#3c3c3b]' 
                                                        : 'bg-transparent border-transparent hover:bg-[#2c2b2a] hover:border-[#2f2f2e]'
                                                }`}
                                            >
                                                <div className="flex-1 flex items-center gap-3 overflow-hidden">
                                                    {isSelectMode && (
                                                        <div 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleChatRowClick(session.id);
                                                            }}
                                                            className={`w-4.5 h-4.5 rounded-[5px] flex items-center justify-center transition-all shrink-0 select-none cursor-pointer ${
                                                                isSelected 
                                                                    ? 'bg-zinc-200 border border-zinc-200 text-zinc-900' 
                                                                    : 'bg-[#222222] border border-[#3c3c3b] hover:border-[#525251]'
                                                            }`}
                                                        >
                                                            {isSelected && (
                                                                <Check className="w-3 h-3 text-zinc-900 stroke-[3.5]" />
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col overflow-hidden max-w-[85%]">
                                                        <span className="text-[14px] font-semibold text-zinc-100 truncate group-hover:text-white">
                                                            {session.title}
                                                        </span>
                                                        <span className="text-[11px] text-zinc-500 mt-0.5 select-none">
                                                            {formatSessionTime(session.timestamp)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Hover Options Button / Three-dots Menu */}
                                                {!isSelectMode && (
                                                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveMenuSessionId(isMenuOpen ? null : session.id);
                                                            }}
                                                            className={`p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 ${
                                                                isMenuOpen 
                                                                    ? 'bg-white/10 text-white opacity-100' 
                                                                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#353433]'
                                                            }`}
                                                            title="Chat options"
                                                        >
                                                            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                                <circle cx="12" cy="12" r="1.2" />
                                                                <circle cx="12" cy="5" r="1.2" />
                                                                <circle cx="12" cy="19" r="1.2" />
                                                            </svg>
                                                        </button>

                                                        {/* Dropdown Menu (only Select, Rename, and Delete matching user preferences) */}
                                                        {isMenuOpen && (
                                                            <>
                                                                <div 
                                                                    className="fixed inset-0 z-40" 
                                                                    onClick={() => setActiveMenuSessionId(null)}
                                                                />
                                                                <div className="absolute right-0 mt-1.5 w-[140px] bg-[#222222] border border-[#2f2f2e] rounded-xl shadow-xl z-50 p-1 flex flex-col gap-0.5 overflow-hidden select-none">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setIsSelectMode(true);
                                                                            setSelectedSessionIds(new Set([session.id]));
                                                                            setActiveMenuSessionId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                                    >
                                                                        <Check className="w-[14px] h-[14px] text-zinc-400" />
                                                                        Select
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleRenameChat(session.id, session.title);
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                                    >
                                                                        <Pencil className="w-[14px] h-[14px] text-zinc-400" />
                                                                        Rename
                                                                    </button>
                                                                    
                                                                    <div className="border-t border-[#2c2c2b] my-0.5" />
                                                                    
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDeleteChat(session.id);
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-xs font-semibold text-red-400 hover:text-white hover:bg-[#ca3a31] rounded-lg transition-colors"
                                                                    >
                                                                        <svg className="w-[14px] h-[14px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                            <polyline points="3 6 5 6 21 6" />
                                                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                                        </svg>
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                     </div>
                                                 )}
                                             </div>
                                         );
                                     })
                                 ) : (
                                     <div className="text-center py-12 text-sm text-zinc-500 italic select-none">
                                         No chats found
                                     </div>
                                 )}
                            </div>
                        </div>
                    ) : messages.length === 0 ? (
                        /* Empty State Home Screen - matching Screenshot 1 */
                        <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto px-4 w-full animate-fade-in select-none">
                            <div className="flex items-center justify-center gap-3.5 mb-8">
                                <svg viewBox="0 0 200 200" className="w-[38px] h-[38px] text-[#D46B4F]" xmlns="http://www.w3.org/2000/svg" role="presentation">
                                    <defs>
                                        <ellipse id="petal-pair" cx="100" cy="100" rx="90" ry="22" />
                                    </defs>
                                    <g fill="currentColor" fillRule="evenodd">
                                        <use href="#petal-pair" transform="rotate(0 100 100)" />
                                        <use href="#petal-pair" transform="rotate(45 100 100)" />
                                        <use href="#petal-pair" transform="rotate(90 100 100)" />
                                        <use href="#petal-pair" transform="rotate(135 100 100)" />
                                    </g>
                                </svg>
                                <h1 className="text-[34px] font-sans font-light text-zinc-100 tracking-tight leading-tight mt-1">
                                    {getGreetingTitle()}
                                </h1>
                            </div>
                            
                            {/* Chat input centered inside landing zone */}
                            <div className="w-full relative">
                                {isLoadingModel && (
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-4 bg-[#D46B4F]/90 border border-[#D46B4F]/50 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 z-50 text-[13px] font-semibold text-white animate-pulse">
                                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                                        <span>Loading {loadingModelName} in LM Studio...</span>
                                    </div>
                                )}
                                <ClaudeChatInput
                                    onSendMessage={handleSendMessage}
                                    models={models}
                                    selectedModel={selectedModel}
                                    onSelectModel={handleSelectModel}
                                    isThinkingEnabled={isThinkingEnabled}
                                    onToggleThinking={() => setIsThinkingEnabled(!isThinkingEnabled)}
                                    isLoadingModel={isLoadingModel}
                                    loadingModelName={loadingModelName}
                                    isGenerating={isGenerating}
                                    onStopGeneration={handleStopGeneration}
                                />
                            </div>
                        </div>
                    ) : (
                        /* Standard conversation bubble view */
                        <div className="flex flex-col w-full max-w-3xl mx-auto py-10 px-4 md:px-0 overflow-y-auto no-scrollbar h-full max-h-[85vh] pr-1">
                            {messages.map((msg, index) => {
                                if (msg.role === 'user') {
                                    const isEditing = editingIndex === index;
                                    const normalizedContent = formatVietnameseText(msg.content);

                                    return (
                                        <div key={index} className="flex flex-col items-end w-full animate-fade-in mb-8">
                                            {isEditing ? (
                                                /* Inline Edit Container */
                                                <div className="w-full flex flex-col bg-[#1e1e1e] border border-[#2f2f2e] rounded-xl p-3.5 animate-fade-in">
                                                    <textarea
                                                        ref={editAreaRef}
                                                        value={editingText}
                                                        onChange={(e) => setEditingText(e.target.value)}
                                                        className="w-full bg-[#222222] border border-[#3c3c3b] focus:border-[#d46b4f] focus:ring-1 focus:ring-[#d46b4f] outline-none text-[#ececec] rounded-xl p-3 text-sm resize-none overflow-hidden min-h-[50px] leading-relaxed font-sans"
                                                        spellCheck="false"
                                                        rows={1}
                                                        autoFocus
                                                    />
                                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mt-3">
                                                        <div className="flex items-center gap-1.5 text-[11px] text-[#7f7f7f] max-w-[65%] leading-relaxed select-none">
                                                            <span className="shrink-0 text-[#d46b4f]">ⓘ</span>
                                                            <span>Editing this message will create a new conversation branch.</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 self-end shrink-0 select-none">
                                                            <button
                                                                onClick={() => setEditingIndex(null)}
                                                                className="px-3.5 py-1.5 text-xs text-white border border-[#3c3c3b] hover:bg-white/5 rounded-lg font-medium transition-colors"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={() => handleSaveEdit(index)}
                                                                className="px-4 py-1.5 text-xs text-[#1f1e1d] bg-[#eaeaea] hover:bg-white rounded-lg font-semibold transition-colors"
                                                            >
                                                                Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* User Bubble - Capsule style */}
                                                    <div className="bg-[#2a2a29] border-none text-[#ececec] rounded-2xl px-4 py-2 text-[15px] font-normal max-w-[85%] font-sans shadow-sm select-text">
                                                        {normalizedContent}
                                                    </div>
                                                    
                                                    {/* User Actions */}
                                                    <div className="flex items-center gap-2.5 mt-2 text-[#7f7f7f] select-none text-[11px]">
                                                        <span className="font-sans mr-0.5">{msg.timestamp || 'Today'}</span>
                                                        <button
                                                            onClick={() => handleRetry(index)}
                                                            className="hover:text-[#ececec] transition-colors" 
                                                            title="Regenerate from here"
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleStartEdit(index, msg.content)}
                                                            className="hover:text-[#ececec] transition-colors" 
                                                            title="Edit prompt"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleCopy(msg.content, index)}
                                                            className="hover:text-[#ececec] transition-colors flex items-center gap-0.5" 
                                                            title="Copy"
                                                        >
                                                            {copiedIndex === index ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                } else {
                                    const versions = msg.versions || [msg.content];
                                    const activeVer = msg.activeVersion ?? 0;
                                    const activeContent = versions[activeVer] || msg.content;

                                    const parsed = parseThinkingContent(activeContent);
                                    const normalizedResponse = formatVietnameseText(parsed.response);
                                    const normalizedThoughts = formatVietnameseText(parsed.thoughts);
                                    
                                    const thoughtsVisible = showThoughts[index] ?? false;
                                    const messageLocale = getMessageLocale(index);
                                    const thinkingLabel = messageLocale === 'vi' ? 'Đang suy nghĩ...' : 'Thinking...';
                                    const thoughtProcessLabel = messageLocale === 'vi' ? 'Quá trình suy nghĩ' : 'Thought Process';

                                    return (
                                        <div key={index} className="flex flex-col items-start w-full animate-fade-in mb-8">
                                            
                                            {/* Accordion folding thought process block */}
                                            {normalizedThoughts && (
                                                <div className="w-full max-w-[95%] bg-white/5 border border-white/5 rounded-xl p-3.5 mb-3.5 animate-fade-in">
                                                    <div 
                                                        onClick={() => toggleThoughts(index)}
                                                        className="flex items-center justify-between text-zinc-400 select-none text-[12px] font-medium cursor-pointer hover:text-zinc-200 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            {parsed.isThinking ? (
                                                                <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                                                            ) : (
                                                                <Sparkles className="w-3.5 h-3.5 text-[#D46B4F]" />
                                                            )}
                                                            <span>
                                                                {parsed.isThinking ? thinkingLabel : thoughtProcessLabel}
                                                            </span>
                                                        </div>
                                                        {thoughtsVisible ? (
                                                            <ChevronUp className="w-3.5 h-3.5 opacity-75" />
                                                        ) : (
                                                            <ChevronDown className="w-3.5 h-3.5 opacity-75" />
                                                        )}
                                                    </div>
                                                    {thoughtsVisible && (
                                                        <div className="text-[13px] text-zinc-400 leading-relaxed whitespace-pre-wrap mt-2.5 pt-2.5 border-t border-white/5 font-sans not-italic">
                                                            {normalizedThoughts}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Assistant response with rich custom Markdown Rendering */}
                                            {normalizedResponse && (
                                                <div className="max-w-[95%] pl-1 w-full">
                                                    <MarkdownRenderer text={normalizedResponse} />
                                                </div>
                                            )}
                                            
                                            {/* Assistant Actions & Version Pagination Dashboard */}
                                            <div className="flex items-center gap-2 mt-3.5 mb-5 select-none pl-1">
                                                {/* Copy & Regenerate Actions */}
                                                <div className="flex items-center gap-3 text-[#7f7f7f]">
                                                    <button 
                                                        onClick={() => handleCopy(parsed.response, index)}
                                                        className="hover:text-[#ececec] transition-colors flex items-center gap-0.5" 
                                                        title="Copy"
                                                    >
                                                        {copiedIndex === index ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </button>
                                                    
                                                    <button 
                                                        onClick={() => handleRegenerateVersion(index)}
                                                        className="hover:text-[#ececec] transition-colors" 
                                                        title="Regenerate new draft"
                                                    >
                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>

                                                {/* Version Pagination Control (only show if multiple drafts exist) */}
                                                {versions && versions.length > 1 && (
                                                    <div className="flex items-center gap-1 bg-[#252524] border border-[#3c3c3b] rounded-lg px-2 py-0.5 text-xs text-zinc-400 font-sans ml-1">
                                                        <button
                                                            onClick={() => handleSwitchVersion(index, activeVer - 1)}
                                                            disabled={activeVer === 0}
                                                            className="hover:text-white disabled:opacity-30 disabled:pointer-events-none p-1 transition-colors flex items-center justify-center"
                                                            title="Previous version"
                                                        >
                                                            <ChevronLeft className="w-3 h-3" />
                                                        </button>
                                                        <span className="px-1 text-[11px] font-medium tracking-tight select-none">
                                                            {activeVer + 1}/{versions.length}
                                                        </span>
                                                        <button
                                                            onClick={() => handleSwitchVersion(index, activeVer + 1)}
                                                            disabled={activeVer === versions.length - 1}
                                                            className="hover:text-white disabled:opacity-30 disabled:pointer-events-none p-1 transition-colors flex items-center justify-center"
                                                            title="Next version"
                                                        >
                                                            <ChevronRight className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Claude Brand flower icon below icons */}
                                            <div className="pl-1 mt-1">
                                                <svg viewBox="0 0 200 200" className={`w-[22px] h-[22px] text-[#D46B4F] fill-[#D46B4F] ${isGenerating && index === messages.length - 1 ? 'animate-spin-slow' : ''}`} xmlns="http://www.w3.org/2000/svg" role="presentation">
                                                    <defs>
                                                        <ellipse id="petal-pair" cx="100" cy="100" rx="90" ry="22" />
                                                    </defs>
                                                    <g fill="currentColor" fillRule="evenodd">
                                                        <use href="#petal-pair" transform="rotate(0 100 100)" />
                                                        <use href="#petal-pair" transform="rotate(45 100 100)" />
                                                        <use href="#petal-pair" transform="rotate(90 100 100)" />
                                                        <use href="#petal-pair" transform="rotate(135 100 100)" />
                                                    </g>
                                                </svg>
                                            </div>
                                        </div>
                                    );
                                }
                            })}
                            {isGenerating && messages[messages.length - 1]?.role === 'user' && (
                                <div className="flex items-center gap-2 text-[#7f7f7f] text-xs px-2 animate-pulse select-none pl-1">
                                    <svg viewBox="0 0 200 200" className="w-3.5 h-3.5 text-[#D46B4F] fill-[#D46B4F] animate-spin-slow" xmlns="http://www.w3.org/2000/svg" role="presentation">
                                        <defs>
                                            <ellipse id="petal-pair-sm" cx="100" cy="100" rx="90" ry="22" />
                                        </defs>
                                        <g fill="currentColor" fillRule="evenodd">
                                            <use href="#petal-pair-sm" transform="rotate(0 100 100)" />
                                            <use href="#petal-pair-sm" transform="rotate(45 100 100)" />
                                            <use href="#petal-pair-sm" transform="rotate(90 100 100)" />
                                            <use href="#petal-pair-sm" transform="rotate(135 100 100)" />
                                        </g>
                                    </svg>
                                    LM Studio is thinking...
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>
                    )}

                    {/* Chat Input Bar */}
                    {messages.length > 0 && (
                        <div className="absolute bottom-4 left-0 right-0">
                            {isLoadingModel && (
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-4 bg-[#D46B4F]/90 border border-[#D46B4F]/50 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 z-50 text-[13px] font-semibold text-white animate-pulse">
                                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                                    <span>Loading {loadingModelName} in LM Studio...</span>
                                </div>
                            )}
                            <ClaudeChatInput
                                onSendMessage={handleSendMessage}
                                models={models}
                                selectedModel={selectedModel}
                                onSelectModel={handleSelectModel}
                                onOpenModels={fetchModels}
                                isThinkingEnabled={isThinkingEnabled}
                                onToggleThinking={() => setIsThinkingEnabled(!isThinkingEnabled)}
                                isLoadingModel={isLoadingModel}
                                loadingModelName={loadingModelName}
                                isGenerating={isGenerating}
                                onStopGeneration={handleStopGeneration}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Real Search Dialog Modal Popup */}
            {isSearchOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div 
                        className="w-full max-w-xl bg-[#222222] border border-[#3c3c3b] rounded-2xl shadow-2xl overflow-hidden flex flex-col p-3.5 animate-fade-in relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Search Input Bar */}
                        <div className="flex items-center w-full px-2 py-1 bg-white/5 border border-white/5 rounded-xl">
                            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                            <input 
                                type="text" 
                                placeholder="Search chats and projects"
                                className="w-full bg-transparent border-none outline-none text-white placeholder:text-zinc-500 text-sm ml-2.5 py-1.5 focus:ring-0"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')}
                                    className="p-1 hover:bg-white/5 rounded text-zinc-400 hover:text-white transition-colors"
                                >
                                    <X className="w-4.5 h-4.5" />
                                </button>
                            )}
                            <button 
                                onClick={() => setIsSearchOpen(false)}
                                className="ml-1.5 p-1 hover:bg-white/5 rounded text-zinc-400 hover:text-white transition-colors"
                                title="Close search"
                            >
                                <X className="w-4.5 h-4.5" />
                            </button>
                        </div>

                        {/* Search Results list */}
                        <div className="overflow-y-auto max-h-[350px] no-scrollbar flex flex-col gap-0.5 mt-3 pr-1 pb-1">

                            {/* Dynamically filtered chat sessions */}
                            {filteredSessions.length > 0 ? (
                                filteredSessions.map((session) => (
                                    <button
                                        key={session.id}
                                        onClick={() => {
                                            setActiveSessionId(session.id);
                                            setIsSearchOpen(false);
                                            setSearchQuery('');
                                            setIsChatsViewActive(false);
                                        }}
                                        className="w-full text-left px-3 py-2.5 hover:bg-white/5 rounded-xl flex items-center justify-between transition-colors group"
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden max-w-[80%]">
                                            <ChatIcon className="w-[18px] h-[18px] text-zinc-400 group-hover:text-white shrink-0" />
                                            <span className="text-[13.5px] font-medium text-zinc-300 group-hover:text-white truncate">
                                                {session.title}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-zinc-500 truncate pl-2 select-none">
                                            {formatSessionTime(session.timestamp)}
                                        </span>
                                    </button>
                                ))
                            ) : (
                                searchQuery && (
                                    <div className="text-center py-6 text-xs text-zinc-500 italic">
                                        No matching chats found
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatboxDemo;
