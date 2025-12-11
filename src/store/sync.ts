import { exportConfig, replaceConfig } from './modelConfig'
import { exportHistories, replaceHistories, mergeHistories } from './chat'
import { supabase } from '../api/supabase'
import { ref } from 'vue'
import { authState } from './auth'

export interface GlobalBackup {
  version: number
  exportedAt: number
  modelConfig?: any
  chatHistories?: any
  lastSynced?: number
}

// 同步状态常量
export const SyncStatus = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  SUCCESS: 'success',
  FAILED: 'failed'
} as const

export type SyncStatus = typeof SyncStatus[keyof typeof SyncStatus]

// 同步状态管理
export const syncState = ref<{
  status: SyncStatus
  lastSynced: number | null
  progress: number
  error: string | null
}>({
  status: SyncStatus.IDLE,
  lastSynced: null,
  progress: 0,
  error: null
})

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
      t = t.replace(/,\s*([\}\]])/g, '$1')
      const data = JSON.parse(t)
      return { ok: true, data }
    } catch (e) {
      return { ok: false, error: 'JSON 解析失败，请检查格式或去除注释' }
    }
  }
}

export function exportGlobal() {
  const config = exportConfig()
  return {
    version: 1,
    exportedAt: Date.now(),
    conversations: exportHistories(),
    modelGroups: config.modelGroups,
    models: config.models,
    selectedModelId: '', // 不再同步选中的模型ID
    apiKeys: [], // 目前没有实现API密钥管理，暂时返回空数组
    lastSynced: syncState.value.lastSynced || undefined
  }
}

export function importGlobal(obj: any): { ok: boolean; error?: string; applied: string[] } {
  try {
    const applied: string[] = []
    
    if (!obj || typeof obj !== 'object') {
      return { ok: false, error: '无效的同步数据格式', applied }
    }

    // 1. 识别并导入模型配置
    if (obj.modelGroups && obj.models) {
      const mcSource = {
        modelGroups: obj.modelGroups,
        models: obj.models,
        selectedModelId: '', // 忽略云端同步的 selectedModelId
        exportedAt: Date.now(),
        version: 1
      }
      const res = replaceConfig(mcSource)
      if (!res.ok) return { ok: false, error: res.error || '模型配置导入失败', applied }
      applied.push('modelConfig')
    }

    // 2. 识别并合并聊天历史，而不是完全替换
    if (Array.isArray(obj.conversations)) {
      // 只在没有本地历史记录时才完全替换
      const localHistories = exportHistories()
      if (localHistories.length === 0) {
        // 本地没有历史记录，直接导入云端数据
        const res = replaceHistories(obj.conversations)
        if (!res.ok) return { ok: false, error: res.error || '聊天历史导入失败', applied }
      } else {
        // 本地有历史记录，进行合并
        const res = mergeHistories(obj.conversations)
        if (!res.ok) return { ok: false, error: res.error || '聊天历史合并失败', applied }
      }
      applied.push('chatHistories')
    }

    // 3. 更新最后同步时间
    if (obj.lastSynced) {
      syncState.value.lastSynced = obj.lastSynced
    }

    // 4. 更新同步状态
    syncState.value.status = SyncStatus.SUCCESS
    syncState.value.progress = 100
    
    return { ok: true, applied }
  } catch (e) {
    return { ok: false, error: (e as Error).message, applied: [] }
  }
}

// 上传数据到云端
export async function uploadToCloud(): Promise<{ ok: boolean; error?: string }> {
  if (!authState.value.isAuthenticated) {
    return { ok: false, error: '用户未登录' }
  }

  try {
    syncState.value.status = SyncStatus.SYNCING
    syncState.value.progress = 30

    const backupData = exportGlobal()
    const sessionToken = authState.value.sessionToken

    if (!sessionToken) {
      throw new Error('会话令牌不存在')
    }

    syncState.value.progress = 60

    // 使用Supabase RPC函数上传数据，严格适配schema中的函数名
    const { data, error } = await supabase.rpc('sync_upload_backup_v1', {
      p_token: sessionToken,
      p_data: backupData,
      p_sync_history: true,
      p_sync_model_config: true,
      p_sync_selected_model: false, // 不再同步选中的模型
      p_sync_api_key: true
    })

    if (error) {
      throw error
    }

    if (data && data.ok) {
      // 导入返回的数据，确保本地数据与云端一致
      const importResult = importGlobal(data)
      if (!importResult.ok) {
        throw new Error(importResult.error)
      }
    }

    syncState.value.status = SyncStatus.SUCCESS
    syncState.value.progress = 100
    syncState.value.lastSynced = Date.now()
    syncState.value.error = null

    return { ok: true }
  } catch (error) {
    syncState.value.status = SyncStatus.FAILED
    syncState.value.error = (error as Error).message
    syncState.value.progress = 0
    return { ok: false, error: (error as Error).message }
  }
}

// 从云端下载数据
export async function downloadFromCloud(): Promise<{ ok: boolean; error?: string; hasData: boolean }> {
  if (!authState.value.isAuthenticated) {
    return { ok: false, error: '用户未登录', hasData: false }
  }

  try {
    syncState.value.status = SyncStatus.SYNCING
    syncState.value.progress = 30

    const sessionToken = authState.value.sessionToken

    if (!sessionToken) {
      throw new Error('会话令牌不存在')
    }

    syncState.value.progress = 60

    // 新数据库不再使用sync_download_backup_v1，直接使用sync_upload_backup_v1实现下载
    // 传递空数据对象，只执行读取操作
    const { data, error } = await supabase.rpc('sync_upload_backup_v1', {
      p_token: sessionToken,
      p_data: {},
      p_sync_history: false,
      p_sync_model_config: false,
      p_sync_selected_model: false,
      p_sync_api_key: false
    })

    if (error) {
      throw error
    }

    if (data && data.ok) {
      // 导入数据
      const importResult = importGlobal(data)
      if (!importResult.ok) {
        throw new Error(importResult.error)
      }

      syncState.value.progress = 80
      syncState.value.error = null

      return { ok: true, hasData: true }
    } else {
      throw new Error('下载数据失败：' + (data?.message || '未知错误'))
    }
  } catch (error) {
    syncState.value.status = SyncStatus.FAILED
    syncState.value.error = (error as Error).message
    syncState.value.progress = 0
    return { ok: false, error: (error as Error).message, hasData: false }
  }
}

// 执行同步（上传和下载）
export async function syncWithCloud(): Promise<{ ok: boolean; error?: string }> {
  // 先下载最新数据
  const downloadResult = await downloadFromCloud()
  if (!downloadResult.ok) {
    return downloadResult
  }

  // 再上传本地数据
  const uploadResult = await uploadToCloud()
  if (!uploadResult.ok) {
    return uploadResult
  }

  // 只有上传成功后，才更新同步状态为成功
  syncState.value.status = SyncStatus.SUCCESS
  syncState.value.progress = 100
  syncState.value.lastSynced = Date.now()
  
  return { ok: true }
}


