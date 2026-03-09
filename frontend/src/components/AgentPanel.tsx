import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import type { Agent, ChatMessage } from '../types/agent';
import { TemplatePanel } from './PromptTemplates';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { parseThinkingBlocks, hasThinkingContent } from '../utils/thinkingParser';
import ThinkingBlock from './ThinkingBlock';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer bg-surface-700/60 hover:bg-surface-600/60 text-surface-400 hover:text-slate-300"
      title="Copy"
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

const codeBlockStyle: Record<string, React.CSSProperties> = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: 'transparent',
    margin: 0,
    padding: '0.75rem 1rem',
    fontSize: '12px',
    lineHeight: '1.5',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'transparent',
    fontSize: '12px',
  },
};

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeString = String(children).replace(/\n$/, '');

          if (match) {
            return (
              <div className="relative group/code rounded-lg overflow-hidden border border-surface-700 bg-surface-900/80 my-2">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-surface-700/50">
                  <span className="text-[10px] font-mono text-surface-500">{match[1]}</span>
                  <CopyButton text={codeString} />
                </div>
                <SyntaxHighlighter
                  style={codeBlockStyle}
                  language={match[1]}
                  PreTag="div"
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            );
          }

          return (
            <code className="px-1.5 py-0.5 rounded-md bg-surface-800 border border-surface-700 text-[12px] font-mono text-accent-cyan/80" {...props}>
              {children}
            </code>
          );
        },
        pre({ children }) {
          return <>{children}</>;
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        ul({ children }) {
          return <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>;
        },
        li({ children }) {
          return <li className="text-sm">{children}</li>;
        },
        h1({ children }) {
          return <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-sm font-bold mb-1.5 mt-2 first:mt-0">{children}</h3>;
        },
        blockquote({ children }) {
          return <blockquote className="border-l-2 border-accent-cyan/30 pl-3 my-2 text-surface-400 italic">{children}</blockquote>;
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2 rounded-lg border border-surface-700">
              <table className="w-full text-xs">{children}</table>
            </div>
          );
        },
        thead({ children }) {
          return <thead className="bg-surface-800/60">{children}</thead>;
        },
        th({ children }) {
          return <th className="px-3 py-1.5 text-left font-medium text-surface-400 border-b border-surface-700">{children}</th>;
        },
        td({ children }) {
          return <td className="px-3 py-1.5 border-b border-surface-700/50">{children}</td>;
        },
        a({ href, children }) {
          return <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-cyan hover:underline">{children}</a>;
        },
        hr() {
          return <hr className="border-surface-700 my-3" />;
        },
        strong({ children }) {
          return <strong className="font-semibold text-slate-200">{children}</strong>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}


