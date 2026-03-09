export type AgentType = 'chat' | 'summarizer' | 'code' | 'file' | 'generator' | 'transformer' | 'reasoning';
export type ConfirmationMode = 'auto' | 'confirm';

export const AGENT_TYPES: AgentType[] = ['chat', 'summarizer', 'code', 'file', 'generator', 'transformer', 'reasoning'];

export interface Agent {
  id: string;
  name: string;
  description: string;
  agent_type: AgentType;
  model: string;
  system_prompt: string;
  input_schema: Record<string, string>;
  icon: string;
  color: string;
  tools_enabled: boolean;
  allowed_directories: string[];
  confirmation_mode: ConfirmationMode;
  allowed_commands: string[];
  sort_order: number;
  message_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];  // base64 data URIs for multimodal
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  details?: Record<string, unknown>;
}

export interface ModelCapability {
  model_name: string;
  capabilities: string[];
  default_for: string;
  temperature: string;
  context_length: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  collection_name: string;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  document_count: number;
  chunk_count: number;
  sources: string[];
  created_at: string;
  updated_at: string;
}

export interface SystemInfo {
  os: string;
  os_version: string;
  arch: string;
  cpu_name: string;
  cpu_cores: number;
  ram_gb: number;
  gpu_name: string;
  gpu_memory_gb: number;
  chip: string;
  is_apple_silicon: boolean;
  recommended_max_model_gb: number;
}

export interface PullProgress {
  status: string;
  total?: number;
  completed?: number;
  digest?: string;
  error?: string;
}

export interface AppSettings {
  ollama_host: string;
  auto_reconnect_interval: string;
  grid_density: string;
  conversation_persistence: string;
  max_conversation_length: string;
  theme: string;
  [key: string]: string;
}

export interface WorkflowStep {
  step_order: number;
  agent_id: string;
  label: string;
  input_template: string;
  timeout_seconds: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  schedule: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface StepResult {
  step_order: number;
  agent_id: string;
  agent_name: string;
  input: string;
  output: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  current_step: number;
  trigger: 'manual' | 'scheduled' | 'on_completion';
  step_results: StepResult[];
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface WorkflowEvent {
  type: 'execution_started' | 'step_started' | 'step_chunk' | 'step_completed' | 'step_failed' | 'execution_completed' | 'execution_failed';
  execution_id?: string;
  step_order?: number;
  agent_name?: string;
  agent_id?: string;
  chunk?: string;
  output?: string;
  error?: string;
}

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'sse';
  command: string | null;
  args: string[];
  env: Record<string, string>;
  url: string | null;
  icon: string;
  color: string;
  enabled: boolean;
  preset_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MCPTool {
  name: string;
  description: string;
  server_id: string;
  server_name: string;
  input_schema: Record<string, unknown>;
}

export interface AgentChat {
  id: string;
  agent_a_id: string;
  agent_b_id: string;
  agent_a_name: string;
  agent_b_name: string;
  agent_a_model: string;
  agent_b_model: string;
  topic: string;
  total_turns: number;
  created_at: string;
  updated_at: string;
  last_message_preview?: string;
  last_agent_name?: string;
}

export interface AgentChatMessage {
  id: string;
  chat_id: string;
  turn: number;
  agent_id: string;
  agent_name: string;
  content: string;
  created_at: string;
}

export interface AgentChatDetail extends AgentChat {
  messages: AgentChatMessage[];
}
