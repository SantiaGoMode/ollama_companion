import { useState } from 'react';

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export default function ThinkingBlock({ content, isStreaming = false }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[11px] font-medium text-surface-500 hover:text-surface-300 transition-colors group cursor-pointer"
      >
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded border border-surface-600 group-hover:border-surface-500 transition-colors"
          style={{ fontSize: '8px' }}
        >
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
        <span className="tracking-wide uppercase">
          {isStreaming ? 'Reasoning...' : 'Reasoning'}
        </span>
        {isStreaming && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        )}
        {!isStreaming && !expanded && (
          <span className="text-surface-600 normal-case tracking-normal">
            ({content.length > 80 ? `${content.length} chars` : 'click to expand'})
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 pl-3 border-l-2 border-amber-500/20">
          <div className="px-3 py-2.5 rounded-lg bg-amber-500/5 text-[12px] leading-relaxed text-surface-400 whitespace-pre-wrap max-h-[400px] overflow-y-auto scrollbar-thin">
            {content}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3.5 bg-amber-400/60 animate-pulse rounded-sm ml-0.5" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
