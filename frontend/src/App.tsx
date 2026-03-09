import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useStore } from './store/useStore';
import { api } from './api/client';
import { Header } from './components/Header';
import { AgentCard } from './components/AgentCard';
import { AgentPanel } from './components/AgentPanel';
import { AgentFormModal } from './components/AgentFormModal';
import { AgentLibrary } from './components/AgentLibrary';
import { Toaster } from './components/Toaster';
import { pickModelForType } from './utils/modelSelection';
import type { AgentPreset } from './data/presets';
import type { Agent, AgentType, ModelCapability } from './types/agent';

const PINNED_KEY = 'agent-hub-pinned';
const ORDER_KEY = 'agent-hub-order';

function loadPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function savePinned(ids: Set<string>) {
  localStorage.setItem(PINNED_KEY, JSON.stringify([...ids]));
}

const TYPE_LABELS: Record<AgentType | 'all', string> = {
  all: 'All',
  chat: 'Chat',
  code: 'Code',
  reasoning: 'Reasoning',
  summarizer: 'Summarizer',
  transformer: 'Transformer',
  generator: 'Generator',
  file: 'File',
};

function App() {
  const {
    agents,
    selectedAgent,
    editingAgent,
    showCreateModal,
    models,
    isLoadingAgents,
    fetchAgents,
    fetchModels,
    checkOllamaStatus,
    setShowCreateModal,
    setEditingAgent,
    addAgent,
    addToast,
  } = useStore();

  const [showForm, setShowForm] = useState(false);
  const [prefilledAgent, setPrefilledAgent] = useState<Partial<Agent> | null>(null);
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapability[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<AgentType | 'all'>('all');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(loadPinned);
  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(ORDER_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const searchRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    fetchAgents();
    fetchModels();
    checkOllamaStatus();
    api.settings.getModelCapabilities()
      .then(setModelCapabilities)
      .catch(() => {});

    const interval = setInterval(checkOllamaStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchAgents, fetchModels, checkOllamaStatus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (meta && e.key === 'n') {
        e.preventDefault();
        setShowCreateModal(true);
      }
      if (e.key === 'Escape') {
        if (showForm) { setShowForm(false); setPrefilledAgent(null); }
        else if (showCreateModal) setShowCreateModal(false);
        else if (editingAgent) setEditingAgent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showForm, showCreateModal, editingAgent, setShowCreateModal, setEditingAgent]);

  const handleSelectPreset = useCallback((preset: AgentPreset) => {
    const bestModel = pickModelForType(preset.agent_type, models, modelCapabilities);

    setPrefilledAgent({
      name: preset.name,
      description: preset.description,
      agent_type: preset.agent_type,
      model: bestModel,
      system_prompt: preset.system_prompt,
      color: preset.color,
    });
    setShowCreateModal(false);
    setShowForm(true);
  }, [modelCapabilities, models, setShowCreateModal]);

  const handleCustom = () => {
    setPrefilledAgent(null);
    setShowCreateModal(false);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setPrefilledAgent(null);
  };

  const handleTogglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      savePinned(next);
      return next;
    });
  }, []);

  const handleClone = useCallback(async (agent: Agent) => {
    try {
      await addAgent({
        name: `${agent.name} (copy)`,
        description: agent.description,
        agent_type: agent.agent_type,
        model: agent.model,
        system_prompt: agent.system_prompt,
        color: agent.color,
        tools_enabled: agent.tools_enabled,
        allowed_directories: agent.allowed_directories,
        confirmation_mode: agent.confirmation_mode,
        allowed_commands: agent.allowed_commands,
      });
    } catch {
      addToast('Failed to clone agent', 'error');
    }
  }, [addAgent, addToast]);

  const handleExport = useCallback((agent: Agent) => {
    const exportData = {
      name: agent.name,
      description: agent.description,
      agent_type: agent.agent_type,
      model: agent.model,
      system_prompt: agent.system_prompt,
      color: agent.color,
      tools_enabled: agent.tools_enabled,
      allowed_directories: agent.allowed_directories,
      confirmation_mode: agent.confirmation_mode,
      allowed_commands: agent.allowed_commands,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent.name.toLowerCase().replace(/\s+/g, '-')}.agent.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`Exported "${agent.name}"`, 'success');
  }, [addToast]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.name || !data.agent_type) {
          addToast('Invalid agent file: missing name or type', 'error');
          return;
        }
        setPrefilledAgent(data);
        setShowForm(true);
      } catch {
        addToast('Failed to parse agent file', 'error');
      }
    };
    input.click();
  }, [addToast]);

  const filteredAgents = useMemo(() => {
    let result = agents;

    if (typeFilter !== 'all') {
      result = result.filter(a => a.agent_type === typeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q)
      );
    }

    const orderMap = new Map<string, number>();
    if (customOrder.length > 0) {
      customOrder.forEach((id, i) => orderMap.set(id, i));
    } else {
      result.forEach((a, i) => orderMap.set(a.id, a.sort_order ?? i));
    }

    result = [...result].sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 0 : 1;
      const bPinned = pinnedIds.has(b.id) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999);
    });

    return result;
  }, [agents, typeFilter, searchQuery, pinnedIds, customOrder]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredAgents.findIndex(a => a.id === active.id);
    const newIndex = filteredAgents.findIndex(a => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...filteredAgents];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const newOrder = reordered.map(a => a.id);
    setCustomOrder(newOrder);
    localStorage.setItem(ORDER_KEY, JSON.stringify(newOrder));
    api.agents.reorder(newOrder).catch(() => {});
  }, [filteredAgents]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: agents.length };
    for (const a of agents) {
      counts[a.agent_type] = (counts[a.agent_type] || 0) + 1;
    }
    return counts;
  }, [agents]);

  return (
    <div className="min-h-screen bg-surface-950">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent-cyan/[0.02] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent-violet/[0.02] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="max-w-[1600px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {isLoadingAgents ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="glass noise rounded-2xl p-6 animate-pulse">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-surface-700/50" />
                    <div className="flex-1">
                      <div className="h-4 w-32 rounded-lg bg-surface-700/50 mb-2" />
                      <div className="h-5 w-16 rounded-md bg-surface-700/30" />
                    </div>
                  </div>
                  <div className="h-3 w-full rounded bg-surface-700/30 mb-2" />
                  <div className="h-3 w-2/3 rounded bg-surface-700/30 mb-4" />
                  <div className="flex justify-between">
                    <div className="h-3 w-24 rounded bg-surface-700/20" />
                    <div className="h-3 w-12 rounded bg-surface-700/20" />
                  </div>
                </div>
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 sm:py-32">
              <div className="w-20 h-20 rounded-2xl glass flex items-center justify-center mb-6">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-surface-600">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-surface-500 mb-2 font-[family-name:var(--font-display)]">
                No agents yet
              </h2>
              <p className="text-sm text-surface-600 mb-2">Create your first AI agent to get started</p>
              <p className="text-xs text-surface-600 mb-6">
                Press <kbd className="px-1.5 py-0.5 rounded bg-surface-800 border border-surface-700 text-[10px] font-mono">Cmd+N</kbd> or click below
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-sm font-medium text-white hover:brightness-110 transition-all cursor-pointer"
              >
                Create Agent
              </button>
            </div>
          ) : (
            <>
              {/* Search & Filter Toolbar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
                <div className="relative w-full sm:w-72">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-600 pointer-events-none"
                    width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search agents...  (Cmd+K)"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-900 border border-surface-700 text-sm text-slate-200 placeholder:text-surface-600 focus:outline-none focus:border-accent-cyan/40 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-600 hover:text-slate-300 cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(Object.keys(TYPE_LABELS) as (AgentType | 'all')[]).map(type => {
                    const count = typeCounts[type] || 0;
                    if (type !== 'all' && count === 0) return null;
                    const isActive = typeFilter === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setTypeFilter(type)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          isActive
                            ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/25'
                            : 'bg-surface-900 text-surface-500 border border-surface-700 hover:text-slate-300 hover:border-surface-600'
                        }`}
                      >
                        {TYPE_LABELS[type]}
                        {count > 0 && (
                          <span className={`ml-1.5 ${isActive ? 'text-accent-cyan/60' : 'text-surface-600'}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {(searchQuery || typeFilter !== 'all') && (
                    <span className="text-xs text-surface-600">
                      {filteredAgents.length} of {agents.length}
                    </span>
                  )}
                  <button
                    onClick={handleImport}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-900 border border-surface-700 text-surface-500 hover:text-slate-300 hover:border-surface-600 transition-all cursor-pointer flex items-center gap-1.5"
                    title="Import agent from JSON file"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Import
                  </button>
                </div>
              </div>

              {filteredAgents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-surface-600 mb-3">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <p className="text-sm text-surface-500">No agents match your search</p>
                  <button
                    onClick={() => { setSearchQuery(''); setTypeFilter('all'); }}
                    className="mt-3 text-xs text-accent-cyan hover:text-accent-cyan/80 cursor-pointer"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={filteredAgents.map(a => a.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                      {filteredAgents.map((agent, i) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          index={i}
                          isPinned={pinnedIds.has(agent.id)}
                          onTogglePin={handleTogglePin}
                          onClone={handleClone}
                          onExport={handleExport}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </>
          )}
        </main>
      </div>

      {selectedAgent && <AgentPanel />}

      {showCreateModal && (
        <AgentLibrary
          onSelectPreset={handleSelectPreset}
          onCustom={handleCustom}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showForm && (
        <AgentFormModal
          prefill={prefilledAgent}
          onClose={handleFormClose}
        />
      )}

      {editingAgent && (
        <AgentFormModal agent={editingAgent} onClose={() => setEditingAgent(null)} />
      )}

      <Toaster />
    </div>
  );
}

export default App;
