import { create } from 'zustand';
import type { Agent, ChatMessage, OllamaModel } from '../types/agent';
import { api } from '../api/client';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

interface AppState {
  agents: Agent[];
  selectedAgent: Agent | null;
  editingAgent: Agent | null;
  models: OllamaModel[];
  ollamaStatus: 'connected' | 'disconnected' | 'checking';
  conversations: Record<string, ChatMessage[]>;
  isStreaming: boolean;
  isLoadingAgents: boolean;
  showCreateModal: boolean;
  toasts: Toast[];

  fetchAgents: () => Promise<void>;
  fetchModels: () => Promise<void>;
  checkOllamaStatus: () => Promise<void>;
  selectAgent: (agent: Agent | null) => void;
  setShowCreateModal: (show: boolean) => void;
  setEditingAgent: (agent: Agent | null) => void;
  addAgent: (data: Partial<Agent>) => Promise<Agent>;
  updateAgent: (id: string, data: Partial<Agent>) => Promise<Agent>;
  removeAgent: (id: string) => Promise<void>;
  sendMessage: (agentId: string, content: string, images?: string[]) => Promise<void>;
  sendCodeReview: (agentId: string, code: string, language: string, instruction: string) => Promise<void>;
  sendSummary: (agentId: string, content: string, sourceType: string) => Promise<void>;
  sendTransform: (agentId: string, content: string, targetFormat: string, instruction: string) => Promise<void>;
  sendGenerate: (agentId: string, parameters: Record<string, string>, instruction: string) => Promise<void>;
  clearConversation: (agentId: string) => Promise<void>;
  loadConversation: (agentId: string) => Promise<void>;
  addToast: (message: string, type: Toast['type']) => void;
  removeToast: (id: string) => void;
  approveAction: (actionId: string) => Promise<string>;
  denyAction: (actionId: string) => Promise<void>;
}

let toastCounter = 0;

async function saveConversation(agentId: string, messages: ChatMessage[]) {
  try {
    await api.conversations.save(agentId, messages);
  } catch {
    // Silent fail for persistence — not critical
  }
}

