import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';
import { pickModelForType, isEmbeddingModel } from '../utils/modelSelection';
import { getHiddenModels } from '../utils/hiddenModels';
import type { Agent, AgentType, ConfirmationMode, KnowledgeBase, MCPServer } from '../types/agent';

const AGENT_TYPE_OPTIONS: { value: AgentType; label: string; description: string }[] = [
  { value: 'chat', label: 'Chat', description: 'Conversational agent with message history' },
  { value: 'reasoning', label: 'Reasoning', description: 'Step-by-step thinking with chain-of-thought' },
  { value: 'summarizer', label: 'Summarizer', description: 'Summarize text, articles, or URLs' },
  { value: 'code', label: 'Code', description: 'Review, debug, or refactor code' },
  { value: 'file', label: 'File', description: 'Process and analyze uploaded files' },
  { value: 'generator', label: 'Generator', description: 'Generate content from parameters' },
  { value: 'transformer', label: 'Transformer', description: 'Transform text between formats' },
];

const COLORS = [
  '#22d3ee', '#3b82f6', '#8b5cf6', '#f43f5e',
  '#f59e0b', '#10b981', '#ec4899', '#f97316',
];

interface Props {
  agent?: Agent | null;
  prefill?: Partial<Agent> | null;
  onClose: () => void;
}