function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function ChatInput({ agent }: { agent: Agent }) {
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, isStreaming, addToast } = useStore();

  const addImages = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(isImageFile);
    const textFiles = files.filter(f => !isImageFile(f));

    if (imageFiles.length > 0) {
      const dataUris = await Promise.all(imageFiles.map(fileToDataUri));
      setAttachedImages(prev => [...prev, ...dataUris]);
    }

    if (textFiles.length > 0) {
      for (const file of textFiles) {
        const text = await file.text();
        const prefix = `[File: ${file.name}]\n`;
        setInput(prev => prev + (prev ? '\n' : '') + prefix + '```\n' + text.slice(0, 10000) + '\n```');
      }
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachedImages.length === 0) || isStreaming) return;
    const msg = input.trim() || (attachedImages.length > 0 ? 'What do you see in this image?' : '');
    sendMessage(agent.id, msg, attachedImages.length > 0 ? attachedImages : undefined);
    setInput('');
    setAttachedImages([]);
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(i => i.type.startsWith('image/'));
    if (imageItems.length > 0) {
      e.preventDefault();
      const files = imageItems.map(i => i.getAsFile()).filter(Boolean) as File[];
      await addImages(files);
    }
  }, [addImages]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await addImages(files);
    }
  }, [addImages]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      await addImages(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addImages]);

  return (
    <div
      className="relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {showTemplates && (
        <TemplatePanel
          onInsert={(content) => setInput(prev => prev + content)}
          onClose={() => setShowTemplates(false)}
        />
      )}
      {attachedImages.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {attachedImages.map((img, i) => (
            <div key={i} className="relative group/thumb">
              <img src={img} alt="" className="h-16 w-16 rounded-lg object-cover border border-surface-700" />
              <button
                onClick={() => setAttachedImages(prev => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity cursor-pointer"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-xl bg-surface-900 border transition-colors ${
          isDragOver ? 'border-accent-cyan/50 bg-accent-cyan/5' : 'border-surface-700'
        }`}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="text-surface-600 hover:text-surface-400 cursor-pointer disabled:opacity-50 shrink-0"
            title="Attach file or image"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowTemplates(!showTemplates)}
            disabled={isStreaming}
            className={`shrink-0 cursor-pointer disabled:opacity-50 transition-colors ${showTemplates ? 'text-accent-cyan' : 'text-surface-600 hover:text-surface-400'}`}
            title="Prompt templates"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder={isDragOver ? 'Drop files here...' : 'Type a message... (paste images with Cmd+V)'}
            disabled={isStreaming}
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-surface-600 disabled:opacity-50"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.py,.js,.ts,.json,.csv,.xml,.html,.css,.yaml,.yml,.toml,.log,.sh,.bash"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
        <button
          type="submit"
          disabled={(!input.trim() && attachedImages.length === 0) || isStreaming}
          className="px-5 py-3 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-sm font-medium text-white disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function CodeInput({ agent }: { agent: Agent }) {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [instruction, setInstruction] = useState('Review this code');
  const { sendCodeReview, isStreaming } = useStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || isStreaming) return;
    sendCodeReview(agent.id, code, language, instruction);
    setCode('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="px-3 py-2 rounded-lg bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/50 appearance-none cursor-pointer"
        >
          {['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'c++', 'ruby', 'php', 'swift'].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Instruction..."
          className="flex-1 px-3 py-2 rounded-lg bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600"
        />
      </div>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your code here..."
        rows={6}
        disabled={isStreaming}
        className="w-full px-4 py-3 rounded-xl bg-surface-900 border border-surface-700 text-sm font-mono focus:outline-none focus:border-accent-cyan/50 transition-colors resize-none placeholder:text-surface-600 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!code.trim() || isStreaming}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-violet to-accent-blue text-sm font-medium text-white disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer"
      >
        {isStreaming ? 'Analyzing...' : 'Analyze Code'}
      </button>
    </form>
  );
}

function SummarizerInput({ agent }: { agent: Agent }) {
  const [content, setContent] = useState('');
  const [sourceType, setSourceType] = useState('text');
  const { sendSummary, isStreaming } = useStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isStreaming) return;
    sendSummary(agent.id, content, sourceType);
    setContent('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        {['text', 'article', 'url'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSourceType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              sourceType === t
                ? 'bg-accent-amber/15 border-accent-amber/30 text-accent-amber border'
                : 'bg-surface-900 border border-surface-700 text-surface-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste content to summarize..."
        rows={6}
        disabled={isStreaming}
        className="w-full px-4 py-3 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors resize-none placeholder:text-surface-600 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!content.trim() || isStreaming}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-amber to-accent-rose text-sm font-medium text-white disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer"
      >
        {isStreaming ? 'Summarizing...' : 'Summarize'}
      </button>
    </form>
  );
}

function TransformerInput({ agent }: { agent: Agent }) {
  const [content, setContent] = useState('');
  const [targetFormat, setTargetFormat] = useState('');
  const [instruction, setInstruction] = useState('');
  const { sendTransform, isStreaming } = useStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isStreaming) return;
    sendTransform(agent.id, content, targetFormat, instruction);
    setContent('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Transform instruction..."
          className="flex-1 px-3 py-2 rounded-lg bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600"
        />
        <input
          value={targetFormat}
          onChange={(e) => setTargetFormat(e.target.value)}
          placeholder="Target format..."
          className="w-36 px-3 py-2 rounded-lg bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600"
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content to transform..."
        rows={6}
        disabled={isStreaming}
        className="w-full px-4 py-3 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors resize-none placeholder:text-surface-600 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!content.trim() || isStreaming}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-emerald to-accent-cyan text-sm font-medium text-white disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer"
      >
        {isStreaming ? 'Transforming...' : 'Transform'}
      </button>
    </form>
  );
}

function GeneratorInput({ agent }: { agent: Agent }) {
  const [instruction, setInstruction] = useState('');
  const { sendGenerate, isStreaming } = useStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || isStreaming) return;
    sendGenerate(agent.id, {}, instruction);
    setInstruction('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Describe what to generate..."
        rows={4}
        disabled={isStreaming}
        className="w-full px-4 py-3 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors resize-none placeholder:text-surface-600 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!instruction.trim() || isStreaming}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-rose to-accent-violet text-sm font-medium text-white disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer"
      >
        {isStreaming ? 'Generating...' : 'Generate'}
      </button>
    </form>
  );
}

function FileInput({ agent }: { agent: Agent }) {
  const [content, setContent] = useState('');
  const { sendMessage, isStreaming } = useStore();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setContent(reader.result as string);
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isStreaming) return;
    sendMessage(agent.id, `Analyze this file content:\n\n${content}`);
    setContent('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="flex items-center justify-center w-full h-24 rounded-xl border-2 border-dashed border-surface-700 hover:border-accent-cyan/30 transition-colors cursor-pointer">
        <div className="text-center">
          <svg className="mx-auto mb-1 text-surface-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span className="text-xs text-surface-500">Drop a file or click to upload</span>
        </div>
        <input type="file" className="hidden" onChange={handleFile} />
      </label>
      {content && (
        <div className="px-3 py-2 rounded-lg bg-surface-900 border border-surface-700 text-xs text-surface-500 truncate">
          File loaded ({content.length} characters)
        </div>
      )}
      <button
        type="submit"
        disabled={!content.trim() || isStreaming}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-blue to-accent-violet text-sm font-medium text-white disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer"
      >
        {isStreaming ? 'Analyzing...' : 'Analyze File'}
      </button>
    </form>
  );
}

interface PendingApprovalData {
  action_id: string;
  action_type: string;
  details: Record<string, string>;
}

function ApprovalCard({ data }: { data: PendingApprovalData }) {
  const { approveAction, denyAction } = useStore();
  const [status, setStatus] = useState<'pending' | 'approving' | 'approved' | 'denied'>('pending');
  const [result, setResult] = useState('');

  const handleApprove = async () => {
    setStatus('approving');
    try {
      const res = await approveAction(data.action_id);
      setStatus('approved');
      setResult(res);
    } catch {
      setStatus('pending');
    }
  };

  const handleDeny = async () => {
    await denyAction(data.action_id);
    setStatus('denied');
  };

  const ACTION_LABELS: Record<string, string> = {
    write_file: 'Write File',
    edit_file: 'Edit File',
    run_command: 'Run Command',
  };

  const detailEntries = Object.entries(data.details).filter(([k]) => k !== 'content');
  const contentPreview = data.details.content;

  return (
    <div className="mt-2 rounded-xl border border-accent-amber/20 bg-accent-amber/5 overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-accent-amber/10">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-amber">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span className="text-xs font-medium text-accent-amber">
          {ACTION_LABELS[data.action_type] || data.action_type}
        </span>
        <span className="text-[10px] text-surface-600 ml-auto font-mono">{data.action_id}</span>
      </div>

      <div className="px-3 py-2 space-y-1">
        {detailEntries.map(([key, value]) => (
          <div key={key} className="flex gap-2 text-xs">
            <span className="text-surface-600 shrink-0">{key}:</span>
            <span className="text-slate-300 font-mono truncate">{value}</span>
          </div>
        ))}
        {contentPreview && (
          <pre className="mt-1 px-2 py-1.5 rounded-lg bg-surface-900/60 text-[11px] font-mono text-surface-500 max-h-40 overflow-y-auto whitespace-pre-wrap">
            {contentPreview.length > 500 ? contentPreview.slice(0, 500) + '\n...' : contentPreview}
          </pre>
        )}
      </div>

      {status === 'pending' && (
        <div className="px-3 py-2 flex gap-2 border-t border-accent-amber/10">
          <button
            onClick={handleApprove}
            className="flex-1 py-1.5 rounded-lg bg-accent-emerald/15 border border-accent-emerald/25 text-accent-emerald text-xs font-medium hover:bg-accent-emerald/25 transition-colors cursor-pointer"
          >
            Approve
          </button>
          <button
            onClick={handleDeny}
            className="flex-1 py-1.5 rounded-lg bg-accent-rose/15 border border-accent-rose/25 text-accent-rose text-xs font-medium hover:bg-accent-rose/25 transition-colors cursor-pointer"
          >
            Deny
          </button>
        </div>
      )}

      {status === 'approving' && (
        <div className="px-3 py-2 border-t border-accent-amber/10">
          <span className="text-xs text-accent-amber animate-pulse">Executing...</span>
        </div>
      )}

      {status === 'approved' && (
        <div className="px-3 py-2 border-t border-accent-emerald/15">
          <span className="text-xs text-accent-emerald font-medium">Executed</span>
          {result && (
            <pre className="mt-1 px-2 py-1.5 rounded-lg bg-surface-900/60 text-[11px] font-mono text-surface-500 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {result.length > 500 ? result.slice(0, 500) + '\n...' : result}
            </pre>
          )}
        </div>
      )}

      {status === 'denied' && (
        <div className="px-3 py-2 border-t border-accent-rose/15">
          <span className="text-xs text-accent-rose font-medium">Denied</span>
        </div>
      )}
    </div>
  );
}

function MessageContent({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  const hasApproval = content.includes('[PENDING_APPROVAL]');

  // Parse thinking blocks from reasoning models (deepseek-r1, qwq, etc.)
  const hasThinking = hasThinkingContent(content);
  const parsed = hasThinking ? parseThinkingBlocks(content) : null;

  const renderContent = (text: string) => {
    if (!text) return null;

    if (hasApproval) {
      const parts = text.split(/(\[PENDING_APPROVAL\]\{[\s\S]*?\}\[\/PENDING_APPROVAL\])/g);
      return (
        <div className="space-y-2">
          {parts.map((part, i) => {
            if (!part) return null;
            if (part.startsWith('[PENDING_APPROVAL]{') && part.endsWith('[/PENDING_APPROVAL]')) {
              try {
                const jsonStr = part.slice('[PENDING_APPROVAL]'.length, -'[/PENDING_APPROVAL]'.length);
                const data: PendingApprovalData = JSON.parse(jsonStr);
                return <ApprovalCard key={i} data={data} />;
              } catch {
                return (
                  <div key={i} className="px-3 py-2 rounded-lg bg-accent-rose/8 border border-accent-rose/20 text-xs text-accent-rose">
                    Awaiting approval (parse error)
                  </div>
                );
              }
            }
            return <MarkdownContent key={i} content={part} />;
          })}
        </div>
      );
    }

    return <MarkdownContent content={text} />;
  };

  if (parsed) {
    const thinkingInProgress = isStreaming && !parsed.response;
    return (
      <div>
        <ThinkingBlock content={parsed.thinking} isStreaming={thinkingInProgress} />
        {renderContent(parsed.response)}
      </div>
    );
  }

  return <>{renderContent(content)}</>;
}

interface MessageBubbleProps {
  message: ChatMessage;
  index: number;
  agentId: string;
  isLast: boolean;
  agentType: string;
}

function MessageBubble({ message, index, agentId, isLast, agentType }: MessageBubbleProps) {
  const { conversations, isStreaming, sendMessage, sendCodeReview, sendSummary, sendTransform, sendGenerate, addToast } = useStore();
  const [showActions, setShowActions] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(message.content);
    addToast('Copied to clipboard', 'info');
    setShowActions(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const history = conversations[agentId] || [];
    const updated = history.filter((_, i) => i !== index);
    useStore.setState({
      conversations: { ...conversations, [agentId]: updated },
    });
    setShowActions(false);
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStreaming) return;

    const history = conversations[agentId] || [];

    if (message.role === 'user') {
      const trimmed = history.slice(0, index);
      useStore.setState({
        conversations: { ...conversations, [agentId]: trimmed },
      });

      const content = message.content;

      if (content.startsWith('[Code Review]')) {
        const match = content.match(/^\[Code Review\] (\w+)\n(.*?)\n```\w+\n([\s\S]*)\n```$/);
        if (match) {
          sendCodeReview(agentId, match[3], match[1], match[2]);
          return;
        }
      }
      if (content.startsWith('[Summarize]')) {
        const rest = content.replace(/^\[Summarize\] \w+\n/, '');
        sendSummary(agentId, rest, 'text');
        return;
      }
      if (content.startsWith('[Transform]')) {
        const rest = content.replace(/^\[Transform\] .*?\n/, '');
        sendTransform(agentId, rest, '', '');
        return;
      }
      if (content.startsWith('[Generate]')) {
        const rest = content.replace(/^\[Generate\] /, '');
        sendGenerate(agentId, {}, rest);
        return;
      }

      sendMessage(agentId, content);
    } else if (message.role === 'assistant' && index > 0) {
      const prevUser = history[index - 1];
      if (prevUser?.role === 'user') {
        const trimmed = history.slice(0, index);
        useStore.setState({
          conversations: { ...conversations, [agentId]: trimmed },
        });
        sendMessage(agentId, prevUser.content);
      }
    }
    setShowActions(false);
  };

  const isUser = message.role === 'user';
  const isStreamingThis = isStreaming && isLast && !isUser;

  return (
    <div
      className={`group/msg flex ${isUser ? 'justify-end' : 'justify-start'}`}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="relative max-w-[80%]">
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-accent-cyan/10 border border-accent-cyan/15 text-slate-200 whitespace-pre-wrap'
              : 'bg-surface-800 border border-surface-700 text-slate-300'
          }`}
        >
          {isUser && message.images && message.images.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {message.images.map((img, j) => (
                <img key={j} src={img} alt="" className="max-h-48 rounded-lg border border-accent-cyan/10" />
              ))}
            </div>
          )}
          {message.content ? (
            isUser ? (
              <span className="whitespace-pre-wrap">{message.content}</span>
            ) : (
              <MessageContent content={message.content} isStreaming={isStreamingThis} />
            )
          ) : (
            <span className="inline-block w-2 h-4 bg-accent-cyan/60 animate-pulse rounded-sm" />
          )}
        </div>

        {!isStreamingThis && message.content && (
          <div className={`absolute top-1 ${isUser ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} opacity-0 group-hover/msg:opacity-100 transition-opacity`}>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActions(!showActions);
                }}
                className="w-6 h-6 rounded-md flex items-center justify-center bg-surface-800/80 border border-surface-700 text-surface-500 hover:text-slate-300 cursor-pointer transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2"/>
                  <circle cx="12" cy="12" r="2"/>
                  <circle cx="12" cy="19" r="2"/>
                </svg>
              </button>

              {showActions && (
                <div className={`absolute top-0 z-10 ${isUser ? 'right-full mr-1' : 'left-full ml-1'} bg-surface-850 border border-surface-700 rounded-lg shadow-xl overflow-hidden min-w-[120px]`}>
                  <button
                    onClick={handleCopy}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-400 hover:text-slate-200 hover:bg-surface-800 transition-colors cursor-pointer"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy
                  </button>
                  <button
                    onClick={handleRetry}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-400 hover:text-slate-200 hover:bg-surface-800 transition-colors ${isStreaming ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    disabled={isStreaming}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Retry
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-accent-rose/70 hover:text-accent-rose hover:bg-surface-800 transition-colors cursor-pointer"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const INPUT_MAP: Record<string, React.FC<{ agent: Agent }>> = {
  chat: ChatInput,
  reasoning: ChatInput,
  code: CodeInput,
  summarizer: SummarizerInput,
  transformer: TransformerInput,
  generator: GeneratorInput,
  file: FileInput,
};

export function AgentPanel() {
  const { selectedAgent, selectAgent, conversations, clearConversation } = useStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = selectedAgent ? (conversations[selectedAgent.id] || []) : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectAgent(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectAgent]);

  if (!selectedAgent) return null;

  const InputComponent = INPUT_MAP[selectedAgent.agent_type] || ChatInput;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={() => selectAgent(null)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="slide-in-right relative ml-auto w-full max-w-2xl h-full glass noise flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 p-6 border-b border-white/5">
          <button
            onClick={() => selectAgent(null)}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-800 hover:bg-surface-700 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${selectedAgent.color}30, ${selectedAgent.color}10)` }}
          >
            <div className="w-3 h-3 rounded-full" style={{ background: selectedAgent.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold tracking-tight font-[family-name:var(--font-display)]">
              {selectedAgent.name}
            </h2>
            <p className="text-xs text-surface-500">
              {selectedAgent.model} &middot; {selectedAgent.agent_type}
              {selectedAgent.tools_enabled && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-accent-amber/10 text-accent-amber text-[10px] font-medium">
                  Tools {selectedAgent.confirmation_mode === 'confirm' ? '(confirm)' : '(auto)'}
                </span>
              )}
            </p>
          </div>
          {messages.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const lines = messages.map(m =>
                    m.role === 'user' ? `**You:**\n${m.content}` : `**${selectedAgent.name}:**\n${m.content}`
                  );
                  const md = `# Conversation with ${selectedAgent.name}\n\n${lines.join('\n\n---\n\n')}`;
                  const blob = new Blob([md], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${selectedAgent.name.toLowerCase().replace(/\s+/g, '-')}-conversation.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-800 hover:bg-surface-700 text-surface-500 hover:text-accent-cyan transition-colors cursor-pointer"
                title="Export conversation"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <button
                onClick={() => clearConversation(selectedAgent.id)}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-800 hover:bg-surface-700 text-surface-500 hover:text-accent-rose transition-colors cursor-pointer"
                title="Clear conversation"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-surface-600">Start interacting with this agent</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              index={i}
              agentId={selectedAgent.id}
              isLast={i === messages.length - 1}
              agentType={selectedAgent.agent_type}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-6 border-t border-white/5">
          <InputComponent agent={selectedAgent} />
        </div>
      </div>
    </div>
  );
}
