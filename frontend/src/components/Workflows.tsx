import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useStore } from '../store/useStore';
import type { Workflow, WorkflowStep, WorkflowExecution, WorkflowEvent, Agent, StepResult } from '../types/agent';

// ─── STATUS STYLING ──────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-surface-700', text: 'text-surface-400', label: 'Pending' },
  running: { bg: 'bg-accent-amber/20', text: 'text-accent-amber', label: 'Running' },
  completed: { bg: 'bg-accent-emerald/20', text: 'text-accent-emerald', label: 'Completed' },
  failed: { bg: 'bg-accent-rose/20', text: 'text-accent-rose', label: 'Failed' },
  paused: { bg: 'bg-accent-violet/20', text: 'text-accent-violet', label: 'Paused' },
  cancelled: { bg: 'bg-surface-600', text: 'text-surface-400', label: 'Cancelled' },
  skipped: { bg: 'bg-surface-600', text: 'text-surface-400', label: 'Skipped' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-medium ${style.bg} ${style.text}`}>
      {status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {style.label}
    </span>
  );
}

// ─── PIPELINE VISUAL ──────────────────────────────────────────

function PipelineNode({
  step,
  agent,
  index,
  total,
  isActive,
  result,
  onClick,
  onRemove,
}: {
  step: WorkflowStep;
  agent?: Agent;
  index: number;
  total: number;
  isActive: boolean;
  result?: StepResult;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const agentColor = agent?.color || '#4a4f6a';
  const statusColor = result?.status === 'completed' ? '#10b981'
    : result?.status === 'running' ? '#f59e0b'
    : result?.status === 'failed' ? '#f43f5e'
    : agentColor;

  return (
    <div className="flex items-center">
      <div
        onClick={onClick}
        className={`relative w-44 glass noise rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] ${
          isActive ? 'ring-2 ring-accent-cyan/40' : ''
        } ${result?.status === 'running' ? 'ring-2 ring-accent-amber/40' : ''}`}
        style={{ borderLeft: `3px solid ${statusColor}` }}
      >
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-500 hover:text-accent-rose hover:border-accent-rose/30 transition-colors cursor-pointer"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
            style={{ background: agentColor }}
          >
            {index + 1}
          </div>
          <span className="text-[11px] text-surface-500 font-medium">Step {index + 1}</span>
        </div>

        <p className="text-xs font-semibold text-slate-200 truncate mb-1">
          {step.label || agent?.name || 'Select Agent'}
        </p>
        <p className="text-[10px] text-surface-500 truncate">
          {agent?.agent_type || 'No agent'}
        </p>

        {result && (
          <div className="mt-2 pt-2 border-t border-white/5">
            <StatusBadge status={result.status} />
            {result.duration_ms !== null && result.duration_ms !== undefined && (
              <span className="ml-2 text-[10px] text-surface-600">{(result.duration_ms / 1000).toFixed(1)}s</span>
            )}
          </div>
        )}
      </div>

      {index < total - 1 && (
        <div className="flex items-center mx-2">
          <div className="w-8 h-0.5 bg-surface-700" />
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none" className="text-surface-600 -ml-1">
            <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

function AddStepButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex items-center">
      <div className="flex items-center mx-2">
        <div className="w-8 h-0.5 bg-surface-700" />
        <svg width="8" height="12" viewBox="0 0 8 12" fill="none" className="text-surface-600 -ml-1">
          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <button
        onClick={onClick}
        className="w-44 h-24 rounded-2xl border-2 border-dashed border-surface-700 hover:border-accent-cyan/30 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-surface-600 group-hover:text-accent-cyan transition-colors">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span className="text-[11px] text-surface-600 group-hover:text-accent-cyan transition-colors font-medium">Add Step</span>
      </button>
    </div>
  );
}

// ─── STEP EDITOR ──────────────────────────────────────────────

function StepEditor({
  step,
  agents,
  onChange,
  onClose,
}: {
  step: WorkflowStep;
  agents: Agent[];
  onChange: (updated: WorkflowStep) => void;
  onClose: () => void;
}) {
  const selectedAgent = agents.find((a) => a.id === step.agent_id);

  return (
    <div className="glass noise rounded-2xl p-5 space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">Configure Step {step.step_order + 1}</h4>
        <button onClick={onClose} className="text-surface-500 hover:text-slate-200 transition-colors cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-500 mb-1.5">Agent</label>
        <select
          value={step.agent_id}
          onChange={(e) => {
            const agent = agents.find((a) => a.id === e.target.value);
            onChange({
              ...step,
              agent_id: e.target.value,
              label: step.label || agent?.name || '',
            });
          }}
          className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 appearance-none cursor-pointer"
        >
          <option value="">Select an agent...</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.agent_type})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-500 mb-1.5">Step Label</label>
        <input
          value={step.label}
          onChange={(e) => onChange({ ...step, label: e.target.value })}
          placeholder={selectedAgent?.name || 'Step name'}
          className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors placeholder:text-surface-600"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-500 mb-1.5">
          Input Template
          <span className="ml-2 text-[10px] text-surface-600">
            Use {'{{previous_output}}'} to inject the previous step's output
          </span>
        </label>
        <textarea
          value={step.input_template}
          onChange={(e) => onChange({ ...step, input_template: e.target.value })}
          rows={4}
          className="w-full px-4 py-3 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors resize-none font-mono leading-relaxed"
          placeholder="{{previous_output}}"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-500 mb-1.5">Timeout (seconds)</label>
        <input
          type="number"
          value={step.timeout_seconds}
          onChange={(e) => onChange({ ...step, timeout_seconds: parseInt(e.target.value) || 300 })}
          min={30}
          max={3600}
          className="w-32 px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors"
        />
      </div>
    </div>
  );
}

// ─── WORKFLOW BUILDER MODAL ──────────────────────────────────

function WorkflowBuilder({
  workflow,
  agents,
  onSave,
  onClose,
}: {
  workflow?: Workflow;
  agents: Agent[];
  onSave: (data: Partial<Workflow>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [steps, setSteps] = useState<WorkflowStep[]>(
    workflow?.steps || []
  );
  const [schedule, setSchedule] = useState(workflow?.schedule || '');
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const addStep = () => {
    const newStep: WorkflowStep = {
      step_order: steps.length,
      agent_id: '',
      label: '',
      input_template: '{{previous_output}}',
      timeout_seconds: 300,
    };
    setSteps([...steps, newStep]);
    setEditingStep(steps.length);
  };

  const updateStep = (index: number, updated: WorkflowStep) => {
    const newSteps = [...steps];
    newSteps[index] = updated;
    setSteps(newSteps);
  };

  const removeStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i }));
    setSteps(newSteps);
    if (editingStep === index) setEditingStep(null);
    else if (editingStep !== null && editingStep > index) setEditingStep(editingStep - 1);
  };

  const handleSave = async () => {
    if (!name.trim() || steps.length === 0) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        steps,
        schedule: schedule.trim() || null,
        enabled: true,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 px-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto glass noise rounded-3xl p-8 fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-200 font-[family-name:var(--font-display)]">
            {workflow ? 'Edit Workflow' : 'New Workflow'}
          </h2>
          <button onClick={onClose} className="text-surface-500 hover:text-slate-200 transition-colors cursor-pointer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Workflow Metadata */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Workflow Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Content Pipeline"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors placeholder:text-surface-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">
              Schedule (cron)
              <span className="ml-2 text-[10px] text-surface-600">Leave empty for manual only</span>
            </label>
            <input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="e.g., 0 9 * * * (daily at 9am)"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors placeholder:text-surface-600 font-mono"
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-medium text-surface-500 mb-1.5">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this workflow do?"
            className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors placeholder:text-surface-600"
          />
        </div>

        {/* Visual Pipeline */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Pipeline</h3>
          <div className="overflow-x-auto py-3">
            <div className="flex items-center min-w-min">
              {steps.map((step, i) => (
                <PipelineNode
                  key={i}
                  step={step}
                  agent={agents.find((a) => a.id === step.agent_id)}
                  index={i}
                  total={steps.length}
                  isActive={editingStep === i}
                  onClick={() => setEditingStep(editingStep === i ? null : i)}
                  onRemove={() => removeStep(i)}
                />
              ))}
              <AddStepButton onClick={addStep} />
            </div>
          </div>
        </div>

        {/* Step Editor */}
        {editingStep !== null && steps[editingStep] && (
          <div className="mb-6">
            <StepEditor
              step={steps[editingStep]}
              agents={agents}
              onChange={(updated) => updateStep(editingStep, updated)}
              onClose={() => setEditingStep(null)}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <p className="text-xs text-surface-500">
            {steps.length} step{steps.length !== 1 ? 's' : ''} in pipeline
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-sm text-surface-500 hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || steps.length === 0 || steps.some((s) => !s.agent_id)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-accent-cyan text-sm font-medium hover:from-accent-cyan/25 hover:to-accent-blue/25 hover:border-accent-cyan/40 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : workflow ? 'Update Workflow' : 'Create Workflow'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EXECUTION MONITOR ──────────────────────────────────────

function ExecutionMonitor({
  workflow,
  agents,
  onClose,
}: {
  workflow: Workflow;
  agents: Agent[];
  onClose: () => void;
}) {
  const { addToast } = useStore();
  const [executing, setExecuting] = useState(false);
  const [initialInput, setInitialInput] = useState('');
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [stepOutputs, setStepOutputs] = useState<Record<number, string>>({});
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<string>('idle');
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.workflows.executions(workflow.id).then(setExecutions).catch(() => {});
  }, [workflow.id, executionStatus]);

  const runWorkflow = async () => {
    setExecuting(true);
    setStepResults([]);
    setStepOutputs({});
    setActiveStep(null);
    setExecutionStatus('running');

    try {
      for await (const event of api.workflows.execute(workflow.id, initialInput)) {
        handleEvent(event);
      }
    } catch (err) {
      addToast(`Workflow failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      setExecutionStatus('failed');
    } finally {
      setExecuting(false);
    }
  };

  const resumeExecution = async (execId: string) => {
    setExecuting(true);
    setExecutionStatus('running');

    // Load existing results from the execution
    try {
      const exec = await api.workflows.getExecution(execId);
      setStepResults(exec.step_results as StepResult[]);
      setExecutionId(execId);

      for await (const event of api.workflows.resume(execId)) {
        handleEvent(event);
      }
    } catch (err) {
      addToast(`Resume failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      setExecutionStatus('failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleEvent = (event: WorkflowEvent) => {
    switch (event.type) {
      case 'execution_started':
        setExecutionId(event.execution_id || null);
        break;

      case 'step_started':
        setActiveStep(event.step_order ?? null);
        setStepResults((prev) => [
          ...prev.filter((r) => r.step_order !== event.step_order),
          {
            step_order: event.step_order!,
            agent_id: event.agent_id || '',
            agent_name: event.agent_name || '',
            input: '',
            output: '',
            status: 'running',
            started_at: new Date().toISOString(),
            completed_at: null,
            duration_ms: null,
            error: null,
          },
        ]);
        break;

      case 'step_chunk':
        if (event.step_order !== undefined) {
          setStepOutputs((prev) => ({
            ...prev,
            [event.step_order!]: (prev[event.step_order!] || '') + (event.chunk || ''),
          }));
          // Auto-scroll
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
        }
        break;

      case 'step_completed':
        if (event.step_order !== undefined) {
          setStepResults((prev) =>
            prev.map((r) =>
              r.step_order === event.step_order
                ? { ...r, status: 'completed', output: event.output || '', completed_at: new Date().toISOString() }
                : r
            )
          );
        }
        break;

      case 'step_failed':
        if (event.step_order !== undefined) {
          setStepResults((prev) =>
            prev.map((r) =>
              r.step_order === event.step_order
                ? { ...r, status: 'failed', error: event.error || 'Unknown error', completed_at: new Date().toISOString() }
                : r
            )
          );
        }
        break;

      case 'execution_completed':
        setExecutionStatus('completed');
        addToast('Workflow completed successfully', 'success');
        break;

      case 'execution_failed':
        setExecutionStatus('failed');
        addToast(`Workflow failed: ${event.error}`, 'error');
        break;

      case 'execution_cancelled':
        setExecutionStatus('cancelled');
        addToast('Workflow cancelled', 'info');
        break;
    }
  };

  const viewedStep = activeStep ?? (stepResults.length > 0 ? stepResults[stepResults.length - 1].step_order : null);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-12 px-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-[88vh] overflow-y-auto glass noise rounded-3xl p-8 fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-200 font-[family-name:var(--font-display)]">
              {workflow.name}
            </h2>
            <p className="text-xs text-surface-500">{workflow.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={executionStatus} />
            {executing && executionId && (
              <button
                onClick={async () => {
                  try {
                    await api.workflows.cancelExecution(executionId);
                  } catch {
                    addToast('Failed to cancel workflow', 'error');
                  }
                }}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-accent-rose/10 border border-accent-rose/20 text-accent-rose hover:border-accent-rose/40 transition-all cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button onClick={onClose} className="text-surface-500 hover:text-slate-200 transition-colors cursor-pointer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Visual Pipeline with live results */}
        <div className="overflow-x-auto pb-4 mb-5">
          <div className="flex items-center min-w-min">
            {workflow.steps.map((step, i) => {
              const result = stepResults.find((r) => r.step_order === i);
              return (
                <PipelineNode
                  key={i}
                  step={step}
                  agent={agents.find((a) => a.id === step.agent_id)}
                  index={i}
                  total={workflow.steps.length}
                  isActive={viewedStep === i}
                  result={result}
                  onClick={() => setActiveStep(i)}
                />
              );
            })}
          </div>
        </div>

        {/* Input + Run */}
        {!executing && executionStatus !== 'running' && (
          <div className="flex gap-3 mb-5">
            <input
              value={initialInput}
              onChange={(e) => setInitialInput(e.target.value)}
              placeholder="Initial input for the first step (optional)..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-700 text-sm focus:outline-none focus:border-accent-cyan/50 transition-colors placeholder:text-surface-600"
              onKeyDown={(e) => e.key === 'Enter' && runWorkflow()}
            />
            <button
              onClick={runWorkflow}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-emerald/15 to-accent-cyan/15 border border-accent-emerald/20 text-accent-emerald text-sm font-medium hover:border-accent-emerald/40 transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run
              </span>
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-surface-500 text-sm hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
            >
              History
            </button>
          </div>
        )}

        {/* Step Output Viewer */}
        {viewedStep !== null && (
          <div className="glass noise rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-200">
                Step {viewedStep + 1}: {workflow.steps[viewedStep]?.label || agents.find((a) => a.id === workflow.steps[viewedStep]?.agent_id)?.name || 'Unknown'}
              </h4>
              {stepResults.find((r) => r.step_order === viewedStep) && (
                <StatusBadge status={stepResults.find((r) => r.step_order === viewedStep)!.status} />
              )}
            </div>
            <div
              ref={outputRef}
              className="bg-surface-900 rounded-xl p-4 max-h-64 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap"
            >
              {stepOutputs[viewedStep] || (
                stepResults.find((r) => r.step_order === viewedStep)?.output || (
                  stepResults.find((r) => r.step_order === viewedStep)?.error ? (
                    <span className="text-accent-rose">{stepResults.find((r) => r.step_order === viewedStep)?.error}</span>
                  ) : (
                    <span className="text-surface-600">Waiting to execute...</span>
                  )
                )
              )}
              {executing && activeStep === viewedStep && (
                <span className="inline-block w-2 h-4 bg-accent-cyan/70 animate-pulse ml-0.5" />
              )}
            </div>
          </div>
        )}

        {/* Execution History */}
        {showHistory && (
          <div className="glass noise rounded-2xl p-5 fade-in">
            <h4 className="text-sm font-semibold text-slate-200 mb-3">Execution History</h4>
            {executions.length === 0 ? (
              <p className="text-xs text-surface-500">No executions yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {executions.map((exec) => (
                  <div key={exec.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-900 border border-surface-800">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={exec.status} />
                      <span className="text-xs text-surface-500">
                        {exec.trigger} &middot; {exec.started_at ? new Date(exec.started_at).toLocaleString() : 'N/A'}
                      </span>
                      <span className="text-xs text-surface-600">
                        {exec.step_results.length} step{exec.step_results.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {exec.status === 'failed' && (
                      <button
                        onClick={() => resumeExecution(exec.id)}
                        disabled={executing}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-accent-amber/10 border border-accent-amber/20 text-accent-amber hover:border-accent-amber/40 transition-all cursor-pointer disabled:opacity-40"
                      >
                        Resume
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WORKFLOWS PAGE ──────────────────────────────────────────

export function Workflows() {
  const navigate = useNavigate();
  const { agents, fetchAgents, addToast } = useStore();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | undefined>();
  const [runningWorkflow, setRunningWorkflow] = useState<Workflow | null>(null);

  const loadWorkflows = useCallback(async () => {
    try {
      const list = await api.workflows.list();
      setWorkflows(list);
    } catch {
      addToast('Failed to load workflows', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchAgents();
    loadWorkflows();
  }, [fetchAgents, loadWorkflows]);

  const handleCreate = async (data: Partial<Workflow>) => {
    await api.workflows.create(data);
    addToast('Workflow created', 'success');
    await loadWorkflows();
  };

  const handleUpdate = async (data: Partial<Workflow>) => {
    if (!editingWorkflow) return;
    await api.workflows.update(editingWorkflow.id, data);
    addToast('Workflow updated', 'success');
    await loadWorkflows();
  };

  const handleDelete = async (id: string) => {
    await api.workflows.delete(id);
    addToast('Workflow deleted', 'success');
    await loadWorkflows();
  };

  const handleToggle = async (workflow: Workflow) => {
    await api.workflows.update(workflow.id, { enabled: !workflow.enabled });
    await loadWorkflows();
  };

  const getStepAgentNames = (workflow: Workflow) => {
    return workflow.steps.map((step) => {
      const agent = agents.find((a) => a.id === step.agent_id);
      return step.label || agent?.name || 'Unknown';
    });
  };

  return (
    <div className="min-h-screen bg-surface-950">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent-cyan/[0.02] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent-violet/[0.02] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10">
        {/* Header */}
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
                <h1 className="text-lg font-semibold tracking-tight font-[family-name:var(--font-display)]">Workflows</h1>
                <p className="text-xs text-surface-500">Chain agents into automated pipelines</p>
              </div>
            </div>

            <button
              onClick={() => { setEditingWorkflow(undefined); setShowBuilder(true); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan/15 to-accent-blue/15 border border-accent-cyan/20 text-accent-cyan text-sm font-medium hover:from-accent-cyan/25 hover:to-accent-blue/25 hover:border-accent-cyan/40 transition-all cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Workflow
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass noise rounded-2xl p-6 animate-pulse">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="h-4 w-40 rounded-lg bg-surface-700/50 mb-2" />
                      <div className="h-3 w-64 rounded bg-surface-700/30 mb-3" />
                      <div className="flex gap-1">
                        {Array.from({ length: 3 }).map((_, j) => (
                          <div key={j} className="h-6 w-20 rounded-lg bg-surface-700/30" />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-8 h-8 rounded-lg bg-surface-700/30" />
                      <div className="w-8 h-8 rounded-lg bg-surface-700/30" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="w-20 h-20 rounded-2xl glass flex items-center justify-center mb-6">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-surface-600">
                  <path d="M4 12h4m4 0h4m4 0h0" />
                  <circle cx="4" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="20" cy="12" r="2" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-surface-500 mb-2 font-[family-name:var(--font-display)]">
                No workflows yet
              </h2>
              <p className="text-sm text-surface-600 mb-1">Chain agents into automated pipelines</p>
              <p className="text-xs text-surface-600 mb-6">Pass output from one agent to the next, schedule runs with cron, and resume from failures</p>
              <button
                onClick={() => { setEditingWorkflow(undefined); setShowBuilder(true); }}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-sm font-medium text-white hover:brightness-110 transition-all cursor-pointer"
              >
                Create Workflow
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {workflows.map((workflow) => {
                const stepNames = getStepAgentNames(workflow);

                return (
                  <div key={workflow.id} className="glass noise glass-hover rounded-2xl p-6 transition-all">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-sm font-semibold text-slate-200">{workflow.name}</h3>
                          {!workflow.enabled && (
                            <span className="px-2 py-0.5 rounded-md bg-surface-700 text-surface-500 text-[10px] font-medium">
                              Disabled
                            </span>
                          )}
                          {workflow.schedule && (
                            <span className="px-2 py-0.5 rounded-md bg-accent-violet/10 text-accent-violet text-[10px] font-mono">
                              {workflow.schedule}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-surface-500 mb-3">{workflow.description}</p>

                        {/* Mini pipeline visualization */}
                        <div className="flex items-center gap-1 flex-wrap">
                          {stepNames.map((name, i) => (
                            <div key={i} className="flex items-center">
                              <span className="px-2.5 py-1 rounded-lg bg-surface-800 border border-surface-700 text-[11px] text-surface-400 font-medium">
                                {name}
                              </span>
                              {i < stepNames.length - 1 && (
                                <svg width="12" height="8" viewBox="0 0 12 8" className="text-surface-600 mx-0.5">
                                  <path d="M1 4h8m-3-3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => setRunningWorkflow(workflow)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-accent-emerald/15 to-accent-cyan/15 border border-accent-emerald/20 text-accent-emerald text-xs font-medium hover:border-accent-emerald/40 transition-all cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            Run
                          </span>
                        </button>
                        <button
                          onClick={() => handleToggle(workflow)}
                          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                            workflow.enabled
                              ? 'bg-accent-amber/10 border-accent-amber/20 text-accent-amber'
                              : 'bg-surface-800 border-surface-700 text-surface-500'
                          }`}
                        >
                          {workflow.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        <button
                          onClick={() => { setEditingWorkflow(workflow); setShowBuilder(true); }}
                          className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-surface-500 text-xs hover:text-slate-200 hover:border-surface-600 transition-all cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(workflow.id)}
                          className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-700 text-surface-500 text-xs hover:text-accent-rose hover:border-accent-rose/30 transition-all cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Builder Modal */}
      {showBuilder && (
        <WorkflowBuilder
          workflow={editingWorkflow}
          agents={agents}
          onSave={editingWorkflow ? handleUpdate : handleCreate}
          onClose={() => { setShowBuilder(false); setEditingWorkflow(undefined); }}
        />
      )}

      {/* Execution Monitor */}
      {runningWorkflow && (
        <ExecutionMonitor
          workflow={runningWorkflow}
          agents={agents}
          onClose={() => setRunningWorkflow(null)}
        />
      )}
    </div>
  );
}
