import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useStore } from '../store/useStore';
import type { MCPServer, MCPTool } from '../types/agent';
import {
  INTEGRATION_CATALOG,
  CATEGORY_LABELS,
  type IntegrationPreset,
  type IntegrationCategory,
} from '../data/integrationCatalog';

// ─── SERVER FORM MODAL ──────────────────────────────────────

function ServerFormModal({
  server,
  preset,
  onSave,
  onClose,
}: {
  server?: MCPServer;
  preset?: IntegrationPreset;
  onSave: (data: Partial<MCPServer>) => Promise<void>;
  onClose: () => void;
}) {
  const source = server || preset;
  const [name, setName] = useState(server?.name || preset?.name || '');
  const [description, setDescription] = useState(server?.description || preset?.description || '');
  const [transport, setTransport] = useState<'stdio' | 'sse'>(server?.transport || preset?.transport || 'stdio');
  const [command, setCommand] = useState(server?.command || preset?.command || '');
  const [args, setArgs] = useState((server?.args || preset?.args || []).join(' '));
  const [url, setUrl] = useState(server?.url || '');
  const [icon, setIcon] = useState(server?.icon || preset?.icon || '');
  const [color, setColor] = useState(server?.color || preset?.color || '#6366f1');
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>(() => {
    if (server?.env && Object.keys(server.env).length > 0) {
      return Object.entries(server.env).map(([key, value]) => ({ key, value }));
    }
    if (preset?.envKeys) {
      return preset.envKeys.map((e) => ({ key: e.key, value: '' }));
    }
    return [];
  });
  const [saving, setSaving] = useState(false);

  const updateEnv = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...envPairs];
    next[index] = { ...next[index], [field]: val };
    setEnvPairs(next);
  };

  const addEnvPair = () => setEnvPairs([...envPairs, { key: '', value: '' }]);
  const removeEnvPair = (i: number) => setEnvPairs(envPairs.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const env: Record<string, string> = {};
    for (const pair of envPairs) {
      if (pair.key.trim() && pair.value.trim()) {
        env[pair.key.trim()] = pair.value.trim();
      }
    }

    // For sqlite, append the db path to args
    let finalArgs = args.split(/\s+/).filter(Boolean);
    if (preset?.id === 'sqlite' && env.SQLITE_DB_PATH) {
      finalArgs = [...(preset.args || []), env.SQLITE_DB_PATH];
      delete env.SQLITE_DB_PATH;
    }
    // For filesystem, append allowed dirs to args
    if (preset?.id === 'filesystem' && env.FILESYSTEM_ALLOWED_DIRS) {
      const dirs = env.FILESYSTEM_ALLOWED_DIRS.split(',').map((d) => d.trim());
      finalArgs = [...(preset.args || []), ...dirs];
      delete env.FILESYSTEM_ALLOWED_DIRS;
    }

    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        transport,
        command: transport === 'stdio' ? command.trim() : null,
        args: transport === 'stdio' ? finalArgs : [],
        env,
        url: transport === 'sse' ? url.trim() : null,
        icon,
        color,
        enabled: true,
        preset_id: preset?.id || server?.preset_id || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Get env key metadata from preset
  const getEnvMeta = (key: string) => preset?.envKeys?.find((e) => e.key === key);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[80vh] overflow-y-auto glass noise rounded-3xl p-8 fade-in">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {icon && (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white"
                style={{ background: color }}
              >
                {icon}
              </div>
            )}
            <h2 className="text-lg font-semibold text-slate-200 font-[family-name:var(--font-display)]">
              {server ? 'Edit Integration' : preset ? `Add ${preset.name}` : 'Custom MCP Server'}
            </h2>
          </div>
          <button onClick={onClose} className="text-surface-500 hover:text-slate-200 transition-colors cursor-pointer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors"
            />
          </div>

          {/* Transport */}
          {!preset && (
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1.5">Transport</label>
              <div className="flex gap-2">
                {(['stdio', 'sse'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTransport(t)}
                    className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                      transport === t
                        ? 'bg-accent-cyan/15 border-accent-cyan/30 text-accent-cyan'
                        : 'bg-surface-900 border-surface-700 text-surface-500'
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Command & Args (stdio) */}
          {transport === 'stdio' && (
            <>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1.5">Command</label>
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx, uvx, python, node..."
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors font-mono placeholder:text-surface-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1.5">Arguments</label>
                <input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-github"
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors font-mono placeholder:text-surface-600"
                />
              </div>
            </>
          )}

          {/* URL (SSE) */}
          {transport === 'sse' && (
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1.5">Server URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://mcp-server.example.com/sse"
                className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors font-mono placeholder:text-surface-600"
              />
            </div>
          )}

          {/* Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-surface-500">Environment Variables</label>
              <button
                onClick={addEnvPair}
                className="text-[11px] text-accent-cyan hover:text-accent-cyan/80 transition-colors cursor-pointer"
              >
                + Add Variable
              </button>
            </div>
            <div className="space-y-2">
              {envPairs.map((pair, i) => {
                const meta = getEnvMeta(pair.key);
                return (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1">
                      {meta ? (
                        <div className="px-4 py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-xs text-surface-400 font-mono">
                          {meta.label} <span className="text-surface-600">({pair.key})</span>
                        </div>
                      ) : (
                        <input
                          value={pair.key}
                          onChange={(e) => updateEnv(i, 'key', e.target.value)}
                          placeholder="KEY"
                          className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/50 font-mono placeholder:text-surface-600"
                        />
                      )}
                    </div>
                    <div className="flex-[2]">
                      <input
                        value={pair.value}
                        onChange={(e) => updateEnv(i, 'value', e.target.value)}
                        placeholder={meta?.placeholder || 'Value'}
                        type="password"
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/50 font-mono placeholder:text-surface-600"
                      />
                    </div>
                    {!meta?.required && (
                      <button
                        onClick={() => removeEnvPair(i)}
                        className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-surface-500 hover:text-accent-rose transition-colors cursor-pointer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Color picker (custom only) */}
          {!preset && (
            <div className="flex gap-4">
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1.5">Icon (2 letters)</label>
                <input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value.slice(0, 2).toUpperCase())}
                  maxLength={2}
                  className="w-20 px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm text-center focus:outline-none focus:border-accent-cyan/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1.5">Color</label>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-12 h-10 rounded-xl bg-surface-900 border border-surface-700 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-sm text-surface-500 hover:text-slate-200 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-accent-cyan text-sm font-medium hover:from-accent-cyan/25 hover:to-accent-blue/25 hover:border-accent-cyan/40 transition-all cursor-pointer disabled:opacity-40"
          >
            {saving ? 'Saving...' : server ? 'Update' : 'Add Integration'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TOOLS VIEWER ──────────────────────────────────────────

function ToolsViewer({
  serverId,
  serverName,
  onClose,
}: {
  serverId: string;
  serverName: string;
  onClose: () => void;
}) {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.mcp.servers.tools(serverId)
      .then((r) => setTools(r.tools))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [serverId]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[70vh] overflow-y-auto glass noise rounded-3xl p-6 fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">{serverName} Tools</h3>
          <button onClick={onClose} className="text-surface-500 hover:text-slate-200 cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-8 justify-center">
            <div className="w-4 h-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
            <span className="text-xs text-surface-500">Starting server and discovering tools...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-accent-rose/10 border border-accent-rose/20 text-xs text-accent-rose">
            {error}
          </div>
        ) : tools.length === 0 ? (
          <p className="text-xs text-surface-500 text-center py-8">No tools found.</p>
        ) : (
          <div className="space-y-2">
            {tools.map((tool) => (
              <div key={tool.name} className="p-3 rounded-xl bg-surface-900 border border-surface-800">
                <p className="text-xs font-semibold text-slate-200 font-mono">{tool.name}</p>
                <p className="text-[11px] text-surface-500 mt-0.5">{tool.description}</p>
              </div>
            ))}
            <p className="text-[10px] text-surface-600 text-center pt-2">{tools.length} tool{tools.length !== 1 ? 's' : ''} available</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── INTEGRATIONS PAGE ──────────────────────────────────────

export function Integrations() {
  const navigate = useNavigate();
  const { addToast } = useStore();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<IntegrationCategory | 'all' | 'installed'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | undefined>();
  const [selectedPreset, setSelectedPreset] = useState<IntegrationPreset | undefined>();
  const [viewingTools, setViewingTools] = useState<{ id: string; name: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, { healthy: boolean; failed_pings: number }>>({});

  const loadHealth = useCallback(async () => {
    try {
      const h = await api.mcp.health();
      setHealth(h);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  const loadServers = useCallback(async () => {
    try {
      const list = await api.mcp.servers.list();
      setServers(list);
    } catch {
      addToast('Failed to load integrations', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadServers(); }, [loadServers]);

  const installedPresetIds = new Set(servers.map((s) => s.preset_id).filter(Boolean));

  const handleCreate = async (data: Partial<MCPServer>) => {
    await api.mcp.servers.create(data);
    addToast('Integration added', 'success');
    await loadServers();
  };

  const handleUpdate = async (data: Partial<MCPServer>) => {
    if (!editingServer) return;
    await api.mcp.servers.update(editingServer.id, data);
    addToast('Integration updated', 'success');
    await loadServers();
  };

  const handleDelete = async (id: string) => {
    await api.mcp.servers.delete(id);
    addToast('Integration removed', 'success');
    await loadServers();
  };

  const handleTest = async (server: MCPServer) => {
    setTesting(server.id);
    try {
      const result = await api.mcp.servers.test(server.id);
      if (result.status === 'ok') {
        addToast(`${server.name}: ${result.tool_count} tools available`, 'success');
      } else {
        addToast(`${server.name}: ${result.error}`, 'error');
      }
    } catch (e) {
      addToast(`Test failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleToggle = async (server: MCPServer) => {
    await api.mcp.servers.update(server.id, { enabled: !server.enabled });
    await loadServers();
  };

  const openPreset = (preset: IntegrationPreset) => {
    setSelectedPreset(preset);
    setEditingServer(undefined);
    setShowForm(true);
  };

  const openCustom = () => {
    setSelectedPreset(undefined);
    setEditingServer(undefined);
    setShowForm(true);
  };

  const openEdit = (server: MCPServer) => {
    setEditingServer(server);
    setSelectedPreset(undefined);
    setShowForm(true);
  };

  const filteredCatalog = category === 'all'
    ? INTEGRATION_CATALOG
    : category === 'installed'
      ? []
      : INTEGRATION_CATALOG.filter((p) => p.category === category);

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
                  <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-lg font-semibold tracking-tight font-[family-name:var(--font-display)]">Integrations</h1>
                <p className="text-xs text-surface-500">Connect agents to external tools via MCP servers</p>
              </div>
            </div>

            <button
              onClick={openCustom}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-accent-cyan text-sm font-medium hover:from-accent-cyan/25 hover:to-accent-blue/25 hover:border-accent-cyan/40 transition-all cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Custom MCP
            </button>
          </div>
        </header>

        <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8">
          {/* Installed Servers */}
          {servers.length > 0 && (
            <div className="mb-10">
              <h2 className="text-sm font-semibold text-slate-200 mb-4 font-[family-name:var(--font-display)]">
                Active Integrations ({servers.length})
              </h2>
              <div className="space-y-3">
                {servers.map((server) => (
                  <div key={server.id} className={`glass noise rounded-2xl p-5 transition-all ${server.enabled ? 'border border-accent-cyan/10' : 'opacity-60'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: server.color }}
                        >
                          {server.icon || server.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-200">{server.name}</h3>
                            {health[server.id] && (
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  health[server.id].healthy
                                    ? 'bg-accent-emerald'
                                    : health[server.id].failed_pings > 0
                                      ? 'bg-accent-amber'
                                      : 'bg-accent-rose'
                                }`}
                                title={health[server.id].healthy ? 'Healthy' : `Unhealthy (${health[server.id].failed_pings} failed pings)`}
                              />
                            )}
                            <span className="px-2 py-0.5 rounded-md bg-surface-800 text-surface-500 text-[10px] font-mono">
                              {server.transport}
                            </span>
                            {!server.enabled && (
                              <span className="px-2 py-0.5 rounded-md bg-surface-700 text-surface-500 text-[10px]">
                                Disabled
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-surface-500 mt-0.5">{server.description}</p>
                          {server.command && (
                            <p className="text-[10px] text-surface-600 font-mono mt-1">
                              {server.command} {server.args.join(' ')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <button
                          onClick={() => setViewingTools({ id: server.id, name: server.name })}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface-800 border border-surface-700 text-surface-500 hover:text-accent-cyan hover:border-accent-cyan/30 transition-all cursor-pointer"
                        >
                          Tools
                        </button>
                        <button
                          onClick={() => handleTest(server)}
                          disabled={testing === server.id}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface-800 border border-surface-700 text-surface-500 hover:text-accent-emerald hover:border-accent-emerald/30 transition-all cursor-pointer disabled:opacity-40"
                        >
                          {testing === server.id ? 'Testing...' : 'Test'}
                        </button>
                        <button
                          onClick={() => handleToggle(server)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                            server.enabled
                              ? 'bg-accent-amber/10 border-accent-amber/20 text-accent-amber'
                              : 'bg-surface-800 border-surface-700 text-surface-500'
                          }`}
                        >
                          {server.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        <button
                          onClick={() => openEdit(server)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface-800 border border-surface-700 text-surface-500 hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(server.id)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface-800 border border-surface-700 text-surface-500 hover:text-accent-rose hover:border-accent-rose/30 transition-all cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Integration Catalog */}
          <div>
            <h2 className="text-sm font-semibold text-slate-200 mb-4 font-[family-name:var(--font-display)]">
              Integration Catalog
            </h2>

            <div className="flex gap-2 mb-5 flex-wrap">
              <button
                onClick={() => setCategory('all')}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                  category === 'all'
                    ? 'bg-slate-200/10 border-slate-200/20 text-slate-200'
                    : 'border-transparent text-surface-500 hover:text-slate-300'
                }`}
              >
                All
              </button>
              {(Object.entries(CATEGORY_LABELS) as [IntegrationCategory, { label: string; color: string }][]).map(
                ([cat, meta]) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border"
                    style={{
                      background: category === cat ? `${meta.color}15` : 'transparent',
                      borderColor: category === cat ? `${meta.color}35` : 'transparent',
                      color: category === cat ? meta.color : '#4a4f6a',
                    }}
                  >
                    {meta.label}
                  </button>
                )
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCatalog.map((preset) => {
                const installed = installedPresetIds.has(preset.id);
                const catMeta = CATEGORY_LABELS[preset.category];

                return (
                  <div
                    key={preset.id}
                    className={`glass noise rounded-2xl p-5 transition-all ${installed ? 'border border-accent-cyan/15' : 'glass-hover cursor-pointer'}`}
                    onClick={() => !installed && openPreset(preset)}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: preset.color }}
                      >
                        {preset.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-200">{preset.name}</h3>
                          {installed && (
                            <span className="px-2 py-0.5 rounded-md bg-accent-cyan/10 text-accent-cyan text-[10px] font-medium">
                              Added
                            </span>
                          )}
                        </div>
                        <span
                          className="inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                          style={{ background: `${catMeta.color}10`, color: catMeta.color }}
                        >
                          {catMeta.label}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-surface-500 mb-2">{preset.description}</p>
                    <p className="text-[10px] text-surface-600 font-mono">{preset.command} {preset.args.join(' ')}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* Form Modal */}
      {showForm && (
        <ServerFormModal
          server={editingServer}
          preset={selectedPreset}
          onSave={editingServer ? handleUpdate : handleCreate}
          onClose={() => { setShowForm(false); setEditingServer(undefined); setSelectedPreset(undefined); }}
        />
      )}

      {/* Tools Viewer */}
      {viewingTools && (
        <ToolsViewer
          serverId={viewingTools.id}
          serverName={viewingTools.name}
          onClose={() => setViewingTools(null)}
        />
      )}
    </div>
  );
}
