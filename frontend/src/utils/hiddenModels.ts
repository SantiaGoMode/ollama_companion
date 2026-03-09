const STORAGE_KEY = 'agent-hub-hidden-models';

export function getHiddenModels(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function setHiddenModels(hidden: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
}

export function toggleModelHidden(modelName: string): Set<string> {
  const hidden = getHiddenModels();
  if (hidden.has(modelName)) {
    hidden.delete(modelName);
  } else {
    hidden.add(modelName);
  }
  setHiddenModels(hidden);
  return hidden;
}
