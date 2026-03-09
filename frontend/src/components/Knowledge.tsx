import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { KnowledgeBase } from '../types/agent';

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function CreateKBModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.knowledge.create({ name: name.trim(), description, chunk_size: chunkSize, chunk_overlap: chunkOverlap });
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} className="fade-in relative glass noise rounded-3xl w-full max-w-lg p-8">
        <h2 className="text-xl font-semibold tracking-tight mb-6 font-[family-name:var(--font-display)]">Create Knowledge Base</h2>
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Project Docs" autoFocus
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What knowledge does this contain?"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1.5">Chunk Size</label>
              <input type="number" value={chunkSize} onChange={(e) => setChunkSize(Number(e.target.value))} min={200} max={4000} step={100}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1.5">Chunk Overlap</label>
              <input type="number" value={chunkOverlap} onChange={(e) => setChunkOverlap(Number(e.target.value))} min={0} max={1000} step={50}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-8">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-sm text-surface-500 hover:bg-surface-700 transition-colors cursor-pointer">Cancel</button>
          <button type="submit" disabled={!name.trim() || saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-sm font-medium text-white disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer">
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function IngestPanel({ kb, onDone }: { kb: KnowledgeBase; onDone: () => void }) {
  const [mode, setMode] = useState<'file' | 'directory' | 'upload'>('file');
  const [filePath, setFilePath] = useState('');
  const [dirPath, setDirPath] = useState('');
  const [extensions, setExtensions] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleIngestFile = async () => {
    if (!filePath.trim()) return;
    setIngesting(true);
    setResult(null);
    try {
      const res = await api.knowledge.ingestFile(kb.id, filePath.trim());
      setResult(`Added ${res.chunks_added} chunks from ${res.source}`);
      setFilePath('');
      onDone();
    } catch (e: unknown) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIngesting(false);
    }
  };

  const handleIngestDir = async () => {
    if (!dirPath.trim()) return;
    setIngesting(true);
    setResult(null);
    try {
      const exts = extensions.trim() ? extensions.split(',').map((e) => e.trim().startsWith('.') ? e.trim() : `.${e.trim()}`) : undefined;
      const res = await api.knowledge.ingestDirectory(kb.id, dirPath.trim(), exts);
      setResult(`Added ${res.chunks_added} chunks from ${res.source}`);
      setDirPath('');
      onDone();
    } catch (e: unknown) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIngesting(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIngesting(true);
    setResult(null);
    try {
      const res = await api.knowledge.upload(kb.id, file);
      setResult(`Added ${res.chunks_added} chunks from ${res.source}`);
      onDone();
    } catch (err: unknown) {
      setResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['file', 'directory', 'upload'] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
              mode === m ? 'bg-accent-cyan/15 border-accent-cyan/30 text-accent-cyan' : 'bg-surface-900 border-surface-700 text-surface-500'
            }`}>
            {m === 'file' ? 'File Path' : m === 'directory' ? 'Directory' : 'Upload'}
          </button>
        ))}
      </div>

      {mode === 'file' && (
        <div className="flex gap-2">
          <input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="/path/to/document.pdf"
            className="flex-1 px-3 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm font-mono focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600"
            onKeyDown={(e) => e.key === 'Enter' && handleIngestFile()} />
          <button onClick={handleIngestFile} disabled={ingesting || !filePath.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-accent-cyan text-sm font-medium hover:border-accent-cyan/40 transition-all cursor-pointer disabled:opacity-40">
            {ingesting ? 'Ingesting...' : 'Ingest'}
          </button>
        </div>
      )}

      {mode === 'directory' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={dirPath} onChange={(e) => setDirPath(e.target.value)} placeholder="/path/to/project"
              className="flex-1 px-3 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm font-mono focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600" />
            <button onClick={handleIngestDir} disabled={ingesting || !dirPath.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-accent-cyan text-sm font-medium hover:border-accent-cyan/40 transition-all cursor-pointer disabled:opacity-40">
              {ingesting ? 'Ingesting...' : 'Ingest'}
            </button>
          </div>
          <input value={extensions} onChange={(e) => setExtensions(e.target.value)} placeholder="Filter: .py, .md, .txt (optional)"
            className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600" />
        </div>
      )}

      {mode === 'upload' && (
        <label className="flex items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-surface-700 hover:border-accent-cyan/30 transition-colors cursor-pointer">
          <div className="text-center">
            <svg className="mx-auto mb-2 text-surface-500" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className="text-xs text-surface-500">
              {ingesting ? 'Uploading...' : 'Click to upload a file (PDF, TXT, MD, code)'}
            </span>
          </div>
          <input type="file" className="hidden" onChange={handleUpload} disabled={ingesting} />
        </label>
      )}

      {result && (
        <div className={`px-3 py-2 rounded-lg text-xs ${
          result.startsWith('Error') ? 'bg-accent-rose/10 text-accent-rose border border-accent-rose/15' : 'bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/15'
        }`}>
          {result}
        </div>
      )}
    </div>
  );
}

function QueryPanel({ kb }: { kb: KnowledgeBase }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ content: string; metadata: Record<string, unknown> }[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await api.knowledge.query(kb.id, query.trim());
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the knowledge base..."
          className="flex-1 px-3 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
        <button onClick={handleSearch} disabled={searching || !query.trim()}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-violet/15 to-accent-blue/15 border border-accent-violet/20 text-accent-violet text-sm font-medium hover:border-accent-violet/40 transition-all cursor-pointer disabled:opacity-40">
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>
      {results.map((r, i) => (
        <div key={i} className="glass noise rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-surface-500 px-2 py-0.5 rounded bg-surface-800 border border-surface-700">
              {String(r.metadata.source || 'unknown').split('/').pop()}
            </span>
            {r.metadata.page && (
              <span className="text-[10px] text-surface-600">p.{String(r.metadata.page)}</span>
            )}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-6">{r.content}</p>
        </div>
      ))}
    </div>
  );
}

function KBDetailPanel({ kb, onClose, onRefresh }: { kb: KnowledgeBase; onClose: () => void; onRefresh: () => void }) {
  const [tab, setTab] = useState<'ingest' | 'query' | 'info'>('ingest');

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="slide-in-right relative ml-auto w-full max-w-2xl h-full glass noise flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 p-6 border-b border-white/5">
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-800 hover:bg-surface-700 transition-colors cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-accent-violet/10 border border-accent-violet/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight font-[family-name:var(--font-display)]">{kb.name}</h2>
            <p className="text-xs text-surface-500">{formatNumber(kb.chunk_count)} chunks &middot; {kb.document_count} sources</p>
          </div>
        </div>

        <div className="flex gap-1 px-6 pt-4">
          {(['ingest', 'query', 'info'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                tab === t ? 'bg-accent-cyan/10 text-accent-cyan' : 'text-surface-500 hover:text-slate-300'
              }`}>
              {t === 'ingest' ? 'Add Documents' : t === 'query' ? 'Search' : 'Info'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'ingest' && <IngestPanel kb={kb} onDone={onRefresh} />}
          {tab === 'query' && <QueryPanel kb={kb} />}
          {tab === 'info' && (
            <div className="space-y-4">
              <div className="glass noise rounded-xl p-5 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[11px] text-surface-500">Collection</span>
                    <p className="text-sm font-mono text-slate-300">{kb.collection_name}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-surface-500">Embedding Model</span>
                    <p className="text-sm font-mono text-slate-300">{kb.embedding_model}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-surface-500">Chunk Size</span>
                    <p className="text-sm text-slate-300">{kb.chunk_size} chars / {kb.chunk_overlap} overlap</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-surface-500">Total Chunks</span>
                    <p className="text-sm text-slate-300">{formatNumber(kb.chunk_count)}</p>
                  </div>
                </div>
              </div>
              {kb.sources.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-surface-500 mb-2">Indexed Sources</h4>
                  <div className="space-y-1">
                    {kb.sources.map((s, i) => (
                      <div key={i} className="px-3 py-2 rounded-lg bg-surface-900/50 border border-surface-700 text-xs font-mono text-surface-500 truncate">{s}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Knowledge() {
  const navigate = useNavigate();
  const [kbs, setKBs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedKB, setSelectedKB] = useState<KnowledgeBase | null>(null);
  const [ensuring, setEnsuring] = useState(false);

  const loadKBs = useCallback(async () => {
    try {
      const list = await api.knowledge.list();
      setKBs(list);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKBs(); }, [loadKBs]);

  const ensureModel = async () => {
    setEnsuring(true);
    try {
      await api.knowledge.ensureEmbeddingModel();
    } finally {
      setEnsuring(false);
    }
  };

  const deleteKB = async (id: string) => {
    await api.knowledge.delete(id);
    if (selectedKB?.id === id) setSelectedKB(null);
    loadKBs();
  };

  return (
    <div className="min-h-screen bg-surface-950">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent-violet/[0.02] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent-cyan/[0.02] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10">
        <header className="glass sticky top-0 z-50 px-8 py-5">
          <div className="flex items-center justify-between max-w-[1200px] mx-auto">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/')} className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-800 hover:bg-surface-700 transition-colors cursor-pointer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                </svg>
              </button>
              <div>
                <h1 className="text-lg font-semibold tracking-tight font-[family-name:var(--font-display)]">Knowledge Bases</h1>
                <p className="text-xs text-surface-500">{kbs.length} collection{kbs.length !== 1 ? 's' : ''} &middot; RAG-powered retrieval</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={ensureModel} disabled={ensuring}
                className="px-4 py-2.5 rounded-xl bg-surface-800/60 border border-surface-700 text-surface-500 text-xs font-medium hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer disabled:opacity-40">
                {ensuring ? 'Pulling...' : 'Ensure Embedding Model'}
              </button>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-violet/15 to-accent-blue/15 border border-accent-violet/20 text-accent-violet text-sm font-medium hover:border-accent-violet/40 transition-all cursor-pointer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New Knowledge Base
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass noise rounded-2xl p-6 animate-pulse">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-surface-700/50" />
                    <div className="flex-1">
                      <div className="h-4 w-28 rounded-lg bg-surface-700/50 mb-2" />
                      <div className="h-5 w-20 rounded-md bg-surface-700/30" />
                    </div>
                  </div>
                  <div className="h-3 w-full rounded bg-surface-700/30 mb-2" />
                  <div className="h-3 w-1/2 rounded bg-surface-700/30" />
                </div>
              ))}
            </div>
          ) : kbs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 sm:py-32">
              <div className="w-20 h-20 rounded-2xl glass flex items-center justify-center mb-6">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-surface-600">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-surface-500 mb-2 font-[family-name:var(--font-display)]">No knowledge bases</h2>
              <p className="text-sm text-surface-600 mb-1">Add documents, PDFs, or code to give your agents domain knowledge</p>
              <p className="text-xs text-surface-600 mb-6">Agents linked to a knowledge base use RAG to answer from your documents</p>
              <button onClick={() => setShowCreate(true)} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent-violet to-accent-blue text-sm font-medium text-white hover:brightness-110 transition-all cursor-pointer">
                Create Knowledge Base
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {kbs.map((kb, i) => (
                <div key={kb.id} className="fade-in group relative glass glass-hover noise rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:-translate-y-1"
                  style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
                  onClick={() => setSelectedKB(kb)}>
                  <button onClick={(e) => { e.stopPropagation(); deleteKB(kb.id); }}
                    className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-surface-800/80 hover:bg-accent-rose/20 text-surface-500 hover:text-accent-rose cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>

                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-accent-violet/10 border border-accent-violet/20">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold tracking-tight truncate font-[family-name:var(--font-display)]">{kb.name}</h3>
                      <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-accent-violet/10 text-accent-violet">
                        {formatNumber(kb.chunk_count)} chunks
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-surface-500 leading-relaxed line-clamp-2 mb-4">
                    {kb.description || 'No description'}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-surface-600 font-mono">{kb.embedding_model}</span>
                    <span className="text-[11px] text-surface-600">{kb.document_count} source{kb.document_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {showCreate && <CreateKBModal onClose={() => setShowCreate(false)} onCreated={loadKBs} />}
      {selectedKB && <KBDetailPanel kb={selectedKB} onClose={() => setSelectedKB(null)} onRefresh={loadKBs} />}
    </div>
  );
}
