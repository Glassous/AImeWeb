import { ref } from 'vue'

export interface ModelGroup {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  providerUrl: string
  createdAt: number
}

export interface ModelItem {
  id: string
  groupId: string
  modelName: string
  name: string
  createdAt: number
  remark?: string
}

export interface ModelConfig {
  exportedAt: number
  modelGroups: ModelGroup[]
  models: ModelItem[]
  selectedModelId: string
  version: number
}

const LS_KEY = 'model_config'

function now() {
  return Date.now()
}

function uuid() {
  // Use crypto.randomUUID if available, fallback to timestamp-based
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? (crypto as any).randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now()
}

function loadFromLocalStorage(): ModelConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Basic schema guard
    if (
      parsed &&
      Array.isArray(parsed.modelGroups) &&
      Array.isArray(parsed.models) &&
      typeof parsed.selectedModelId === 'string'
    ) {
      return parsed as ModelConfig
    }
  } catch {}
  return null
}

const defaultConfig: ModelConfig = {
  exportedAt: now(),
  modelGroups: [],
  models: [],
  selectedModelId: '',
  version: 1,
}

export const modelConfig = ref<ModelConfig>(loadFromLocalStorage() || defaultConfig)

export function saveModelConfig() {
  modelConfig.value.exportedAt = now()
  localStorage.setItem(LS_KEY, JSON.stringify(modelConfig.value))
}

export function exportConfig(): ModelConfig {
  // Deep clone to avoid accidental mutations
  return JSON.parse(JSON.stringify(modelConfig.value)) as ModelConfig
}

function sanitizeString(val: any, def = ''): string {
  return typeof val === 'string' ? val : def
}

function sanitizeNumber(val: any, def = now()): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : def
}

function normalizeConfig(input: any): ModelConfig | null {
  if (!input || typeof input !== 'object') return null
  const groupsInput = Array.isArray(input.modelGroups) ? input.modelGroups : []
  const modelsInput = Array.isArray(input.models) ? input.models : []
  const groups: ModelGroup[] = groupsInput.map((g: any) => ({
    id: sanitizeString(g.id, uuid()),
    name: sanitizeString(g.name),
    baseUrl: sanitizeString(g.baseUrl),
    apiKey: sanitizeString(g.apiKey),
    providerUrl: sanitizeString(g.providerUrl),
    createdAt: sanitizeNumber(g.createdAt),
  }))
  // Build set of valid group ids
  const validGroupIds = new Set(groups.map(g => g.id))
  const models: ModelItem[] = modelsInput
    .map((m: any) => ({
      id: sanitizeString(m.id, uuid()),
      groupId: sanitizeString(m.groupId),
      modelName: sanitizeString(m.modelName),
      name: sanitizeString(m.name),
      createdAt: sanitizeNumber(m.createdAt),
      remark: sanitizeString(m.remark, undefined as any),
    }))
    .filter((m: ModelItem) => validGroupIds.has(m.groupId))

  const selectedModelId = sanitizeString(input.selectedModelId)
  const normalized: ModelConfig = {
    exportedAt: now(),
    modelGroups: groups,
    models,
    selectedModelId: models.find(m => m.id === selectedModelId)?.id ?? '',
    version: typeof input.version === 'number' ? input.version : 1,
  }
  return normalized
}

export function replaceConfig(input: any): { ok: boolean; error?: string } {
  try {
    const normalized = normalizeConfig(input)
    if (!normalized) return { ok: false, error: '格式错误：不是有效的对象' }
    modelConfig.value = normalized
    saveModelConfig()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function addGroup(payload: Omit<ModelGroup, 'id' | 'createdAt'> & Partial<Pick<ModelGroup, 'createdAt'>>) {
  const group: ModelGroup = {
    id: uuid(),
    createdAt: payload.createdAt ?? now(),
    name: payload.name,
    baseUrl: payload.baseUrl,
    apiKey: payload.apiKey,
    providerUrl: payload.providerUrl,
  }
  modelConfig.value.modelGroups.push(group)
  saveModelConfig()
  return group
}

export function updateGroup(id: string, patch: Partial<ModelGroup>) {
  const idx = modelConfig.value.modelGroups.findIndex(g => g.id === id)
  if (idx !== -1) {
    modelConfig.value.modelGroups[idx] = {
      ...modelConfig.value.modelGroups[idx],
      ...patch,
    } as ModelGroup
    saveModelConfig()
  }
}

export function removeGroup(id: string) {
  modelConfig.value.modelGroups = modelConfig.value.modelGroups.filter(g => g.id !== id)
  // Also remove models belonging to this group
  modelConfig.value.models = modelConfig.value.models.filter(m => m.groupId !== id)
  if (modelConfig.value.selectedModelId && !modelConfig.value.models.find(m => m.id === modelConfig.value.selectedModelId)) {
    modelConfig.value.selectedModelId = ''
  }
  saveModelConfig()
}

export function addModel(payload: Omit<ModelItem, 'id' | 'createdAt'> & Partial<Pick<ModelItem, 'createdAt'>>) {
  const model: ModelItem = {
    id: uuid(),
    createdAt: payload.createdAt ?? now(),
    groupId: payload.groupId,
    modelName: payload.modelName,
    name: payload.name,
    remark: payload.remark,
  }
  modelConfig.value.models.push(model)
  saveModelConfig()
  return model
}

export function updateModel(id: string, patch: Partial<ModelItem>) {
  const idx = modelConfig.value.models.findIndex(m => m.id === id)
  if (idx !== -1) {
    modelConfig.value.models[idx] = {
      ...modelConfig.value.models[idx],
      ...patch,
    } as ModelItem
    saveModelConfig()
  }
}

export function removeModel(id: string) {
  modelConfig.value.models = modelConfig.value.models.filter(m => m.id !== id)
  if (modelConfig.value.selectedModelId === id) {
    modelConfig.value.selectedModelId = ''
  }
  saveModelConfig()
}

export function setSelectedModel(id: string) {
  modelConfig.value.selectedModelId = id
  saveModelConfig()
}

export function getGroupById(id: string) {
  return modelConfig.value.modelGroups.find(g => g.id === id)
}

export function getModelsByGroup(groupId: string) {
  return modelConfig.value.models.filter(m => m.groupId === groupId)
}