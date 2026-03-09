import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { AgentChatModal } from './AgentChat';

const STATUS_COLORS = {
  connected: 'bg-accent-emerald',
  disconnected: 'bg-accent-rose',
  checking: 'bg-accent-amber',
};

export function Header() {
  const { ollamaStatus, agents, setShowCreateModal } = useStore();
  const navigate = useNavigate();
  const [showAgentChat, setShowAgentChat] = useState(false);

  return (
    <>
    <header className="glass sticky top-0 z-50 px-4 sm:px-8 py-4 sm:py-5">
      <div className="flex items-center justify-between max-w-[1600px] mx-auto">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-cyan to-accent-blue flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${STATUS_COLORS[ollamaStatus]} border-2 border-surface-950 status-pulse`} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight font-[family-name:var(--font-display)]">
              Agent Hub
            </h1>
            <p className="text-xs text-surface-500">
              {agents.length} agent{agents.length !== 1 ? 's' : ''} &middot; Ollama {ollamaStatus}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAgentChat(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface-800/60 border border-surface-700 text-surface-500 hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
            title="Agent-to-Agent Chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <path d="M8 10h.01M12 10h.01M16 10h.01"/>
            </svg>
          </button>
          <button
            onClick={() => navigate('/integrations')}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface-800/60 border border-surface-700 text-surface-500 hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
            title="Integrations"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v6m0 8v6M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M2 12h6m8 0h6M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24" />
            </svg>
          </button>
          <button
            onClick={() => navigate('/workflows')}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface-800/60 border border-surface-700 text-surface-500 hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
            title="Workflows"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h4m4 0h4m4 0h0" />
              <circle cx="4" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="20" cy="12" r="2" />
            </svg>
          </button>
          <button
            onClick={() => navigate('/knowledge')}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface-800/60 border border-surface-700 text-surface-500 hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
            title="Knowledge Bases"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface-800/60 border border-surface-700 text-surface-500 hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-accent-cyan text-sm font-medium hover:from-accent-cyan/25 hover:to-accent-blue/25 hover:border-accent-cyan/40 transition-all duration-200 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Agent
          </button>
        </div>
      </div>
    </header>

    {showAgentChat && <AgentChatModal onClose={() => setShowAgentChat(false)} />}
    </>
  );
}
