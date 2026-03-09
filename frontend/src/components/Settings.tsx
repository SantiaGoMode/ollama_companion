import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AppSettings, AgentType, SystemInfo } from '../types/agent';
import { AGENT_TYPES } from '../types/agent';
import { useStore } from '../store/useStore';
import { MODEL_CATALOG, type CatalogModel, type ModelTier } from '../data/modelCatalog';
import { isEmbeddingModel } from '../utils/modelSelection';
import { getHiddenModels, toggleModelHidden } from '../utils/hiddenModels';

type SettingsTab = 'connection' | 'models' | 'defaults' | 'application';

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'connection', label: 'Ollama Connection', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { id: 'models', label: 'Model Management', icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
  { id: 'defaults', label: 'Agent Defaults', icon: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { id: 'application', label: 'Application', icon: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6' },
];

const CAPABILITY_LABELS: Record<string, { label: string; color: string }> = {
  chat: { label: 'Chat', color: '#22d3ee' },
  code: { label: 'Code', color: '#8b5cf6' },
  reasoning: { label: 'Reasoning', color: '#f59e0b' },
  summarizer: { label: 'Summarize', color: '#f59e0b' },
  transformer: { label: 'Transform', color: '#10b981' },
  generator: { label: 'Generate', color: '#f43f5e' },
  file: { label: 'File/Vision', color: '#3b82f6' },
  embedding: { label: 'Embedding', color: '#6b7280' },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function ConnectionTab({ settings, onUpdate }: { settings: AppSettings; onUpdate: (s: Partial<AppSettings>) => void }) {
  const { ollamaStatus, checkOllamaStatus } = useStore();
  const [host, setHost] = useState(settings.ollama_host || 'http://localhost:11434');
  const [interval, setInterval_] = useState(settings.auto_reconnect_interval || '30');
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    onUpdate({ ollama_host: host, auto_reconnect_interval: interval });
    await checkOllamaStatus();
    setTesting(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-1 font-[family-name:var(--font-display)]">Connection Status</h3>
        <p className="text-xs text-surface-500 mb-4">Configure how Agent Hub connects to your Ollama instance</p>

        <div className="glass noise rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${ollamaStatus === 'connected' ? 'bg-accent-emerald status-pulse' : ollamaStatus === 'checking' ? 'bg-accent-amber status-pulse' : 'bg-accent-rose'}`} />
            <div>
              <p className="text-sm font-medium text-slate-200">
                {ollamaStatus === 'connected' ? 'Connected' : ollamaStatus === 'checking' ? 'Checking...' : 'Disconnected'}
              </p>
              <p className="text-xs text-surface-500">{host}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Ollama Host URL</label>
            <div className="flex gap-2">
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors placeholder:text-surface-600 font-mono"
              />
              <button
                onClick={testConnection}
                disabled={testing}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-accent-cyan text-sm font-medium hover:from-accent-cyan/25 hover:to-accent-blue/25 hover:border-accent-cyan/40 transition-all cursor-pointer disabled:opacity-40"
              >
                {testing ? 'Testing...' : 'Test'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Auto-reconnect Interval (seconds)</label>
            <input
              type="number"
              value={interval}
              onChange={(e) => {
                setInterval_(e.target.value);
                onUpdate({ auto_reconnect_interval: e.target.value });
              }}
              min="5"
              max="300"
              className="w-32 px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const TIER_META: Record<ModelTier, { label: string; color: string; ram: string }> = {
  small: { label: 'Small', color: '#22d3ee', ram: '4-8 GB' },
  medium: { label: 'Medium', color: '#f59e0b', ram: '8-16 GB' },
  large: { label: 'Large', color: '#f43f5e', ram: '16-32 GB' },
};

function ModelsTab() {
  const { models, fetchModels, addToast } = useStore();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loadingSystem, setLoadingSystem] = useState(true);
  const [tierFilter, setTierFilter] = useState<ModelTier | 'all' | 'installed'>('all');
  const [pullingModels, setPullingModels] = useState<Record<string, { progress: number; status: string }>>({});
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(getHiddenModels);

  const handleToggleHidden = (name: string) => {
    const updated = toggleModelHidden(name);
    setHiddenModels(new Set(updated));
  };

  useEffect(() => {
    (async () => {
      try {
        const info = await api.ollama.systemInfo();
        setSystemInfo(info);
      } catch {
        addToast('Could not detect system info', 'warning');
      } finally {
        setLoadingSystem(false);
      }
    })();
  }, [addToast]);

  const installedNames = new Set(models.map((m) => m.name));

  const isModelInstalled = (catalogName: string) => {
    if (installedNames.has(catalogName)) return true;
    const base = catalogName.split(':')[0];
    for (const name of installedNames) {
      if (name === base || name.startsWith(base + ':')) return true;
    }
    return false;
  };

  const compatibleModels = systemInfo
    ? MODEL_CATALOG.filter((m) => m.minRAMGB <= systemInfo.ram_gb)
    : MODEL_CATALOG;

  const filteredModels = tierFilter === 'all'
    ? compatibleModels
    : tierFilter === 'installed'
      ? compatibleModels.filter((m) => isModelInstalled(m.name))
      : compatibleModels.filter((m) => m.tier === tierFilter);

  const installModel = async (catalogModel: CatalogModel) => {
    const name = catalogModel.name;
    setPullingModels((prev) => ({ ...prev, [name]: { progress: 0, status: 'Starting...' } }));
    try {
      for await (const event of api.ollama.pullModel(name)) {
        if (event.error) {
          addToast(`Failed to install ${catalogModel.displayName}: ${event.error}`, 'error');
          setPullingModels((prev) => {
            const next = { ...prev };
            delete next[name];
            return next;
          });
          return;
        }
        const progress = event.total && event.total > 0
          ? Math.round((event.completed || 0) / event.total * 100)
          : 0;
        setPullingModels((prev) => ({ ...prev, [name]: { progress, status: event.status } }));

        if (event.status === 'success') {
          setPullingModels((prev) => {
            const next = { ...prev };
            delete next[name];
            return next;
          });
          addToast(`${catalogModel.displayName} installed successfully`, 'success');
          await fetchModels();
          try { await api.settings.syncModels(); } catch { /* best effort */ }
          return;
        }
      }
      // Stream ended without explicit success
      setPullingModels((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      await fetchModels();
      try { await api.settings.syncModels(); } catch { /* best effort */ }
      addToast(`${catalogModel.displayName} installed`, 'success');
    } catch (err) {
      setPullingModels((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      addToast(`Failed to install ${catalogModel.displayName}: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  };

  const deleteModel = async (catalogModel: CatalogModel) => {
    const name = catalogModel.name;
    setDeletingModels((prev) => new Set(prev).add(name));
    try {
      // Try exact name first, then find the installed variant
      let deleteName = name;
      if (!installedNames.has(name)) {
        const base = name.split(':')[0];
        const match = [...installedNames].find((n) => n === base || n.startsWith(base + ':'));
        if (match) deleteName = match;
      }
      await api.ollama.deleteModel(deleteName);
      addToast(`${catalogModel.displayName} removed`, 'success');
      await fetchModels();
    } catch (err) {
      addToast(`Failed to remove ${catalogModel.displayName}: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setDeletingModels((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  const installedCount = compatibleModels.filter((m) => isModelInstalled(m.name)).length;

  return (
    <div className="space-y-6">
      {/* System Info Banner */}
      <div className="glass noise rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3 font-[family-name:var(--font-display)]">Your System</h3>
        {loadingSystem ? (
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
            <span className="text-xs text-surface-500">Detecting hardware...</span>
          </div>
        ) : systemInfo ? (
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-[11px] text-surface-500 mb-0.5">Chip</p>
              <p className="text-sm font-medium text-slate-200">{systemInfo.chip || systemInfo.cpu_name || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-[11px] text-surface-500 mb-0.5">RAM</p>
              <p className="text-sm font-medium text-slate-200">{systemInfo.ram_gb} GB</p>
            </div>
            <div>
              <p className="text-[11px] text-surface-500 mb-0.5">GPU</p>
              <p className="text-sm font-medium text-slate-200">
                {systemInfo.gpu_name || (systemInfo.is_apple_silicon ? 'Unified (Apple Silicon)' : 'None detected')}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-surface-500 mb-0.5">Max Model Size</p>
              <p className="text-sm font-medium text-accent-cyan">{systemInfo.recommended_max_model_gb.toFixed(0)} GB</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-surface-500">Could not detect system specifications. Showing all models.</p>
        )}
      </div>

      {/* Installed Models - Visibility Control */}
      {models.filter((m) => !isEmbeddingModel(m.name)).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-1 font-[family-name:var(--font-display)]">Installed Models</h3>
          <p className="text-xs text-surface-500 mb-3">Toggle which models are available when creating agents</p>
          <div className="space-y-2">
            {models.filter((m) => !isEmbeddingModel(m.name)).map((m) => {
              const sizeGB = (m.size / (1024 * 1024 * 1024)).toFixed(1);
              const isHidden = hiddenModels.has(m.name);
              return (
                <div
                  key={m.name}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                    isHidden
                      ? 'bg-surface-900/30 border-surface-800 opacity-60'
                      : 'glass noise border-surface-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${isHidden ? 'bg-surface-600' : 'bg-accent-emerald'}`} />
                    <div>
                      <span className="text-sm font-medium text-slate-200 font-mono">{m.name}</span>
                      <span className="text-xs text-surface-500 ml-2">{sizeGB} GB</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleHidden(m.name)}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                      !isHidden ? 'bg-accent-emerald' : 'bg-surface-700'
                    }`}
                    title={isHidden ? 'Hidden from agent creation' : 'Available for agent creation'}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      !isHidden ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200 font-[family-name:var(--font-display)]">Model Catalog</h3>
          <span className="text-xs text-surface-500">
            {installedCount} of {compatibleModels.length} compatible models installed
          </span>
        </div>

        <div className="flex gap-2 mb-5">
          {([
            { id: 'all' as const, label: 'All Compatible', color: '#94a3b8' },
            { id: 'installed' as const, label: `Installed (${installedCount})`, color: '#22d3ee' },
            { id: 'small' as const, label: 'Small', color: TIER_META.small.color },
            { id: 'medium' as const, label: 'Medium', color: TIER_META.medium.color },
            { id: 'large' as const, label: 'Large', color: TIER_META.large.color },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTierFilter(tab.id)}
              className="px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border"
              style={{
                background: tierFilter === tab.id ? `${tab.color}15` : 'transparent',
                borderColor: tierFilter === tab.id ? `${tab.color}35` : 'rgba(255,255,255,0.06)',
                color: tierFilter === tab.id ? tab.color : '#4a4f6a',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Model Grid */}
      <div className="grid grid-cols-1 gap-3">
        {filteredModels.length === 0 && (
          <div className="glass noise rounded-2xl p-8 text-center">
            <p className="text-sm text-surface-500">
              {tierFilter === 'installed'
                ? 'No models installed yet. Browse the catalog and click Install.'
                : 'No compatible models found for this tier.'}
            </p>
          </div>
        )}

        {filteredModels.map((catalogModel) => {
          const installed = isModelInstalled(catalogModel.name);
          const pulling = pullingModels[catalogModel.name];
          const deleting = deletingModels.has(catalogModel.name);
          const tierMeta = TIER_META[catalogModel.tier];
          const tooLarge = systemInfo ? catalogModel.sizeGB > systemInfo.recommended_max_model_gb : false;

          return (
            <div
              key={catalogModel.name}
              className={`glass noise rounded-2xl p-5 transition-all ${installed ? 'border border-accent-cyan/15' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <h4 className="text-sm font-semibold text-slate-200">{catalogModel.displayName}</h4>
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-medium"
                      style={{ background: `${tierMeta.color}15`, color: tierMeta.color }}
                    >
                      {catalogModel.parameterCount}
                    </span>
                    {installed && (
                      <span className="px-2 py-0.5 rounded-md bg-accent-cyan/10 text-accent-cyan text-[10px] font-medium">
                        Installed
                      </span>
                    )}
                    {tooLarge && !installed && (
                      <span className="px-2 py-0.5 rounded-md bg-accent-amber/10 text-accent-amber text-[10px] font-medium">
                        May be slow
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-surface-500 mb-2.5">{catalogModel.description}</p>

                  <div className="flex items-center gap-4 text-[11px] text-surface-600">
                    <span>{catalogModel.sizeGB} GB download</span>
                    <span>Min {catalogModel.minRAMGB} GB RAM</span>
                    <span className="font-mono">{catalogModel.name}</span>
                  </div>

                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {catalogModel.capabilities.map((cap) => {
                      const capMeta = CAPABILITY_LABELS[cap];
                      return capMeta ? (
                        <span
                          key={cap}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium border"
                          style={{
                            background: `${capMeta.color}10`,
                            borderColor: `${capMeta.color}20`,
                            color: capMeta.color,
                          }}
                        >
                          {capMeta.label}
                        </span>
                      ) : null;
                    })}
                    {catalogModel.bestFor.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-surface-800 text-surface-500 border border-surface-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Quality Stars */}
                  <div className="flex items-center gap-1 mt-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill={star <= catalogModel.quality ? '#f59e0b' : 'none'}
                        stroke={star <= catalogModel.quality ? '#f59e0b' : '#2a2f45'}
                        strokeWidth="2"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="shrink-0 flex flex-col gap-2 items-end">
                  {pulling ? (
                    <div className="w-36">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-surface-500 truncate max-w-[100px]">{pulling.status}</span>
                        <span className="text-[10px] font-medium text-accent-cyan">{pulling.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-surface-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-blue transition-all duration-300"
                          style={{ width: `${pulling.progress}%` }}
                        />
                      </div>
                    </div>
                  ) : installed ? (
                    <button
                      onClick={() => deleteModel(catalogModel)}
                      disabled={deleting}
                      className="px-4 py-2 rounded-xl text-xs font-medium bg-surface-800 border border-surface-700 text-surface-500 hover:text-accent-rose hover:border-accent-rose/30 transition-all cursor-pointer disabled:opacity-40"
                    >
                      {deleting ? 'Removing...' : 'Remove'}
                    </button>
                  ) : (
                    <button
                      onClick={() => installModel(catalogModel)}
                      className="px-4 py-2 rounded-xl text-xs font-medium bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-accent-cyan hover:from-accent-cyan/25 hover:to-accent-blue/25 hover:border-accent-cyan/40 transition-all cursor-pointer"
                    >
                      Install
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DefaultsTab({ settings, onUpdate }: { settings: AppSettings; onUpdate: (s: Partial<AppSettings>) => void }) {
  const { models } = useStore();
  const [activeType, setActiveType] = useState<AgentType>('chat');

  const TYPE_LABELS: Record<AgentType, { label: string; color: string; description: string }> = {
    chat: { label: 'Chat', color: '#22d3ee', description: 'Conversational agents with message history' },
    reasoning: { label: 'Reasoning', color: '#f59e0b', description: 'Deep thinking with chain-of-thought reasoning' },
    code: { label: 'Code', color: '#8b5cf6', description: 'Code review, debugging, and refactoring' },
    summarizer: { label: 'Summarizer', color: '#f59e0b', description: 'Text and content summarization' },
    transformer: { label: 'Transformer', color: '#10b981', description: 'Format and content transformation' },
    generator: { label: 'Generator', color: '#f43f5e', description: 'Content and text generation' },
    file: { label: 'File', color: '#3b82f6', description: 'File analysis and processing' },
  };

  const config = TYPE_LABELS[activeType];
  const modelKey = `default_model_${activeType}`;
  const promptKey = `default_prompt_${activeType}`;
  const tempKey = `default_temp_${activeType}`;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-1 font-[family-name:var(--font-display)]">Agent Type Defaults</h3>
        <p className="text-xs text-surface-500 mb-4">Configure default model, system prompt, and temperature for each agent type</p>

        <div className="flex gap-2 mb-6 flex-wrap">
          {AGENT_TYPES.map((type) => {
            const t = TYPE_LABELS[type];
            return (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border"
                style={{
                  background: activeType === type ? `${t.color}15` : 'transparent',
                  borderColor: activeType === type ? `${t.color}35` : 'rgba(255,255,255,0.06)',
                  color: activeType === type ? t.color : '#4a4f6a',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="glass noise rounded-2xl p-6 space-y-5 fade-in" key={activeType}>
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${config.color}15`, border: `1px solid ${config.color}25` }}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: config.color }} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-200">{config.label} Agents</h4>
              <p className="text-xs text-surface-500">{config.description}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Default Model</label>
            <select
              value={settings[modelKey] || ''}
              onChange={(e) => onUpdate({ [modelKey]: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 appearance-none cursor-pointer"
            >
              <option value="">Auto-detect</option>
              {models.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Default System Prompt</label>
            <textarea
              value={settings[promptKey] || ''}
              onChange={(e) => onUpdate({ [promptKey]: e.target.value })}
              rows={5}
              className="w-full px-4 py-3 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors resize-none leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">
              Default Temperature: <span className="text-slate-300">{settings[tempKey] || '0.7'}</span>
            </label>
            <input
              type="range"
              value={settings[tempKey] || '0.7'}
              onChange={(e) => onUpdate({ [tempKey]: e.target.value })}
              min="0"
              max="2"
              step="0.1"
              className="w-full accent-accent-cyan"
            />
            <div className="flex justify-between text-[10px] text-surface-600 mt-1">
              <span>Precise (0)</span>
              <span>Balanced (0.7)</span>
              <span>Creative (2.0)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicationTab({ settings, onUpdate }: { settings: AppSettings; onUpdate: (s: Partial<AppSettings>) => void }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-1 font-[family-name:var(--font-display)]">Application Settings</h3>
        <p className="text-xs text-surface-500 mb-4">General application preferences</p>

        <div className="glass noise rounded-2xl p-6 space-y-6">
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-2">Grid Density</label>
            <div className="flex gap-2">
              {['compact', 'comfortable', 'spacious'].map((d) => (
                <button
                  key={d}
                  onClick={() => onUpdate({ grid_density: d })}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                    settings.grid_density === d
                      ? 'bg-accent-cyan/15 border-accent-cyan/30 text-accent-cyan'
                      : 'bg-surface-900 border-surface-700 text-surface-500 hover:border-surface-600'
                  }`}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-2">Conversation Persistence</label>
            <div className="flex gap-2">
              {[
                { value: 'keep', label: 'Keep History', desc: 'Conversations persist across sessions' },
                { value: 'clear', label: 'Clear on Close', desc: 'Start fresh each session' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onUpdate({ conversation_persistence: opt.value })}
                  className={`px-4 py-3 rounded-xl text-left transition-all cursor-pointer border flex-1 ${
                    settings.conversation_persistence === opt.value
                      ? 'bg-accent-cyan/10 border-accent-cyan/25'
                      : 'bg-surface-900 border-surface-700 hover:border-surface-600'
                  }`}
                >
                  <span className={`block text-xs font-medium ${settings.conversation_persistence === opt.value ? 'text-accent-cyan' : 'text-surface-500'}`}>
                    {opt.label}
                  </span>
                  <span className="block text-[11px] text-surface-600 mt-0.5">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Max Conversation Length (messages)</label>
            <input
              type="number"
              value={settings.max_conversation_length || '100'}
              onChange={(e) => onUpdate({ max_conversation_length: e.target.value })}
              min="10"
              max="500"
              className="w-32 px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors"
            />
            <p className="text-[11px] text-surface-600 mt-1">Older messages will be trimmed when this limit is reached</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-2">Theme</label>
            <div className="flex gap-2">
              {[
                { value: 'dark', label: 'Dark' },
                { value: 'midnight', label: 'Midnight' },
                { value: 'dim', label: 'Dim' },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => onUpdate({ theme: t.value })}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                    settings.theme === t.value
                      ? 'bg-accent-cyan/15 border-accent-cyan/30 text-accent-cyan'
                      : 'bg-surface-900 border-surface-700 text-surface-500 hover:border-surface-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SettingsTab>('connection');
  const [settings, setSettings] = useState<AppSettings>({
    ollama_host: 'http://localhost:11434',
    auto_reconnect_interval: '30',
    grid_density: 'comfortable',
    conversation_persistence: 'keep',
    max_conversation_length: '100',
    theme: 'dark',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.settings.get().then(setSettings).catch(() => {});
  }, []);

  const handleUpdate = useCallback(async (partial: Partial<AppSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    setSaving(true);
    setSaved(false);
    try {
      await api.settings.update(partial);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  return (
    <div className="min-h-screen bg-surface-950">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent-cyan/[0.02] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent-violet/[0.02] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10">
        <header className="glass sticky top-0 z-50 px-8 py-5">
          <div className="flex items-center justify-between max-w-[1200px] mx-auto">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-800 hover:bg-surface-700 transition-colors cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5"/>
                  <path d="M12 19l-7-7 7-7"/>
                </svg>
              </button>
              <div>
                <h1 className="text-lg font-semibold tracking-tight font-[family-name:var(--font-display)]">Settings</h1>
                <p className="text-xs text-surface-500">Configure your Agent Hub</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {saved && (
                <span className="text-xs text-accent-emerald fade-in">Saved</span>
              )}
              {saving && (
                <span className="text-xs text-surface-500">Saving...</span>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-[1200px] mx-auto px-8 py-8">
          <div className="flex gap-8">
            <nav className="w-56 shrink-0">
              <div className="sticky top-28 space-y-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium transition-all cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/15'
                        : 'text-surface-500 hover:text-slate-300 hover:bg-surface-800/50 border border-transparent'
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={tab.icon} />
                    </svg>
                    {tab.label}
                  </button>
                ))}
              </div>
            </nav>

            <div className="flex-1 min-w-0">
              {activeTab === 'connection' && <ConnectionTab settings={settings} onUpdate={handleUpdate} />}
              {activeTab === 'models' && <ModelsTab />}
              {activeTab === 'defaults' && <DefaultsTab settings={settings} onUpdate={handleUpdate} />}
              {activeTab === 'application' && <ApplicationTab settings={settings} onUpdate={handleUpdate} />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
