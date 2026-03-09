import type { Agent, ChatMessage, OllamaModel, AppSettings, ModelCapability, KnowledgeBase, SystemInfo, PullProgress, Workflow, WorkflowExecution, WorkflowEvent, MCPServer, MCPTool, AgentChat, AgentChatDetail } from '../types/agent';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || res.statusText);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json();
}

export const api = {
  agents: {
    list: () => request<Agent[]>('/agents'),
    get: (id: string) => request<Agent>(`/agents/${id}`),
    create: (data: Partial<Agent>) =>
      request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Agent>) =>
      request<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/agents/${id}`, { method: 'DELETE' }),
    reorder: (orderedIds: string[]) =>
      request<{ status: string }>('/agents/reorder', {
        method: 'PUT',
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
  },

  ollama: {
    models: () => request<{ models: OllamaModel[] }>('/ollama/models').then((r) => r.models),
    status: () => request<{ status: string }>('/ollama/status').then((r) => r.status),
    systemInfo: () => request<SystemInfo>('/ollama/system'),
    deleteModel: (name: string) =>
      request<{ status: string }>(`/ollama/models/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    pullModel: async function* (modelName: string) {
      const res = await fetch(`${BASE}/ollama/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelName }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              yield JSON.parse(line.slice(6)) as PullProgress;
            } catch { /* skip malformed */ }
          }
        }
      }
    },
  },

  settings: {
    get: () => request<AppSettings>('/settings'),
    update: (settings: Record<string, string>) =>
      request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
    getModelCapabilities: () => request<ModelCapability[]>('/settings/models'),
    updateModelCapability: (data: ModelCapability) =>
      request<ModelCapability[]>('/settings/models', { method: 'PUT', body: JSON.stringify(data) }),
    syncModels: () =>
      request<{ models: ModelCapability[]; count: number }>('/settings/models/sync', { method: 'POST' }),
    pullModel: (model_name: string) =>
      request<{ success: boolean; model: string }>('/settings/models/pull', {
        method: 'POST',
        body: JSON.stringify({ model_name }),
      }),
    getDefaults: (agentType: string) =>
      request<{ model: string; system_prompt: string; temperature: string }>(`/settings/defaults/${agentType}`),
  },

  knowledge: {
    list: () => request<KnowledgeBase[]>('/knowledge'),
    get: (id: string) => request<KnowledgeBase>(`/knowledge/${id}`),
    create: (data: Partial<KnowledgeBase>) =>
      request<KnowledgeBase>('/knowledge', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<KnowledgeBase>) =>
      request<KnowledgeBase>(`/knowledge/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/knowledge/${id}`, { method: 'DELETE' }),
    stats: (id: string) => request<{ name: string; count: number; document_count: number; sources: string[] }>(`/knowledge/${id}/stats`),
    ingestFile: (id: string, filePath: string) =>
      request<{ chunks_added: number; source: string }>(`/knowledge/${id}/ingest/file`, {
        method: 'POST', body: JSON.stringify({ file_path: filePath }),
      }),
    ingestDirectory: (id: string, dirPath: string, extensions?: string[]) =>
      request<{ chunks_added: number; source: string }>(`/knowledge/${id}/ingest/directory`, {
        method: 'POST', body: JSON.stringify({ directory_path: dirPath, extensions }),
      }),
    upload: async (id: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE}/knowledge/${id}/ingest/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ chunks_added: number; source: string }>;
    },
    query: (id: string, query: string, topK = 5) =>
      request<{ results: { content: string; metadata: Record<string, unknown> }[]; context: string }>(
        `/knowledge/${id}/query`, { method: 'POST', body: JSON.stringify({ query, top_k: topK }) }
      ),
    linkAgent: (agentId: string, kbIds: string[]) =>
      request<{ status: string }>('/knowledge/agents/link', {
        method: 'POST', body: JSON.stringify({ agent_id: agentId, knowledge_base_ids: kbIds }),
      }),
    getAgentKBs: (agentId: string) => request<KnowledgeBase[]>(`/knowledge/agents/${agentId}/linked`),
    ensureEmbeddingModel: () =>
      request<{ status: string; model: string }>('/knowledge/ensure-embedding-model', { method: 'POST' }),
  },

  conversations: {
    load: (agentId: string) =>
      request<ChatMessage[]>(`/conversations/${agentId}`),
    save: (agentId: string, messages: ChatMessage[]) =>
      request<{ status: string }>(`/conversations/${agentId}`, {
        method: 'PUT',
        body: JSON.stringify({ messages }),
      }),
    delete: (agentId: string) =>
      request<void>(`/conversations/${agentId}`, { method: 'DELETE' }),
  },

  chat: {
    stream: async function* (endpoint: string, body: Record<string, unknown>) {
      const res = await fetch(`${BASE}/chat/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 422) throw new Error(`Validation error: input too large or invalid format`);
        if (res.status === 404) throw new Error('Agent not found — it may have been deleted');
        if (res.status >= 500) throw new Error(`Server error (${res.status}): ${text || 'Ollama may be unavailable'}`);
        throw new Error(text || `Request failed (${res.status})`);
      }
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') return;
              if (data.startsWith('[ERROR]')) {
                const errMsg = data.slice(8);
                if (errMsg.includes('Connection refused') || errMsg.includes('ConnectError'))
                  throw new Error('Cannot reach Ollama — is it running?');
                throw new Error(errMsg);
              }
              yield data.replace(/\\n/g, '\n');
            }
          }
        }
      } catch (e) {
        if (e instanceof TypeError && e.message.includes('network'))
          throw new Error('Network connection lost during streaming');
        throw e;
      }
    },

    agentToAgent: async function* (agentAId: string, agentBId: string, topic: string, maxTurns = 6) {
      const res = await fetch(`${BASE}/chat/agent-to-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_a_id: agentAId, agent_b_id: agentBId, topic, max_turns: maxTurns }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            if (data.startsWith('[ERROR]')) throw new Error(data.slice(8));
            try {
              yield JSON.parse(data) as { type: string; turn?: number; agent_name?: string; content?: string; full_content?: string };
            } catch { /* skip malformed */ }
          }
        }
      }
    },

    approveAction: (actionId: string) =>
      request<{ status: string; result: string }>('/chat/action/approve', {
        method: 'POST',
        body: JSON.stringify({ action_id: actionId, approved: true }),
      }).then((r) => r.result),

    denyAction: (actionId: string) =>
      request<{ status: string }>('/chat/action/approve', {
        method: 'POST',
        body: JSON.stringify({ action_id: actionId, approved: false }),
      }),
  },

  workflows: {
    list: () => request<Workflow[]>('/workflows'),
    get: (id: string) => request<Workflow>(`/workflows/${id}`),
    create: (data: Partial<Workflow>) =>
      request<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Workflow>) =>
      request<Workflow>(`/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/workflows/${id}`, { method: 'DELETE' }),
    executions: (workflowId: string) =>
      request<WorkflowExecution[]>(`/workflows/${workflowId}/executions`),
    getExecution: (executionId: string) =>
      request<WorkflowExecution>(`/workflows/executions/${executionId}`),
    cancelExecution: (executionId: string) =>
      request<{ status: string }>(`/workflows/executions/${executionId}/cancel`, { method: 'POST' }),
    execute: async function* (workflowId: string, initialInput = '', trigger = 'manual') {
      const res = await fetch(`${BASE}/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_input: initialInput, trigger }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              yield JSON.parse(line.slice(6)) as WorkflowEvent;
            } catch { /* skip malformed */ }
          }
        }
      }
    },
    resume: async function* (executionId: string) {
      const res = await fetch(`${BASE}/workflows/executions/${executionId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              yield JSON.parse(line.slice(6)) as WorkflowEvent;
            } catch { /* skip malformed */ }
          }
        }
      }
    },
  },

  agentChats: {
    list: () => request<AgentChat[]>('/agent-chats'),
    get: (id: string) => request<AgentChatDetail>(`/agent-chats/${id}`),
    delete: (id: string) => request<void>(`/agent-chats/${id}`, { method: 'DELETE' }),
    create: async function* (agentAId: string, agentBId: string, topic: string, maxTurns = 6, signal?: AbortSignal) {
      const res = await fetch(`${BASE}/agent-chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_a_id: agentAId, agent_b_id: agentBId, topic, max_turns: maxTurns }),
        signal,
      });
      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            if (data.startsWith('[ERROR]')) throw new Error(data.slice(8));
            try {
              yield JSON.parse(data) as { type: string; turn?: number; agent_name?: string; content?: string; full_content?: string; chat_id?: string };
            } catch { /* skip malformed */ }
          }
        }
      }
    },
    continue: async function* (chatId: string, maxTurns = 4, redirectTopic?: string, signal?: AbortSignal) {
      const body: Record<string, unknown> = { max_turns: maxTurns };
      if (redirectTopic) body.redirect_topic = redirectTopic;

      const res = await fetch(`${BASE}/agent-chats/${chatId}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            if (data.startsWith('[ERROR]')) throw new Error(data.slice(8));
            try {
              yield JSON.parse(data) as { type: string; turn?: number; agent_name?: string; content?: string; full_content?: string; chat_id?: string };
            } catch { /* skip malformed */ }
          }
        }
      }
    },
  },

  mcp: {
    servers: {
      list: () => request<MCPServer[]>('/mcp/servers'),
      get: (id: string) => request<MCPServer>(`/mcp/servers/${id}`),
      create: (data: Partial<MCPServer>) =>
        request<MCPServer>('/mcp/servers', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Partial<MCPServer>) =>
        request<MCPServer>(`/mcp/servers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) =>
        request<void>(`/mcp/servers/${id}`, { method: 'DELETE' }),
      test: (id: string) =>
        request<{ status: string; tools?: string[]; tool_count?: number; error?: string }>(
          `/mcp/servers/${id}/test`, { method: 'POST' }
        ),
      tools: (id: string) =>
        request<{ server_id: string; server_name: string; tools: MCPTool[] }>(
          `/mcp/servers/${id}/tools`
        ),
    },
    health: () =>
      request<Record<string, { healthy: boolean; last_ping_at: string | null; failed_pings: number; tool_count: number; process_alive: boolean }>>(
        '/mcp/health'
      ),
    agents: {
      link: (agentId: string, mcpServerIds: string[]) =>
        request<{ status: string }>('/mcp/agents/link', {
          method: 'POST',
          body: JSON.stringify({ agent_id: agentId, mcp_server_ids: mcpServerIds }),
        }),
      linked: (agentId: string) => request<MCPServer[]>(`/mcp/agents/${agentId}/linked`),
      linkedIds: (agentId: string) =>
        request<{ mcp_server_ids: string[] }>(`/mcp/agents/${agentId}/linked-ids`)
          .then((r) => r.mcp_server_ids),
    },
  },
};
