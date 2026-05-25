"use client";

import Image from "next/image";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Plus, ChevronDown, ArrowUp, X, FileText, Loader2, Check, Archive, ChevronRight, Square } from "lucide-react";

/* --- ICONS --- */
export const Icons = {
    Logo: (props: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="presentation" {...props}>
            <defs>
                <ellipse id="petal-pair" cx="100" cy="100" rx="90" ry="22" />
            </defs>
            <g fill="#D46B4F" fillRule="evenodd">
                <use href="#petal-pair" transform="rotate(0 100 100)" />
                <use href="#petal-pair" transform="rotate(45 100 100)" />
                <use href="#petal-pair" transform="rotate(90 100 100)" />
                <use href="#petal-pair" transform="rotate(135 100 100)" />
            </g>
        </svg>
    ),
    Plus: Plus,
    SelectArrow: ChevronDown,
    ArrowUp: ArrowUp,
    X: X,
    FileText: FileText,
    Loader2: Loader2,
    Check: Check,
    Archive: Archive,
    Square: Square,
};

/* --- UTILS --- */
const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/* --- COMPONENTS --- */

// 1. File Preview Card
interface AttachedFile {
    id: string;
    file: File;
    type: string;
    preview: string | null;
    uploadStatus: string;
    content?: string;
}

interface FilePreviewCardProps {
    file: AttachedFile;
    onRemove: (id: string) => void;
}

const FilePreviewCard: React.FC<FilePreviewCardProps> = ({ file, onRemove }) => {
    const isImage = file.type.startsWith("image/") && file.preview;

    return (
        <div className={`relative group flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-bg-300 bg-bg-200 animate-fade-in transition-all hover:border-text-400`}>
            {isImage ? (
                <div className="w-full h-full relative">
                    <Image
                        src={file.preview!}
                        alt={file.file.name}
                        fill
                        sizes="96px"
                        unoptimized
                        className="object-cover"
                    />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                </div>
            ) : (
                <div className="w-full h-full p-3 flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-bg-300 rounded">
                            <Icons.FileText className="w-4 h-4 text-text-300" />
                        </div>
                        <span className="text-[10px] font-medium text-text-400 uppercase tracking-wider truncate">
                            {file.file.name.split('.').pop()}
                        </span>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-xs font-medium text-text-200 truncate" title={file.file.name}>
                            {file.file.name}
                        </p>
                        <p className="text-[10px] text-text-500">
                            {formatFileSize(file.file.size)}
                        </p>
                    </div>
                </div>
            )}

            {/* Remove Button Overlay */}
            <button
                onClick={() => onRemove(file.id)}
                className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <Icons.X className="w-3 h-3" />
            </button>

            {/* Upload Status */}
            {file.uploadStatus === 'uploading' && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Icons.Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
            )}
        </div>
    );
};

// 2. Pasted Content Card
interface PastedSnippet {
    id: string;
    content: string;
    timestamp: Date;
}

interface PastedContentCardProps {
    content: PastedSnippet;
    onRemove: (id: string) => void;
}

const PastedContentCard: React.FC<PastedContentCardProps> = ({ content, onRemove }) => {
    return (
        <div className="relative group flex-shrink-0 w-28 h-28 rounded-2xl overflow-hidden border border-[#E5E5E5] dark:border-[#30302E] bg-white dark:bg-[#20201F] animate-fade-in p-3 flex flex-col justify-between shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="overflow-hidden w-full">
                <p className="text-[10px] text-[#9CA3AF] leading-[1.4] font-mono break-words whitespace-pre-wrap line-clamp-4 select-none">
                    {content.content}
                </p>
            </div>

            <div className="flex items-center justify-between w-full mt-2">
                <div className="inline-flex items-center justify-center px-1.5 py-[2px] rounded border border-[#E5E5E5] dark:border-[#404040] bg-white dark:bg-transparent">
                    <span className="text-[9px] font-bold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-wider font-sans">PASTED</span>
                </div>
            </div>

            <button
                onClick={() => onRemove(content.id)}
                className="absolute top-2 right-2 p-[3px] bg-white dark:bg-[#30302E] border border-[#E5E5E5] dark:border-[#404040] rounded-full text-[#9CA3AF] hover:text-[#6B7280] dark:hover:text-white transition-colors shadow-sm opacity-0 group-hover:opacity-100"
            >
                <Icons.X className="w-2 h-2" />
            </button>
        </div>
    );
};

// 3. Model Selector
interface Model {
    id: string;
    name: string;
    description: string;
    badge?: string;
}

