import { exportConfig, replaceConfig } from './modelConfig'
import { exportHistories, replaceHistories } from './chat'

export interface GlobalBackup {
  version: number
  exportedAt: number
  modelConfig?: any
  chatHistories?: any
}

// 兼容性解析：支持注释、单引号、未加引号字段名、尾逗号
export function parseWithCompatibility(text: string): { ok: boolean; data?: any; error?: string } {
  try {
    const data = JSON.parse(text)
    return { ok: true, data }
  } catch (_) {
    // sanitize
    try {
      let t = text.replace(/^\uFEFF/, '')
      t = t.replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      t = t.replace(/\/\/[^\n\r]*/g, '') // line comments
      // quote unquoted keys
      t = t.replace(/([\{\s,])([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      // single to double quotes for strings
      t = t.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
      // remove trailing commas
      t = t.replace(/,\s*([}\]])/g, '$1')
      const data = JSON.parse(t)
      return { ok: true, data }
    } catch (e) {
      return { ok: false, error: 'JSON 解析失败，请检查格式或去除注释' }
    }
  }
}

export function exportGlobal(): GlobalBackup {
  return {
    version: 1,
    exportedAt: Date.now(),
    modelConfig: exportConfig(),
    chatHistories: exportHistories(),
  }
}

export function importGlobal(obj: any): { ok: boolean; error?: string; applied: string[] } {
  try {
    const applied: string[] = []
    // 识别模型配置
    let mcSource: any = undefined
    if (obj && typeof obj === 'object') {
      if (obj.modelConfig) mcSource = obj.modelConfig
      else if (obj.modelGroups || obj.models) mcSource = obj
    }
    if (mcSource) {
      const res = replaceConfig(mcSource)
      if (!res.ok) return { ok: false, error: res.error || '模型配置导入失败', applied }
      applied.push('modelConfig')
    }

    // 识别聊天历史
    let chSource: any = undefined
    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) chSource = obj
      else if (Array.isArray(obj.chatHistories)) chSource = obj.chatHistories
      else if (Array.isArray(obj.histories)) chSource = obj.histories
      else if (Array.isArray(obj.conversations)) chSource = obj.conversations
      else if (Array.isArray(obj.chats)) chSource = obj.chats
      else if (Array.isArray(obj.records)) chSource = obj.records
    }
    if (chSource) {
      const res = replaceHistories(chSource)
      if (!res.ok) return { ok: false, error: res.error || '聊天历史导入失败', applied }
      applied.push('chatHistories')
    }

    if (applied.length === 0) {
      return { ok: false, error: '未检测到可识别的字段（模型配置或历史记录）', applied }
    }
    return { ok: true, applied }
  } catch (e) {
    return { ok: false, error: (e as Error).message, applied: [] }
  }
}