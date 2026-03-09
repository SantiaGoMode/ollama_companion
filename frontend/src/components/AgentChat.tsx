import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useStore } from '../store/useStore';
import type { AgentChat, AgentChatMessage } from '../types/agent';
import { parseThinkingBlocks, hasThinkingContent } from '../utils/thinkingParser';
import ThinkingBlock from './ThinkingBlock';

interface Turn {
  agentName: string;
  content: string;
  isComplete: boolean;
}

interface AgentChatProps {
  onClose: () => void;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AgentChatModal({ onClose }: AgentChatProps) {
  const { agents } = useStore();
  const [agentA, setAgentA] = useState<string>('');
  const [agentB, setAgentB] = useState<string>('');
  const [topic, setTopic] = useState('');
  const [maxTurns, setMaxTurns] = useState(6);
  const [freeTalk, setFreeTalk] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Conversation history state
  const [chatHistory, setChatHistory] = useState<AgentChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<AgentChat | null>(null);
  const [showNewForm, setShowNewForm] = useState(true);
  const [continueTurns, setContinueTurns] = useState(4);
  const [redirectTopic, setRedirectTopic] = useState('');
  const [showContinueForm, setShowContinueForm] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const chatAgents = agents.filter(a => a.agent_type === 'chat' || a.agent_type === 'reasoning');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const chats = await api.agentChats.list();
      setChatHistory(chats);
    } catch {
      // ignore
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRunning) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, isRunning]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const stopChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Mark current incomplete turn as complete
    setTurns(prev => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && !last.isComplete) {
        last.isComplete = true;
      }
      return next;
    });
    setIsRunning(false);
    setIsComplete(true);
    loadHistory();
  }, []);

  const processStream = useCallback(async (
    stream: AsyncGenerator<{ type: string; turn?: number; agent_name?: string; content?: string; full_content?: string; chat_id?: string }>,
  ) => {
    setIsRunning(true);
    setIsComplete(false);
    setShowContinueForm(false);

    try {
      let chatId: string | null = activeChatId;
      for await (const event of stream) {
        if (event.chat_id && !chatId) {
          chatId = event.chat_id;
          setActiveChatId(chatId);
        }
        if (event.type === 'turn_start') {
          setTurns(prev => [...prev, { agentName: event.agent_name || '', content: '', isComplete: false }]);
        } else if (event.type === 'chunk') {
          setTurns(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last) last.content += event.content || '';
            return next;
          });
        } else if (event.type === 'turn_end') {
          setTurns(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last) {
              last.content = event.full_content || last.content;
              last.isComplete = true;
            }
            return next;
          });
        } else if (event.type === 'complete') {
          setIsComplete(true);
        }
      }
      loadHistory();
    } catch (e) {
      // Don't show error for intentional aborts
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setTurns(prev => [...prev, { agentName: 'System', content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`, isComplete: true }]);
    } finally {
      setIsRunning(false);
      setIsComplete(true);
      abortRef.current = null;
    }
  }, [activeChatId]);

  const startChat = async () => {
    if (!agentA || !agentB || (!freeTalk && !topic.trim())) return;
    setTurns([]);
    setActiveChatId(null);
    setShowNewForm(false);

    const effectiveTopic = freeTalk ? '__free_talk__' : topic;
    const displayTopic = freeTalk ? 'Free Talk' : topic;

    const agentAInfo = agents.find(a => a.id === agentA);
    const agentBInfo = agents.find(a => a.id === agentB);
    setActiveChat({
      id: '',
      agent_a_id: agentA,
      agent_b_id: agentB,
      agent_a_name: agentAInfo?.name || '',
      agent_b_name: agentBInfo?.name || '',
      agent_a_model: agentAInfo?.model || '',
      agent_b_model: agentBInfo?.model || '',
      topic: displayTopic,
      total_turns: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const controller = new AbortController();
    abortRef.current = controller;
    await processStream(api.agentChats.create(agentA, agentB, effectiveTopic, maxTurns, controller.signal));
  };

  const loadChat = async (chatId: string) => {
    try {
      const detail = await api.agentChats.get(chatId);
      setActiveChatId(chatId);
      setActiveChat(detail);
      setShowNewForm(false);
      setShowContinueForm(false);
      setIsComplete(true);
      setIsRunning(false);
      setRedirectTopic('');

      const loadedTurns: Turn[] = detail.messages.map((m: AgentChatMessage) => ({
        agentName: m.agent_name,
        content: m.content,
        isComplete: true,
      }));
      setTurns(loadedTurns);
    } catch {
      // ignore
    }
  };

  const continueChat = async () => {
    if (!activeChatId) return;
    setShowContinueForm(false);

    const controller = new AbortController();
    abortRef.current = controller;
    await processStream(
      api.agentChats.continue(activeChatId, continueTurns, redirectTopic.trim() || undefined, controller.signal)
    );
  };

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.agentChats.delete(chatId);
      setChatHistory(prev => prev.filter(c => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setActiveChat(null);
        setTurns([]);
        setShowNewForm(true);
      }
    } catch {
      // ignore
    }
  };

  const startNew = () => {
    setActiveChatId(null);
    setActiveChat(null);
    setTurns([]);
    setShowNewForm(true);
    setIsComplete(false);
    setShowContinueForm(false);
    setRedirectTopic('');
    setTopic('');
    setAgentA('');
    setAgentB('');
    setFreeTalk(false);
  };

  const agentAData = activeChat
    ? agents.find(a => a.id === activeChat.agent_a_id) || { name: activeChat.agent_a_name, color: '#6366f1' }
    : agents.find(a => a.id === agentA);
  const agentBData = activeChat
    ? agents.find(a => a.id === activeChat.agent_b_id) || { name: activeChat.agent_b_name, color: '#f59e0b' }
    : agents.find(a => a.id === agentB);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => !isRunning && onClose()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()} className="fade-in relative glass noise rounded-3xl w-full max-w-5xl max-h-[85vh] flex overflow-hidden">

        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-white/5 flex flex-col">
          <div className="px-4 py-4 border-b border-white/5">
            <button
              onClick={startNew}
              disabled={isRunning}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-accent-cyan text-xs font-medium hover:from-accent-cyan/25 hover:to-accent-blue/25 hover:border-accent-cyan/40 transition-all cursor-pointer disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Conversation
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoadingHistory ? (
              <div className="px-4 py-3 space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="h-3 bg-surface-800 rounded w-3/4 mb-1.5" />
                    <div className="h-2 bg-surface-800/50 rounded w-full" />
                  </div>
                ))}
              </div>
            ) : chatHistory.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-surface-600">No conversations yet</p>
              </div>
            ) : (
              <div className="py-2">
                {chatHistory.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => loadChat(chat.id)}
                    disabled={isRunning}
                    className={`w-full text-left px-4 py-3 transition-colors group relative ${
                      activeChatId === chat.id
                        ? 'bg-accent-cyan/8 border-l-2 border-accent-cyan'
                        : 'hover:bg-surface-800/50 border-l-2 border-transparent'
                    } ${isRunning ? 'opacity-40' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-surface-300 truncate">
                          {chat.agent_a_name} & {chat.agent_b_name}
                        </p>
                        <p className="text-[11px] text-surface-500 truncate mt-0.5">
                          {chat.topic}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-surface-600">{chat.total_turns} turns</span>
                          <span className="text-[10px] text-surface-600">{timeAgo(chat.updated_at)}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => deleteChat(chat.id, e)}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center hover:bg-accent-rose/15 text-surface-600 hover:text-accent-rose transition-all flex-shrink-0 cursor-pointer"
                        title="Delete"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight font-[family-name:var(--font-display)]">
                {activeChat && !showNewForm
                  ? `${activeChat.agent_a_name} & ${activeChat.agent_b_name}`
                  : 'Agent-to-Agent Chat'
                }
              </h2>
              <p className="text-xs text-surface-500 mt-0.5">
                {activeChat && !showNewForm
                  ? activeChat.topic
                  : 'Two agents converse with each other on a topic'
                }
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Stop button */}
              {isRunning && (
                <button
                  onClick={stopChat}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-rose/15 border border-accent-rose/25 text-accent-rose text-xs font-medium hover:bg-accent-rose/25 hover:border-accent-rose/40 transition-all cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Stop
                </button>
              )}
              <button
                onClick={() => !isRunning && onClose()}
                className={`w-9 h-9 rounded-xl flex items-center justify-center bg-surface-800 transition-colors ${isRunning ? 'opacity-40' : 'hover:bg-surface-700 cursor-pointer'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* New conversation form */}
          {showNewForm && !isRunning && turns.length === 0 && (
            <div className="px-6 py-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1.5">Agent A</label>
                  <select
                    value={agentA}
                    onChange={e => setAgentA(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 appearance-none cursor-pointer"
                  >
                    <option value="">Select agent...</option>
                    {chatAgents.filter(a => a.id !== agentB).map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.model})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1.5">Agent B</label>
                  <select
                    value={agentB}
                    onChange={e => setAgentB(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 appearance-none cursor-pointer"
                  >
                    <option value="">Select agent...</option>
                    {chatAgents.filter(a => a.id !== agentA).map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.model})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Free Talk toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setFreeTalk(!freeTalk)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                    freeTalk ? 'bg-accent-cyan' : 'bg-surface-700'
                  }`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    freeTalk ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
                <div>
                  <span className="text-xs font-medium text-surface-300">Free Talk</span>
                  <span className="text-[11px] text-surface-500 ml-2">Agents chat about whatever they want</span>
                </div>
              </div>

              {!freeTalk && (
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1.5">Topic / Opening Prompt</label>
                  <textarea
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="What should these agents discuss?"
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600 resize-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-surface-500">Max turns:</label>
                  <input
                    type="number"
                    value={maxTurns}
                    onChange={e => setMaxTurns(Math.max(2, Math.min(20, Number(e.target.value))))}
                    min={2}
                    max={20}
                    className="w-16 px-2 py-1.5 rounded-lg bg-surface-900 border border-surface-700 text-xs text-center focus:outline-none focus:border-accent-cyan/50"
                  />
                </div>
                <button
                  onClick={startChat}
                  disabled={!agentA || !agentB || (!freeTalk && !topic.trim())}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-sm font-medium text-white disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer"
                >
                  Start Conversation
                </button>
              </div>
            </div>
          )}

          {/* Conversation view */}
          {(isRunning || turns.length > 0) && (
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {/* Topic badge */}
              <div className="text-center mb-4">
                {(() => {
                  const displayTopic = activeChat?.topic || topic;
                  const isFree = displayTopic === '__free_talk__' || displayTopic === 'Free Talk';
                  return (
                    <span className={`inline-block px-4 py-2 rounded-xl border text-xs ${
                      isFree
                        ? 'bg-accent-cyan/8 border-accent-cyan/20 text-accent-cyan'
                        : 'bg-surface-800 border-surface-700 text-surface-400'
                    }`}>
                      {isFree ? 'Free Talk — open conversation' : `Topic: ${displayTopic}`}
                    </span>
                  );
                })()}
              </div>

              {turns.map((turn, i) => {
                const isA = turn.agentName === (agentAData as { name?: string })?.name;
                const agent = isA ? agentAData : agentBData;
                const color = (agent as { color?: string })?.color || (isA ? '#6366f1' : '#f59e0b');

                return (
                  <div key={i} className={`flex ${isA ? 'justify-start' : 'justify-end'}`}>
                    <div className="max-w-[75%]">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ background: color }}
                        >
                          {turn.agentName.charAt(0)}
                        </div>
                        <span className="text-[11px] font-medium" style={{ color }}>{turn.agentName}</span>
                        {!turn.isComplete && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
                        )}
                      </div>
                      <div
                        className="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                        style={{
                          background: `${color}08`,
                          border: `1px solid ${color}15`,
                          color: '#cbd5e1',
                        }}
                      >
                        {turn.content ? (
                          hasThinkingContent(turn.content) ? (
                            (() => {
                              const parsed = parseThinkingBlocks(turn.content);
                              return (
                                <>
                                  <ThinkingBlock content={parsed.thinking} isStreaming={!turn.isComplete && !parsed.response} />
                                  {parsed.response}
                                </>
                              );
                            })()
                          ) : (
                            turn.content
                          )
                        ) : (
                          <span className="inline-block w-2 h-4 bg-accent-cyan/60 animate-pulse rounded-sm" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isRunning && !isComplete && (
                <div className="text-center">
                  <span className="text-xs text-surface-500 animate-pulse">Agents are conversing...</span>
                </div>
              )}

              {isComplete && !isRunning && (
                <div className="text-center pt-4 space-y-3">
                  <span className="text-xs text-surface-500">Conversation complete ({turns.length} turns)</span>

                  {showContinueForm ? (
                    <div className="max-w-md mx-auto space-y-3 pt-2">
                      <div>
                        <label className="block text-xs font-medium text-surface-500 mb-1 text-left">Redirect topic (optional)</label>
                        <input
                          type="text"
                          value={redirectTopic}
                          onChange={e => setRedirectTopic(e.target.value)}
                          placeholder="Leave empty to continue naturally..."
                          className="w-full px-3 py-2 rounded-xl bg-surface-900 border border-surface-700 text-xs focus:outline-none focus:border-accent-cyan/50 placeholder:text-surface-600"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-surface-500">Turns:</label>
                          <input
                            type="number"
                            value={continueTurns}
                            onChange={e => setContinueTurns(Math.max(1, Math.min(20, Number(e.target.value))))}
                            min={1}
                            max={20}
                            className="w-14 px-2 py-1 rounded-lg bg-surface-900 border border-surface-700 text-xs text-center focus:outline-none focus:border-accent-cyan/50"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowContinueForm(false)}
                            className="px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-xs text-surface-400 hover:text-surface-200 transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={continueChat}
                            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-accent-cyan to-accent-blue text-xs font-medium text-white hover:brightness-110 transition-all cursor-pointer"
                          >
                            Continue
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-3">
                      {activeChatId && (
                        <button
                          onClick={() => setShowContinueForm(true)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-xs text-accent-cyan font-medium hover:from-accent-cyan/25 hover:to-accent-blue/25 hover:border-accent-cyan/40 transition-all cursor-pointer"
                        >
                          Continue Conversation
                        </button>
                      )}
                      <button
                        onClick={startNew}
                        className="px-4 py-2 rounded-xl bg-surface-800 border border-surface-700 text-xs text-surface-400 hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
                      >
                        New Conversation
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}

          {/* Empty state */}
          {!showNewForm && turns.length === 0 && !isRunning && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-surface-500">Select a conversation from the sidebar</p>
                <p className="text-xs text-surface-600 mt-1">or start a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