export function AgentFormModal({ agent, prefill, onClose }: Props) {
  const { addAgent, updateAgent, models } = useStore();
  const isEditing = !!agent;
  const source = agent || prefill;

  const [name, setName] = useState(source?.name || '');
  const [description, setDescription] = useState(source?.description || '');
  const initialType = source?.agent_type || 'chat';
  const [agentType, setAgentType] = useState<AgentType>(initialType);
  const [model, setModel] = useState(() => {
    // For editing, keep the existing model
    if (agent) return agent.model;
    // For prefill or new, auto-pick from available models
    if (source?.model) {
      // Verify the prefilled model exists in the available list
      const exists = models.find((m) => m.name === source.model);
      if (exists) return exists.name;
    }
    return pickModelForType(initialType, models);
  });
  const [systemPrompt, setSystemPrompt] = useState(source?.system_prompt || 'You are a helpful assistant.');
  const [color, setColor] = useState(source?.color || COLORS[0]);
  const [toolsEnabled, setToolsEnabled] = useState(source?.tools_enabled || false);
  const [allowedDirs, setAllowedDirs] = useState<string[]>(source?.allowed_directories || []);
  const [dirInput, setDirInput] = useState('');
  const [confirmationMode, setConfirmationMode] = useState<ConfirmationMode>(source?.confirmation_mode || 'confirm');
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKBs, setSelectedKBs] = useState<string[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [selectedMCPs, setSelectedMCPs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Auto-pick model when agent type changes (not for editing)
  const handleTypeChange = (type: AgentType) => {
    setAgentType(type);
    if (!isEditing) {
      setModel(pickModelForType(type, models));
    }
  };

  useEffect(() => {
    api.knowledge.list().then(setKnowledgeBases).catch(() => {});
    api.mcp.servers.list().then(setMcpServers).catch(() => {});
    if (agent) {
      api.knowledge.getAgentKBs(agent.id)
        .then((kbs) => setSelectedKBs(kbs.map((kb) => kb.id)))
        .catch(() => {});
      api.mcp.agents.linkedIds(agent.id)
        .then(setSelectedMCPs)
        .catch(() => {});
    }
  }, [agent]);

  const addDir = () => {
    const dir = dirInput.trim();
    if (dir && !allowedDirs.includes(dir)) {
      setAllowedDirs([...allowedDirs, dir]);
      setDirInput('');
    }
  };

  const removeDir = (dir: string) => {
    setAllowedDirs(allowedDirs.filter((d) => d !== dir));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        description,
        agent_type: agentType,
        model,
        system_prompt: systemPrompt,
        color,
        tools_enabled: toolsEnabled,
        allowed_directories: allowedDirs,
        confirmation_mode: confirmationMode,
      };

      let agentId: string;

      if (isEditing && agent) {
        const updated = await updateAgent(agent.id, data);
        agentId = updated.id;
      } else {
        const created = await addAgent(data);
        agentId = created.id;
      }

      if (selectedKBs.length > 0) {
        await api.knowledge.linkAgent(agentId, selectedKBs);
      }
      await api.mcp.agents.link(agentId, selectedMCPs);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="fade-in relative glass noise rounded-3xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-xl font-semibold tracking-tight mb-6 font-[family-name:var(--font-display)]">
          {isEditing ? 'Edit Agent' : 'Create Agent'}
        </h2>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Code Reviewer"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors placeholder:text-surface-600"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors placeholder:text-surface-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-2">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {AGENT_TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleTypeChange(t.value)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    agentType === t.value
                      ? 'bg-accent-cyan/15 border-accent-cyan/30 text-accent-cyan border'
                      : 'bg-surface-900 border border-surface-700 text-surface-500 hover:border-surface-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-surface-600 mt-1.5">
              {AGENT_TYPE_OPTIONS.find((t) => t.value === agentType)?.description}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Model</label>
            {(() => {
              const hidden = getHiddenModels();
              const usableModels = models.filter((m) => !isEmbeddingModel(m.name) && !hidden.has(m.name));
              return usableModels.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors appearance-none cursor-pointer"
                >
                  {usableModels.map((m) => {
                    const sizeGB = (m.size / (1024 * 1024 * 1024)).toFixed(1);
                    return (
                      <option key={m.name} value={m.name}>
                        {m.name} ({sizeGB} GB)
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="px-4 py-3 rounded-xl bg-surface-900 border border-accent-amber/30 text-xs text-accent-amber">
                  No models available. Install models from the Settings page, or unhide disabled models.
                </div>
              );
            })()}
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              className="w-full px-4 py-3 rounded-xl bg-surface-900 border border-surface-700 text-sm leading-relaxed focus:outline-none focus:border-accent-cyan/50 transition-colors resize-y placeholder:text-surface-600 min-h-[120px]"
              placeholder="Describe how this agent should behave..."
            />
            <p className="text-[10px] text-surface-600 mt-1">{systemPrompt.length} characters</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-2">Color</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg transition-all cursor-pointer ${
                    color === c ? 'ring-2 ring-offset-2 ring-offset-surface-900 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ background: c, ringColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Knowledge Bases */}
          {knowledgeBases.length > 0 && (
            <div className="pt-3 border-t border-white/5">
              <label className="block text-xs font-medium text-slate-200 mb-1">Knowledge Bases</label>
              <p className="text-[11px] text-surface-600 mb-2">Attach knowledge bases for RAG-powered responses</p>
              <div className="space-y-1.5">
                {knowledgeBases.map((kb) => {
                  const selected = selectedKBs.includes(kb.id);
                  return (
                    <button
                      key={kb.id}
                      type="button"
                      onClick={() => setSelectedKBs(
                        selected ? selectedKBs.filter((id) => id !== kb.id) : [...selectedKBs, kb.id]
                      )}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                        selected
                          ? 'bg-accent-violet/10 border-accent-violet/25'
                          : 'bg-surface-900 border-surface-700 hover:border-surface-600'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        selected ? 'bg-accent-violet border-accent-violet' : 'border-surface-600'
                      }`}>
                        {selected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className={`block text-xs font-medium ${selected ? 'text-accent-violet' : 'text-surface-500'}`}>
                          {kb.name}
                        </span>
                        <span className="block text-[10px] text-surface-600">{kb.chunk_count} chunks &middot; {kb.document_count} sources</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* MCP Integrations */}
          {mcpServers.length > 0 && (
            <div className="pt-3 border-t border-white/5">
              <label className="block text-xs font-medium text-slate-200 mb-1">Integrations (MCP)</label>
              <p className="text-[11px] text-surface-600 mb-2">Connect external tools and services to this agent</p>
              <div className="space-y-1.5">
                {mcpServers.filter((s) => s.enabled).map((server) => {
                  const selected = selectedMCPs.includes(server.id);
                  return (
                    <button
                      key={server.id}
                      type="button"
                      onClick={() => setSelectedMCPs(
                        selected ? selectedMCPs.filter((id) => id !== server.id) : [...selectedMCPs, server.id]
                      )}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                        selected
                          ? 'bg-accent-cyan/10 border-accent-cyan/25'
                          : 'bg-surface-900 border-surface-700 hover:border-surface-600'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        selected ? 'bg-accent-cyan border-accent-cyan' : 'border-surface-600'
                      }`}>
                        {selected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                        style={{ background: server.color }}
                      >
                        {server.icon || server.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className={`block text-xs font-medium ${selected ? 'text-accent-cyan' : 'text-surface-500'}`}>
                          {server.name}
                        </span>
                        <span className="block text-[10px] text-surface-600 truncate">{server.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tools Configuration */}
          <div className="pt-3 border-t border-white/5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-200">Computer Actions</label>
                <p className="text-[11px] text-surface-600 mt-0.5">Allow this agent to read/write files and run commands</p>
              </div>
              <button
                type="button"
                onClick={() => setToolsEnabled(!toolsEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                  toolsEnabled ? 'bg-accent-emerald' : 'bg-surface-700'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    toolsEnabled ? 'translate-x-5.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {toolsEnabled && (
              <div className="space-y-4 fade-in">
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1.5">Allowed Directories</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={dirInput}
                      onChange={(e) => setDirInput(e.target.value)}
                      placeholder="/path/to/project"
                      className="flex-1 px-3 py-2 rounded-lg bg-surface-900 border border-surface-700 text-xs font-mono focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addDir();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={addDir}
                      className="px-3 py-2 rounded-lg bg-surface-800 border border-surface-700 text-xs text-surface-500 hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                  {allowedDirs.length === 0 && (
                    <p className="text-[11px] text-accent-amber">Add at least one directory for the agent to access</p>
                  )}
                  <div className="space-y-1">
                    {allowedDirs.map((dir) => (
                      <div
                        key={dir}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-900/50 border border-surface-700"
                      >
                        <span className="text-xs font-mono text-surface-500 truncate">{dir}</span>
                        <button
                          type="button"
                          onClick={() => removeDir(dir)}
                          className="ml-2 text-surface-600 hover:text-accent-rose transition-colors cursor-pointer shrink-0"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-2">Execution Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmationMode('confirm')}
                      className={`px-3 py-3 rounded-xl text-left transition-all cursor-pointer border ${
                        confirmationMode === 'confirm'
                          ? 'bg-accent-amber/10 border-accent-amber/25'
                          : 'bg-surface-900 border-surface-700 hover:border-surface-600'
                      }`}
                    >
                      <span className={`block text-xs font-medium ${confirmationMode === 'confirm' ? 'text-accent-amber' : 'text-surface-500'}`}>
                        Confirm Actions
                      </span>
                      <span className="block text-[10px] text-surface-600 mt-0.5">
                        Approve writes and commands before execution
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmationMode('auto')}
                      className={`px-3 py-3 rounded-xl text-left transition-all cursor-pointer border ${
                        confirmationMode === 'auto'
                          ? 'bg-accent-rose/10 border-accent-rose/25'
                          : 'bg-surface-900 border-surface-700 hover:border-surface-600'
                      }`}
                    >
                      <span className={`block text-xs font-medium ${confirmationMode === 'auto' ? 'text-accent-rose' : 'text-surface-500'}`}>
                        Auto-Execute
                      </span>
                      <span className="block text-[10px] text-surface-600 mt-0.5">
                        Agent runs actions automatically (use with caution)
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-sm text-surface-500 hover:bg-surface-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving || (toolsEnabled && allowedDirs.length === 0) || models.filter((m) => !isEmbeddingModel(m.name)).length === 0}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-sm font-medium text-white disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer"
          >
            {saving ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create Agent')}
          </button>
        </div>
      </form>
    </div>
  );
}
