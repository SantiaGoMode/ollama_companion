import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Agent, AgentType } from '../types/agent';
import { useStore } from '../store/useStore';
import { timeAgo } from '../utils/timeAgo';

const TYPE_CONFIG: Record<AgentType, { label: string; icon: string }> = {
  chat: { label: 'Chat', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  summarizer: { label: 'Summarizer', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  code: { label: 'Code', icon: 'M16 18l6-6-6-6 M8 6l-6 6 6 6' },
  file: { label: 'File', icon: 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M13 2v7h7' },
  generator: { label: 'Generator', icon: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5' },
  transformer: { label: 'Transformer', icon: 'M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3' },
  reasoning: { label: 'Reasoning', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
};

interface Props {
  agent: Agent;
  index: number;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  onClone: (agent: Agent) => void;
  onExport: (agent: Agent) => void;
}

export function AgentCard({ agent, index, isPinned, onTogglePin, onClone, onExport }: Props) {
  const { selectAgent, removeAgent, setEditingAgent } = useStore();
  const config = TYPE_CONFIG[agent.agent_type];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agent.id });

  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    animationDelay: `${index * 60}ms`,
    opacity: isDragging ? 0.5 : 0,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle}
      className={`fade-in group relative glass glass-hover noise rounded-2xl p-6 cursor-pointer transition-all duration-300 ${isDragging ? '' : 'hover:-translate-y-1'}`}
      onClick={() => selectAgent(agent)}
    >
      {isPinned && (
        <div className="absolute top-2 left-3 text-accent-amber" title="Pinned">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </div>
      )}

      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(agent.id);
          }}
          className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
            isPinned
              ? 'bg-accent-amber/20 text-accent-amber'
              : 'bg-surface-800/80 hover:bg-accent-amber/20 text-surface-500 hover:text-accent-amber'
          }`}
          title={isPinned ? 'Unpin' : 'Pin to top'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClone(agent);
          }}
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-800/80 hover:bg-accent-blue/20 text-surface-500 hover:text-accent-blue cursor-pointer transition-colors"
          title="Clone agent"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExport(agent);
          }}
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-800/80 hover:bg-accent-emerald/20 text-surface-500 hover:text-accent-emerald cursor-pointer transition-colors"
          title="Export agent"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditingAgent(agent);
          }}
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-800/80 hover:bg-accent-cyan/20 text-surface-500 hover:text-accent-cyan cursor-pointer transition-colors"
          title="Edit agent"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeAgent(agent.id);
          }}
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-800/80 hover:bg-accent-rose/20 text-surface-500 hover:text-accent-rose cursor-pointer transition-colors"
          title="Delete agent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="flex items-start gap-4 mb-4">
        <div className="relative shrink-0">
          <div
            {...attributes}
            {...listeners}
            className="absolute -left-2 top-1/2 -translate-y-1/2 w-5 h-8 flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing transition-opacity z-10"
            onClick={e => e.stopPropagation()}
            title="Drag to reorder"
          >
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" className="text-surface-500">
              <circle cx="3" cy="2" r="1.5"/>
              <circle cx="7" cy="2" r="1.5"/>
              <circle cx="3" cy="8" r="1.5"/>
              <circle cx="7" cy="8" r="1.5"/>
              <circle cx="3" cy="14" r="1.5"/>
              <circle cx="7" cy="14" r="1.5"/>
            </svg>
          </div>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${agent.color}30, ${agent.color}10)`, border: `1px solid ${agent.color}25` }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={agent.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={config.icon} />
            </svg>
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight truncate font-[family-name:var(--font-display)]">
            {agent.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md"
              style={{ background: `${agent.color}15`, color: agent.color }}
            >
              {config.label}
            </span>
            {agent.tools_enabled && (
              <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-accent-amber/10 text-accent-amber border border-accent-amber/15">
                Tools
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-surface-500 leading-relaxed line-clamp-2 mb-4">
        {agent.description || 'No description'}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-surface-600 font-mono truncate">{agent.model}</span>
        <div className="flex items-center gap-2.5 shrink-0">
          {agent.message_count > 0 && (
            <span className="text-[10px] text-surface-600" title={`${agent.message_count} messages`}>
              {agent.message_count} msg{agent.message_count !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[10px] text-surface-600" title={agent.last_used_at ? new Date(agent.last_used_at).toLocaleString() : new Date(agent.updated_at).toLocaleString()}>
            {timeAgo(agent.last_used_at || agent.updated_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
