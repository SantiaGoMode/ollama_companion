import { useState } from 'react';
import { useStore } from '../store/useStore';
import { AGENT_PRESETS, PRESET_CATEGORIES, getPresetsByType } from '../data/presets';
import { getRecommendedModelName } from '../utils/modelSelection';
import type { AgentPreset } from '../data/presets';
import type { AgentType } from '../types/agent';

interface Props {
  onSelectPreset: (preset: AgentPreset) => void;
  onCustom: () => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<AgentType, string> = {
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  summarizer: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  code: 'M16 18l6-6-6-6 M8 6l-6 6 6 6',
  file: 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M13 2v7h7',
  generator: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  transformer: 'M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3',
  reasoning: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
};

export function AgentLibrary({ onSelectPreset, onCustom, onClose }: Props) {
  const { models } = useStore();
  const [activeType, setActiveType] = useState<AgentType | 'all'>('all');

  const filteredPresets = activeType === 'all'
    ? AGENT_PRESETS
    : getPresetsByType(activeType);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        onClick={(e) => e.stopPropagation()}
        className="fade-in relative glass noise rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold tracking-tight font-[family-name:var(--font-display)]">
              Agent Library
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-800 hover:bg-surface-700 transition-colors cursor-pointer text-surface-500"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <p className="text-xs text-surface-500 mb-5">Choose a pre-configured agent or start from scratch</p>

          {/* Category tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setActiveType('all')}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeType === 'all'
                  ? 'bg-white/10 text-slate-200'
                  : 'text-surface-500 hover:text-surface-400 hover:bg-white/5'
              }`}
            >
              All ({AGENT_PRESETS.length})
            </button>
            {PRESET_CATEGORIES.map((cat) => {
              const count = getPresetsByType(cat.type).length;
              return (
                <button
                  key={cat.type}
                  onClick={() => setActiveType(cat.type)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    activeType === cat.type
                      ? 'bg-white/10 text-slate-200'
                      : 'text-surface-500 hover:text-surface-400 hover:bg-white/5'
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Preset grid */}
        <div className="flex-1 overflow-y-auto px-8 pb-4">
          <div className="grid grid-cols-2 gap-3">
            {filteredPresets.map((preset, i) => (
              <button
                key={preset.id}
                onClick={() => onSelectPreset(preset)}
                className="fade-in group text-left p-4 rounded-2xl border border-surface-700 bg-surface-900/40 hover:border-surface-600 hover:bg-surface-800/60 transition-all cursor-pointer"
                style={{ animationDelay: `${i * 30}ms`, opacity: 0 }}
              >
                <div className="flex items-start gap-3 mb-2.5">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${preset.color}25, ${preset.color}08)`,
                      border: `1px solid ${preset.color}20`,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={preset.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={TYPE_ICONS[preset.agent_type]} />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors font-[family-name:var(--font-display)]">
                      {preset.name}
                    </h3>
                    <span
                      className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5"
                      style={{ background: `${preset.color}12`, color: preset.color }}
                    >
                      {preset.agent_type}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-surface-500 leading-relaxed line-clamp-2 mb-2">
                  {preset.description}
                </p>
                {(() => {
                  const rec = getRecommendedModelName(preset.agent_type, models);
                  return rec ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-surface-600">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4" y="4" width="16" height="16" rx="2"/>
                        <path d="M9 9h6v6H9z"/>
                      </svg>
                      <span className="font-mono truncate">{rec}</span>
                    </div>
                  ) : null;
                })()}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-white/5 flex items-center justify-between">
          <p className="text-[11px] text-surface-600">
            Best model auto-selected per agent type. Customize after adding.
          </p>
          <button
            onClick={onCustom}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-800 border border-surface-700 text-sm text-surface-500 hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Start from Scratch
          </button>
        </div>
      </div>
    </div>
  );
}