export const useStore = create<AppState>((set, get) => ({
  agents: [],
  selectedAgent: null,
  editingAgent: null,
  models: [],
  ollamaStatus: 'checking',
  conversations: {},
  isStreaming: false,
  isLoadingAgents: true,
  showCreateModal: false,
  toasts: [],

  addToast: (message, type) => {
    const id = `toast-${++toastCounter}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  fetchAgents: async () => {
    try {
      const agents = await api.agents.list();
      set({ agents, isLoadingAgents: false });
    } catch {
      set({ agents: [], isLoadingAgents: false });
      get().addToast('Failed to load agents', 'error');
    }
  },

  fetchModels: async () => {
    try {
      const models = await api.ollama.models();
      set({ models });
    } catch {
      set({ models: [] });
    }
  },

  checkOllamaStatus: async () => {
    const prev = get().ollamaStatus;
    set({ ollamaStatus: 'checking' });
    try {
      const status = await api.ollama.status() as 'connected' | 'disconnected';
      set({ ollamaStatus: status });
      if (prev !== 'checking' && prev !== status) {
        if (status === 'connected') {
          get().addToast('Ollama connected', 'success');
        } else {
          get().addToast('Ollama disconnected -- agents will not respond', 'warning');
        }
      }
    } catch {
      const wasConnected = prev === 'connected';
      set({ ollamaStatus: 'disconnected' });
      if (wasConnected) {
        get().addToast('Ollama disconnected -- agents will not respond', 'warning');
      }
    }
  },

  selectAgent: (agent) => {
    set({ selectedAgent: agent });
    if (agent) {
      get().loadConversation(agent.id);
    }
  },

  setShowCreateModal: (show) => set({ showCreateModal: show }),

  setEditingAgent: (agent) => set({ editingAgent: agent }),

  addAgent: async (data) => {
    try {
      const agent = await api.agents.create(data);
      await get().fetchAgents();
      get().addToast(`Agent "${agent.name}" created`, 'success');
      return agent;
    } catch (e) {
      get().addToast(`Failed to create agent: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
      throw e;
    }
  },

  updateAgent: async (id, data) => {
    try {
      const agent = await api.agents.update(id, data);
      await get().fetchAgents();
      const { selectedAgent } = get();
      if (selectedAgent?.id === id) {
        set({ selectedAgent: agent });
      }
      get().addToast(`Agent "${agent.name}" updated`, 'success');
      return agent;
    } catch (e) {
      get().addToast(`Failed to update agent: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
      throw e;
    }
  },

  removeAgent: async (id) => {
    try {
      const agent = get().agents.find((a) => a.id === id);
      await api.agents.delete(id);
      const { selectedAgent, conversations } = get();
      const newConversations = { ...conversations };
      delete newConversations[id];
      set({
        selectedAgent: selectedAgent?.id === id ? null : selectedAgent,
        conversations: newConversations,
      });
      await get().fetchAgents();
      try { await api.conversations.delete(id); } catch { /* ok */ }
      get().addToast(`Agent "${agent?.name || 'Unknown'}" deleted`, 'info');
    } catch (e) {
      get().addToast(`Failed to delete agent: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    }
  },

  loadConversation: async (agentId) => {
    if (get().conversations[agentId]) return;
    try {
      const messages = await api.conversations.load(agentId);
      if (messages.length > 0) {
        set((state) => ({
          conversations: { ...state.conversations, [agentId]: messages },
        }));
      }
    } catch {
      // No saved conversation — that's fine
    }
  },

  clearConversation: async (agentId) => {
    set((state) => ({
      conversations: { ...state.conversations, [agentId]: [] },
    }));
    try { await api.conversations.delete(agentId); } catch { /* ok */ }
    get().addToast('Conversation cleared', 'info');
  },

  sendMessage: async (agentId, content, images) => {
    const { conversations } = get();
    const history = conversations[agentId] || [];
    const userMsg: ChatMessage = { role: 'user', content, ...(images?.length ? { images } : {}) };
    const updated = [...history, userMsg];

    set({
      conversations: { ...get().conversations, [agentId]: updated },
      isStreaming: true,
    });

    try {
      let assistantContent = '';
      const assistantMsg: ChatMessage = { role: 'assistant', content: '' };

      set({
        conversations: {
          ...get().conversations,
          [agentId]: [...updated, assistantMsg],
        },
      });

      for await (const chunk of api.chat.stream('message', {
        agent_id: agentId,
        messages: updated.map((m) => ({ role: m.role, content: m.content, images: m.images || [] })),
      })) {
        assistantContent += chunk;
        set({
          conversations: {
            ...get().conversations,
            [agentId]: [
              ...updated,
              { role: 'assistant', content: assistantContent },
            ],
          },
        });
      }

      const finalMessages = get().conversations[agentId] || [];
      saveConversation(agentId, finalMessages);
    } catch (e) {
      get().addToast(`Chat error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    } finally {
      set({ isStreaming: false });
    }
  },

  sendCodeReview: async (agentId, code, language, instruction) => {
    const { conversations } = get();
    const history = conversations[agentId] || [];
    const userMsg: ChatMessage = { role: 'user', content: `[Code Review] ${language}\n${instruction}\n\`\`\`${language}\n${code}\n\`\`\`` };
    const updated = [...history, userMsg];

    set({
      conversations: { ...get().conversations, [agentId]: updated },
      isStreaming: true,
    });

    try {
      let assistantContent = '';
      set({
        conversations: {
          ...get().conversations,
          [agentId]: [...updated, { role: 'assistant', content: '' }],
        },
      });

      for await (const chunk of api.chat.stream('code', {
        agent_id: agentId, code, language, instruction,
      })) {
        assistantContent += chunk;
        set({
          conversations: {
            ...get().conversations,
            [agentId]: [...updated, { role: 'assistant', content: assistantContent }],
          },
        });
      }

      const finalMessages = get().conversations[agentId] || [];
      saveConversation(agentId, finalMessages);
    } catch (e) {
      get().addToast(`Code review error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    } finally {
      set({ isStreaming: false });
    }
  },

  sendSummary: async (agentId, content, sourceType) => {
    const { conversations } = get();
    const history = conversations[agentId] || [];
    const userMsg: ChatMessage = { role: 'user', content: `[Summarize] ${sourceType}\n${content.substring(0, 200)}...` };
    const updated = [...history, userMsg];

    set({
      conversations: { ...get().conversations, [agentId]: updated },
      isStreaming: true,
    });

    try {
      let assistantContent = '';
      set({
        conversations: {
          ...get().conversations,
          [agentId]: [...updated, { role: 'assistant', content: '' }],
        },
      });

      for await (const chunk of api.chat.stream('summarize', {
        agent_id: agentId, content, source_type: sourceType,
      })) {
        assistantContent += chunk;
        set({
          conversations: {
            ...get().conversations,
            [agentId]: [...updated, { role: 'assistant', content: assistantContent }],
          },
        });
      }

      const finalMessages = get().conversations[agentId] || [];
      saveConversation(agentId, finalMessages);
    } catch (e) {
      get().addToast(`Summary error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    } finally {
      set({ isStreaming: false });
    }
  },

  sendTransform: async (agentId, content, targetFormat, instruction) => {
    const { conversations } = get();
    const history = conversations[agentId] || [];
    const userMsg: ChatMessage = { role: 'user', content: `[Transform] ${instruction}\n${content.substring(0, 200)}...` };
    const updated = [...history, userMsg];

    set({
      conversations: { ...get().conversations, [agentId]: updated },
      isStreaming: true,
    });

    try {
      let assistantContent = '';
      set({
        conversations: {
          ...get().conversations,
          [agentId]: [...updated, { role: 'assistant', content: '' }],
        },
      });

      for await (const chunk of api.chat.stream('transform', {
        agent_id: agentId, content, target_format: targetFormat, instruction,
      })) {
        assistantContent += chunk;
        set({
          conversations: {
            ...get().conversations,
            [agentId]: [...updated, { role: 'assistant', content: assistantContent }],
          },
        });
      }

      const finalMessages = get().conversations[agentId] || [];
      saveConversation(agentId, finalMessages);
    } catch (e) {
      get().addToast(`Transform error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    } finally {
      set({ isStreaming: false });
    }
  },

  sendGenerate: async (agentId, parameters, instruction) => {
    const { conversations } = get();
    const history = conversations[agentId] || [];
    const userMsg: ChatMessage = { role: 'user', content: `[Generate] ${instruction}` };
    const updated = [...history, userMsg];

    set({
      conversations: { ...get().conversations, [agentId]: updated },
      isStreaming: true,
    });

    try {
      let assistantContent = '';
      set({
        conversations: {
          ...get().conversations,
          [agentId]: [...updated, { role: 'assistant', content: '' }],
        },
      });

      for await (const chunk of api.chat.stream('generate', {
        agent_id: agentId, parameters, instruction,
      })) {
        assistantContent += chunk;
        set({
          conversations: {
            ...get().conversations,
            [agentId]: [...updated, { role: 'assistant', content: assistantContent }],
          },
        });
      }

      const finalMessages = get().conversations[agentId] || [];
      saveConversation(agentId, finalMessages);
    } catch (e) {
      get().addToast(`Generate error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    } finally {
      set({ isStreaming: false });
    }
  },

  approveAction: async (actionId) => {
    try {
      const result = await api.chat.approveAction(actionId);
      get().addToast('Action approved and executed', 'success');
      return result;
    } catch (e) {
      get().addToast(`Approval failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
      throw e;
    }
  },

  denyAction: async (actionId) => {
    try {
      await api.chat.denyAction(actionId);
      get().addToast('Action denied', 'info');
    } catch (e) {
      get().addToast(`Deny failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    }
  },
}));
