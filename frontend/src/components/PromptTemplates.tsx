import { useState, useEffect, useCallback } from 'react';

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
}

const STORAGE_KEY = 'agent-hub-prompt-templates';

function loadTemplates(): PromptTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: PromptTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function usePromptTemplates() {
  const [templates, setTemplates] = useState<PromptTemplate[]>(loadTemplates);

  const add = useCallback((t: Omit<PromptTemplate, 'id'>) => {
    setTemplates(prev => {
      const next = [...prev, { ...t, id: `tpl-${Date.now()}` }];
      saveTemplates(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setTemplates(prev => {
      const next = prev.filter(t => t.id !== id);
      saveTemplates(next);
      return next;
    });
  }, []);

  const update = useCallback((id: string, data: Partial<PromptTemplate>) => {
    setTemplates(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...data } : t);
      saveTemplates(next);
      return next;
    });
  }, []);

  return { templates, add, remove, update };
}

interface TemplatePanelProps {
  onInsert: (content: string) => void;
  onClose: () => void;
}

export function TemplatePanel({ onInsert, onClose }: TemplatePanelProps) {
  const { templates, add, remove } = usePromptTemplates();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [search, setSearch] = useState('');

  const categories = ['general', 'coding', 'writing', 'analysis', 'custom'];
  const filtered = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    if (!name.trim() || !content.trim()) return;
    add({ name: name.trim(), content: content.trim(), category });
    setName('');
    setContent('');
    setShowAdd(false);
  };

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface-850 border border-surface-700 rounded-2xl shadow-2xl overflow-hidden max-h-[400px] flex flex-col z-20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
        <h3 className="text-xs font-semibold text-slate-200">Prompt Templates</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[10px] px-2.5 py-1 rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/20 transition-colors cursor-pointer"
          >
            {showAdd ? 'Cancel' : 'New'}
          </button>
          <button onClick={onClose} className="text-surface-500 hover:text-slate-300 cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="px-4 py-3 border-b border-surface-700 space-y-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Template name..."
            className="w-full px-3 py-1.5 rounded-lg bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/40 placeholder:text-surface-600"
            autoFocus
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Template content... (use {{input}} for dynamic parts)"
            rows={3}
            className="w-full px-3 py-1.5 rounded-lg bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/40 placeholder:text-surface-600 resize-none"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-2 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                    category === c
                      ? 'bg-accent-cyan/15 text-accent-cyan'
                      : 'bg-surface-800 text-surface-500 hover:text-slate-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              onClick={handleAdd}
              disabled={!name.trim() || !content.trim()}
              className="px-3 py-1 rounded-lg text-[10px] font-medium bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/25 disabled:opacity-40 cursor-pointer transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {!showAdd && templates.length > 5 && (
        <div className="px-4 py-2 border-b border-surface-700/50">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full px-3 py-1.5 rounded-lg bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/40 placeholder:text-surface-600"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-surface-500">
              {templates.length === 0 ? 'No templates yet. Click "New" to create one.' : 'No templates match your search.'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map(t => (
              <div
                key={t.id}
                className="group/tpl flex items-start gap-2 px-3 py-2 rounded-xl hover:bg-surface-800 cursor-pointer transition-colors"
                onClick={() => { onInsert(t.content); onClose(); }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-200 truncate">{t.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-700 text-surface-500">{t.category}</span>
                  </div>
                  <p className="text-[11px] text-surface-500 truncate mt-0.5">{t.content}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(t.id); }}
                  className="opacity-0 group-hover/tpl:opacity-100 text-surface-600 hover:text-accent-rose transition-all cursor-pointer shrink-0 mt-0.5"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