interface ModelSelectorProps {
    models: Model[];
    selectedModel: string;
    onSelect: (modelId: string) => void;
    onOpenModels?: () => void;
    forceThinking: string | null;
    setForceThinking: (v: string | null) => void;
    modelTier: string | null;
    isLoadingModel?: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ 
    models, 
    selectedModel, 
    onSelect, 
    onOpenModels,
    forceThinking, 
    setForceThinking,
    modelTier,
    isLoadingModel = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showMoreModels, setShowMoreModels] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const currentModel = (models && models.length > 0)
        ? (models.find(m => m.id === selectedModel) || models[0])
        : { id: "", name: "No models loaded", description: "Start LM Studio" };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setShowMoreModels(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button - displaying "[Model] Adaptive v" exactly like screenshots with high-contrast text */}
            <button
                onClick={() => {
                    if (isLoadingModel) return;
                    if (!isOpen) onOpenModels?.();
                    setIsOpen(!isOpen);
                }}
                disabled={isLoadingModel}
                className={`inline-flex items-center justify-center relative shrink-0 transition font-sans duration-200 h-9 rounded-xl px-3.5 bg-[#222222]/80 text-[#ececec] hover:bg-[#2c2c2b]/95 border border-transparent select-none text-[13px] gap-1.5 font-medium hover:text-white ${isLoadingModel ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
                {isLoadingModel ? (
                    <>
                        <Icons.Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
                        <span className="text-zinc-400 font-semibold">Loading model...</span>
                    </>
                ) : (
                    <>
                        <span className="text-white font-semibold">{currentModel.name}</span>
                        {forceThinking !== 'off' && (
                            <span className="text-zinc-400 font-normal ml-0.5">Adaptive</span>
                        )}
                        <Icons.SelectArrow className={`w-3.5 h-3.5 text-zinc-400 opacity-80 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </>
                )}
            </button>


            {isOpen && (
                <div className="absolute bottom-full right-0 mb-2.5 flex items-end z-50 animate-fade-in origin-bottom-right">
                    
                    {/* Main Panel */}
                    <div className="w-[260px] bg-[#222222] border border-[#3c3c3b] rounded-2xl shadow-2xl p-1.5 flex flex-col relative">
                        {/* Currently Selected Model */}
                        <div className="w-full text-left px-3.5 py-3 rounded-xl flex items-center justify-between bg-white/5 border border-white/5">
                            <div className="flex flex-col gap-0.5 max-w-[85%]">
                                <span className="text-[13px] font-semibold text-white truncate">
                                    {currentModel.name}
                                </span>
                                <span className="text-[11px] text-zinc-400 truncate">
                                    Responsive everyday work
                                </span>
                            </div>
                            <Icons.Check className="w-4 h-4 text-blue-500 shrink-0" />
                        </div>

                        <div className="h-px bg-white/5 my-1.5 mx-2" />

                        {/* Adaptive Thinking Row - Premium toggle switch inside dropdown (Claude orange color) */}
                        <div className="w-full px-3.5 py-3 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors">
                            <div className="flex flex-col gap-0.5 max-w-[70%]">
                                <span className="text-[13px] font-semibold text-white">
                                    Adaptive thinking
                                </span>
                                <span className="text-[11px] text-zinc-400">
                                    Thinks for more complex tasks
                                </span>
                            </div>
                            
                            {/* Claude Orange toggle switch */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setForceThinking(forceThinking === 'off' ? null : 'off');
                                }}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none select-none
                                    ${forceThinking !== 'off' ? 'bg-[#D46B4F]' : 'bg-[#121212] border border-[#3c3c3b]'}`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                                        ${forceThinking !== 'off' ? 'translate-x-4' : 'translate-x-0'}`}
                                />
                            </button>
                        </div>

                        <div className="h-px bg-white/5 my-1.5 mx-2" />

                        {/* More Models Submenu Trigger - Dark capsule container row per screenshot */}
                        <button 
                            onClick={() => setShowMoreModels(!showMoreModels)}
                            className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between group transition-all duration-200 bg-[#131313] hover:bg-[#1a1a1a] text-white font-medium border border-white/5"
                        >
                            <span className="text-[13px] font-semibold text-white">More models</span>
                            <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${showMoreModels ? 'rotate-90 md:rotate-0' : ''}`} />
                        </button>
                    </div>

                    {/* Submenu Panel (Slides open next to main panel - Dynamically lists dynamic models from LM Studio!) */}
                    {showMoreModels && (
                        <div className="w-[220px] bg-[#222222] border border-[#3c3c3b] rounded-2xl shadow-2xl p-1.5 flex flex-col ml-2 animate-fade-in origin-bottom-left max-h-[300px] overflow-y-auto no-scrollbar">
                            {models && models.length > 0 ? (
                                models.map((model) => (
                                    <button
                                        key={model.id}
                                        onClick={() => {
                                            onSelect(model.id);
                                            setIsOpen(false);
                                            setShowMoreModels(false);
                                        }}
                                        className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors group"
                                    >
                                        <span className="text-[13px] font-medium text-[#ececec] group-hover:text-white truncate">
                                            {model.name}
                                        </span>
                                        {selectedModel === model.id && (
                                            <Icons.Check className="w-4 h-4 text-blue-500 shrink-0" />
                                        )}
                                    </button>
                                ))
                            ) : (
                                <div className="px-3.5 py-3 text-xs text-zinc-400 italic">
                                    No models loaded
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// 4. Main Chat Input Component
interface ClaudeChatInputProps {
    onSendMessage: (data: {
        message: string;
        files: AttachedFile[];
        pastedContent: PastedSnippet[];
        model: string;
        forceThinking: string | null;
    }) => void;
    models?: Model[];
    selectedModel?: string;
    onSelectModel?: (modelId: string) => void;
    onOpenModels?: () => void;
    forceThinking: string | null;
    setForceThinking: (v: string | null) => void;
    modelTier: string | null;
    isLoadingModel?: boolean;
    loadingModelName?: string;
    isGenerating?: boolean;
    onStopGeneration?: () => void;
}

export const ClaudeChatInput: React.FC<ClaudeChatInputProps> = ({ 
    onSendMessage,
    models: propsModels,
    selectedModel: propsSelectedModel,
    onSelectModel: propsOnSelectModel,
    onOpenModels,
    forceThinking,
    setForceThinking,
    modelTier,
    isLoadingModel = false,
    loadingModelName = "",
    isGenerating = false,
    onStopGeneration
}) => {
    const [message, setMessage] = useState("");
    const [files, setFiles] = useState<AttachedFile[]>([]);
    const [pastedContent, setPastedContent] = useState<PastedSnippet[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    // Controlled or uncontrolled local state fallbacks
    const [localSelectedModel, setLocalSelectedModel] = useState("sonnet-4.5");
    const selectedModel = propsSelectedModel !== undefined ? propsSelectedModel : localSelectedModel;
    const setSelectedModel = propsOnSelectModel !== undefined ? propsOnSelectModel : setLocalSelectedModel;

    const defaultModels = [
        { id: "opus-4.5", name: "Opus 4.5", description: "Most capable for complex work" },
        { id: "sonnet-4.5", name: "Sonnet 4.5", description: "Best for everyday tasks" },
        { id: "haiku-4.5", name: "Haiku 4.5", description: "Fastest for quick answers" }
    ];
    const models = propsModels || defaultModels;

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 384) + "px";
        }
    }, [message]);

    // File Handling
    const handleFiles = useCallback((newFilesList: FileList | File[]) => {
        const newFiles = Array.from(newFilesList).map(file => {
            const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);
            return {
                id: Math.random().toString(36).substr(2, 9),
                file,
                type: isImage ? (file.type || 'image/png') : (file.type || 'application/octet-stream'),
                preview: isImage ? URL.createObjectURL(file) : null,
                uploadStatus: 'pending'
            };
        });

        setFiles(prev => [...prev, ...newFiles]);

        newFiles.forEach(f => {
            setTimeout(() => {
                setFiles(prev => prev.map(p => p.id === f.id ? { ...p, uploadStatus: 'complete' } : p));
            }, 800 + Math.random() * 1000);
        });
    }, []);

    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        const pastedFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) pastedFiles.push(file);
            }
        }

        if (pastedFiles.length > 0) {
            e.preventDefault();
            handleFiles(pastedFiles);
            return;
        }

        const text = e.clipboardData.getData('text');
        if (text.length > 300) {
            e.preventDefault();
            const snippet: PastedSnippet = {
                id: Math.random().toString(36).substr(2, 9),
                content: text,
                timestamp: new Date()
            };
            setPastedContent(prev => [...prev, snippet]);

            if (!message) {
                setMessage("Analyzed pasted text...");
            }
        }
    };

    const handleSend = () => {
        if (!message.trim() && files.length === 0 && pastedContent.length === 0) return;
        onSendMessage({ 
            message, 
            files, 
            pastedContent, 
            model: selectedModel,
            forceThinking 
        });
        setMessage("");
        setFiles([]);
        setPastedContent([]);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const hasContent = message.trim() || files.length > 0 || pastedContent.length > 0;

    return (
        <div
            className={`relative w-full max-w-3xl mx-auto transition-all duration-300 font-sans`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            <div className={`
                !box-content flex flex-col mx-2 md:mx-0 items-stretch transition-all duration-200 relative z-10 rounded-2xl cursor-text border border-transparent focus-within:border-[#3c3c3b] 
                shadow-[0_0_15px_rgba(0,0,0,0.08)] hover:shadow-[0_0_20px_rgba(0,0,0,0.12)]
                bg-[#222222] font-sans antialiased
            `}>

                <div className="flex flex-col px-3 py-2.5 gap-2">

                    {(files.length > 0 || pastedContent.length > 0) && (
                        <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 px-1">
                            {pastedContent.map(content => (
                                <PastedContentCard
                                    key={content.id}
                                    content={content}
                                    onRemove={id => setPastedContent(prev => prev.filter(c => c.id !== id))}
                                />
                            ))}
                            {files.map(file => (
                                <FilePreviewCard
                                    key={file.id}
                                    file={file}
                                    onRemove={id => setFiles(prev => prev.filter(f => f.id !== id))}
                                />
                            ))}
                        </div>
                    )}

                    <div className="relative mb-1">
                        <div className="max-h-96 w-full overflow-y-auto custom-scrollbar font-sans break-words transition-opacity duration-200 min-h-[3rem] pl-1 flex items-center">
                            <textarea
                                ref={textareaRef}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onPaste={handlePaste}
                                onKeyDown={handleKeyDown}
                                placeholder={isLoadingModel ? `Loading model ${loadingModelName || ''} in LM Studio...` : "Write a message..."}
                                disabled={isLoadingModel}
                                spellCheck="false"
                                className={`w-full bg-transparent border-0 outline-none text-[#ececec] text-[16px] placeholder:text-zinc-500 resize-none overflow-hidden py-1 leading-relaxed block font-normal antialiased ${isLoadingModel ? 'opacity-50 cursor-not-allowed animate-pulse' : ''}`}
                                rows={1}
                                autoFocus
                                style={{ minHeight: '1.5em' }}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 w-full items-center">
                        <div className="relative flex-1 flex items-center shrink min-w-0 gap-1">
                            {/* Toggle Menu / Attach Button - ONLY + button (clock/thinking button removed per request) */}
                            <button
                                onClick={() => !isLoadingModel && fileInputRef.current?.click()}
                                disabled={isLoadingModel}
                                className={`inline-flex items-center justify-center relative shrink-0 transition-colors duration-200 h-8 w-8 rounded-lg active:scale-95 text-zinc-400 hover:text-[#ececec] hover:bg-white/5 ${isLoadingModel ? 'opacity-30 cursor-not-allowed' : ''}`}
                                type="button"
                                aria-label="Toggle menu"
                            >
                                <Icons.Plus className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex flex-row items-center min-w-0 gap-1">
                            {/* Model Selector */}
                            <div className="shrink-0 p-1 -m-1">
                                <ModelSelector
                                    models={models}
                                    selectedModel={selectedModel}
                                    onSelect={setSelectedModel}
                                    onOpenModels={onOpenModels}
                                    forceThinking={forceThinking}
                                    setForceThinking={setForceThinking}
                                    modelTier={modelTier}
                                    isLoadingModel={isLoadingModel}
                                />
                            </div>

                            {/* Send Button */}
                            <div>
                                {isGenerating ? (
                                    <button
                                        onClick={onStopGeneration}
                                        className="inline-flex items-center justify-center relative shrink-0 transition-colors h-8 w-8 rounded-md active:scale-95 !rounded-full !h-8 !w-8 bg-[#2c2c2b] text-white hover:bg-[#3c3c3b] shadow-md border border-[#3c3c3b]"
                                        type="button"
                                        aria-label="Stop generation"
                                    >
                                        <Icons.Square className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSend}
                                        disabled={!hasContent || isLoadingModel}
                                        className={`
                                            inline-flex items-center justify-center relative shrink-0 transition-colors h-8 w-8 rounded-md active:scale-95 !rounded-xl !h-8 !w-8
                                            ${hasContent && !isLoadingModel
                                                ? 'bg-accent text-bg-0 hover:bg-accent-hover shadow-md'
                                                : 'bg-accent/30 text-bg-0/60 cursor-default opacity-50'}
                                        `}
                                        type="button"
                                        aria-label="Send message"
                                    >
                                        <Icons.ArrowUp className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isDragging && (
                <div className="absolute inset-0 bg-bg-200/90 border-2 border-dashed border-accent rounded-2xl z-50 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none">
                    <Icons.Archive className="w-10 h-10 text-accent mb-2 animate-bounce" />
                    <p className="text-accent font-medium">Drop files to upload</p>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                    if (e.target.files) handleFiles(e.target.files);
                    e.target.value = '';
                }}
            />

            <div className="text-center mt-4">
                <p className="text-xs text-zinc-500">
                    AI can make mistakes. Please check important information.
                </p>
            </div>
        </div >
    );
};

export default ClaudeChatInput;
