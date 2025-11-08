import OSS from 'ali-oss'
import { ref } from 'vue'
import { chatStore, exportHistories, replaceHistories } from './chat'
import type { ChatRecord } from './chat'
import { modelConfig, exportConfig, replaceConfig } from './modelConfig'
import { exportGlobal, importGlobal, parseWithCompatibility } from './sync'
import { userProfile, exportProfile, replaceProfile } from './userProfile'

// 进度上报类型（供页面展示）
export interface SyncProgress {
  current: number
  total: number
  percent: number
  label: string
}

export interface OssConfig {
  region: string
  endpoint: string
  bucket: string
  accessKeyId: string
  accessKeySecret: string
}

const LS_KEY = 'aime.oss.config'

export const REGIONS: { id: string; name: string }[] = [
  { id: 'oss-cn-hangzhou', name: '华东1（杭州）' },
  { id: 'oss-cn-shanghai', name: '华东2（上海）' },
  { id: 'oss-cn-qingdao', name: '华北1（青岛）' },
  { id: 'oss-cn-beijing', name: '华北2（北京）' },
  { id: 'oss-cn-zhangjiakou', name: '华北5（张家口）' },
  { id: 'oss-cn-huhehaote', name: '华北3（呼和浩特）' },
  { id: 'oss-cn-wulanchabu', name: '华北6（乌兰察布）' },
  { id: 'oss-cn-shenzhen', name: '华南1（深圳）' },
  { id: 'oss-cn-chengdu', name: '西南1（成都）' },
  { id: 'oss-cn-hongkong', name: '中国香港' },
  { id: 'oss-ap-southeast-1', name: '新加坡' },
  { id: 'oss-ap-northeast-1', name: '日本（东京）' },
  { id: 'oss-us-east-1', name: '美国东部（弗吉尼亚）' },
  { id: 'oss-us-west-1', name: '美国西部（硅谷）' },
  { id: 'oss-eu-central-1', name: '德国（法兰克福）' },
]

export function endpointForRegion(regionId: string): string {
  if (!regionId) return ''
  return `https://${regionId}.aliyuncs.com`
}

function loadConfig(): OssConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const region = typeof parsed.region === 'string' ? parsed.region : 'oss-cn-hangzhou'
        const bucket = typeof parsed.bucket === 'string' ? parsed.bucket : ''
        const accessKeyId = typeof parsed.accessKeyId === 'string' ? parsed.accessKeyId : ''
        const accessKeySecret = typeof parsed.accessKeySecret === 'string' ? parsed.accessKeySecret : ''
        const endpoint = typeof parsed.endpoint === 'string' && parsed.endpoint.length
          ? parsed.endpoint
          : endpointForRegion(region)
        return { region, endpoint, bucket, accessKeyId, accessKeySecret }
      }
    }
  } catch {}
  const region = 'oss-cn-hangzhou'
  return {
    region,
    endpoint: endpointForRegion(region),
    bucket: '',
    accessKeyId: '',
    accessKeySecret: '',
  }
}

export const ossConfig = ref<OssConfig>(loadConfig())

// 自动同步开关
const AUTO_SYNC_LS_KEY = 'aime.oss.autoSync'
function loadAutoSync(): boolean {
  try { return localStorage.getItem(AUTO_SYNC_LS_KEY) === '1' } catch { return false }
}
export const autoSyncEnabled = ref<boolean>(loadAutoSync())
export function saveAutoSyncEnabled(v: boolean) {
  autoSyncEnabled.value = !!v
  try { localStorage.setItem(AUTO_SYNC_LS_KEY, autoSyncEnabled.value ? '1' : '0') } catch {}
}

// 全局同步成功信号（主页右上角短暂显示）
export const lastSyncSuccessAt = ref<number>(0)
export function markSyncSuccess() { lastSyncSuccessAt.value = Date.now() }

export function saveOssConfig() {
  localStorage.setItem(LS_KEY, JSON.stringify(ossConfig.value))
}

function createClient() {
  const cfg = ossConfig.value
  if (!cfg.bucket || !cfg.accessKeyId || !cfg.accessKeySecret) {
    throw new Error('OSS 配置不完整：请填写 Bucket、AccessKeyId、AccessKeySecret')
  }
  const client = new OSS({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
    endpoint: cfg.endpoint || undefined,
    secure: true,
  })
  return client
}

async function getText(key: string): Promise<string> {
  const client = createClient()
  const res: any = await client.get(key)
  // Browser returns ArrayBuffer
  const content = res && (res.content || res.data)
  if (!content) throw new Error('下载失败或无内容')
  const text = typeof content === 'string' ? content : new TextDecoder().decode(content as ArrayBuffer)
  return text
}

async function getJson<T = any>(key: string): Promise<T> {
  const text = await getText(key)
  const parsed = parseWithCompatibility(text)
  if (!parsed.ok) throw new Error(parsed.error || 'JSON 解析失败')
  return parsed.data as T
}

async function putJson(key: string, obj: any): Promise<void> {
  const client = createClient()
  const body = JSON.stringify(obj, null, 2)
  const blob = new Blob([body], { type: 'application/json; charset=utf-8' })
  await client.put(key, blob)
}

async function deleteObject(key: string): Promise<void> {
  const client = createClient()
  try {
    await client.delete(key)
  } catch (e: any) {
    // ignore 404
    if (e && (e.status === 404 || e.name === 'NoSuchKeyError')) return
    throw e
  }
}

// ===== 按规范构建索引与记录 =====
export interface HistoryIndexItem {
  id: number
  title: string
  updatedAt: number
  messageCount: number
  lastMessage: string
}

export interface HistoryIndex {
  version: number
  generatedAt: number
  items: HistoryIndexItem[]
}

function buildHistoryIndex(): HistoryIndex {
  const histories = chatStore.getHistories()
  const items: HistoryIndexItem[] = histories.map((h: ChatRecord) => ({
    id: h.id,
    title: h.title,
    updatedAt: h.updatedAt,
    messageCount: h.messages.length,
    lastMessage: h.messages.length ? h.messages[h.messages.length - 1].content : '',
  }))
  return {
    version: 1,
    generatedAt: Date.now(),
    items,
  }
}

function findRemoteItem(remote: HistoryIndex | null, id: number): HistoryIndexItem | null {
  if (!remote) return null
  const it = remote.items.find(x => x.id === id)
  return it || null
}

function diffIndex(local: HistoryIndex, remote: HistoryIndex | null): { toUpload: number[]; toDeleteRemote: number[] } {
  const toUpload: number[] = []
  const toDeleteRemote: number[] = []
  const localIds = new Set(local.items.map(i => i.id))
  const remoteIds = new Set((remote?.items || []).map(i => i.id))
  for (const li of local.items) {
    const ri = findRemoteItem(remote, li.id)
    if (!ri) {
      toUpload.push(li.id)
      continue
    }
    const changed = (
      li.updatedAt !== ri.updatedAt ||
      li.messageCount !== ri.messageCount ||
      li.lastMessage !== ri.lastMessage ||
      li.title !== ri.title
    )
    if (changed) toUpload.push(li.id)
  }
  if (remote) {
    for (const ri of remote.items) {
      if (!localIds.has(ri.id)) toDeleteRemote.push(ri.id)
    }
  }
  return { toUpload, toDeleteRemote }
}

// ===== 上传与下载（增量 → 回退）
export async function uploadIncremental(progress?: (p: SyncProgress) => void): Promise<{ ok: boolean; message: string }> {
  try {
    const localIndex = buildHistoryIndex()
    let remoteIndex: HistoryIndex | null = null
    try {
      remoteIndex = await getJson<HistoryIndex>('AIme/history/index.json')
    } catch (e: any) {
      // 视为首次迁移（索引不存在）
      remoteIndex = null
    }

    const { toUpload, toDeleteRemote } = diffIndex(localIndex, remoteIndex)

    // 计算总步数：模型配置 + 用户资料 + 删除远端 + 上传记录 + 上传索引
    const total = 1 + 1 + toDeleteRemote.length + toUpload.length + 1
    let done = 0
    const emit = (label: string) => {
      const percent = total > 0 ? Math.round((done / total) * 100) : 0
      progress?.({ current: done, total, percent, label })
    }
    emit('准备增量上传…')

    // 4) 上传模型配置（始终覆盖）
    const mc = exportConfig()
    mc.exportedAt = Date.now()
    await putJson('AIme/model_config.json', mc)
    done += 1; emit('上传模型配置')

    // 4.1) 用户资料（轻量单文件覆盖上传，不参与索引）
    try {
      const up = exportProfile()
      await putJson('AIme/user_profile.json', up)
    } catch (_) { /* 忽略用户资料上传失败 */ }
    done += 1; emit('上传用户资料（可选）')

    // 5) 删除远端多余记录
    for (const id of toDeleteRemote) {
      await deleteObject(`AIme/history/${id}.json`)
      done += 1; emit(`删除远端记录 #${id}`)
    }

    // 6) 上传变更记录
    const localHistories = exportHistories()
    const mapById = new Map<number, ChatRecord>(localHistories.map(h => [h.id, h]))
    for (const id of toUpload) {
      const rec = mapById.get(id)
      if (!rec) continue
      await putJson(`AIme/history/${id}.json`, rec)
      done += 1; emit(`上传历史记录 #${id}`)
    }

    // 7) 最后上传最新索引
    await putJson('AIme/history/index.json', localIndex)
    done += 1; emit('上传索引')

    // 完成：保证进度到 100%
    progress?.({ current: total, total, percent: 100, label: '上传完成' })

    return { ok: true, message: '增量上传成功' }
  } catch (e: any) {
    // 回退到单文件备份
    try {
      const backup = exportGlobal()
      await putJson('AImeBackup.json', backup)
      progress?.({ current: 1, total: 1, percent: 100, label: '回退为单文件备份并上传完成' })
      return { ok: true, message: '增量上传异常，已回退为单文件备份上传' }
    } catch (e2: any) {
      progress?.({ current: 1, total: 1, percent: 100, label: '上传失败' })
      return { ok: false, message: '上传失败：' + (e2?.message || e?.message || '未知错误') }
    }
  }
}

export async function downloadAndImport(progress?: (p: SyncProgress) => void): Promise<{ ok: boolean; message: string }> {
  // 优先增量
  try {
    let done = 0
    let total = 0
    const emit = (label: string) => {
      const percent = total > 0 ? Math.round((done / total) * 100) : 0
      progress?.({ current: done, total, percent, label })
    }
    emit('准备增量下载…')

    // 1) 用户资料（可选，若存在则优先导入；失败忽略）
    try {
      const up = await getJson<any>('AIme/user_profile.json')
      replaceProfile(up)
    } catch (_) { /* ignore */ }
    done += 1

    const index = await getJson<HistoryIndex>('AIme/history/index.json')
    done += 1
    // 预估总步数：用户资料 + 下载索引 + 模型配置 + 逐条记录 + 应用历史
    // 模型配置尝试算作一步
    total = 1 /* user */ + 1 /* index */ + 1 /* model */ + index.items.length /* records */ + 1 /* apply */
    emit('索引已下载，开始导入…')
    // 2) 模型配置
    try {
      const mc = await getJson<any>('AIme/model_config.json')
      const res = replaceConfig(mc)
      if (!res.ok) throw new Error(res.error || '模型配置导入失败')
    } catch (e) {
      // 忽略模型配置失败继续
    }
    done += 1; emit('导入模型配置（可选）')
    // 3) 用户资料（可选）——当前端未集成，忽略读取失败
    // 4) 遍历索引条目下载记录并覆盖导入
    const list: ChatRecord[] = []
    for (const it of index.items) {
      try {
        const rec = await getJson<ChatRecord>(`AIme/history/${it.id}.json`)
        list.push(rec)
      } catch (e) {
        // 单条失败：跳过该条
      }
      done += 1; emit(`下载历史记录 #${it.id}`)
    }
    const histRes = replaceHistories(list)
    if (!histRes.ok) throw new Error(histRes.error || '历史记录导入失败')
    done += 1; emit('应用历史记录')

    progress?.({ current: total, total, percent: 100, label: '下载并导入完成' })

    return { ok: true, message: '增量下载并导入成功' }
  } catch (e: any) {
    // 回退到单文件备份
    try {
      const data = await getJson<any>('AImeBackup.json')
      const res = importGlobal(data)
      if (!res.ok) throw new Error(res.error || '单文件备份导入失败')
      progress?.({ current: 1, total: 1, percent: 100, label: '索引缺失，已回退为单文件备份导入' })
      return { ok: true, message: '索引缺失或异常，已回退为单文件备份导入' }
    } catch (e2: any) {
      progress?.({ current: 1, total: 1, percent: 100, label: '下载/导入失败' })
      return { ok: false, message: '下载/导入失败：' + (e2?.message || e?.message || '未知错误') }
    }
  }
}

// ===== 辅助：仅上传单条历史记录 + 更新索引 =====
export async function uploadHistoryRecordAndIndex(id: number): Promise<{ ok: boolean; message: string }> {
  try {
    const histories = exportHistories()
    const rec = histories.find(h => h.id === id)
    if (!rec) return { ok: false, message: '未找到本地记录：' + id }
    await putJson(`AIme/history/${id}.json`, rec)
    const index = buildHistoryIndex()
    await putJson('AIme/history/index.json', index)
    return { ok: true, message: `已上传记录 #${id} 并更新索引` }
  } catch (e: any) {
    return { ok: false, message: '上传失败：' + (e?.message || '未知错误') }
  }
}

// ===== 辅助：仅上传模型配置 =====
export async function uploadModelConfigOnly(): Promise<{ ok: boolean; message: string }> {
  try {
    const mc = exportConfig()
    mc.exportedAt = Date.now()
    await putJson('AIme/model_config.json', mc)
    return { ok: true, message: '模型配置已上传' }
  } catch (e: any) {
    return { ok: false, message: '上传失败：' + (e?.message || '未知错误') }
  }
}

// ===== 自动镜像：以云端索引为准对齐本地 =====
export async function mirrorLocalWithCloud(): Promise<{ ok: boolean; message: string; added: number; removed: number }> {
  try {
    const remote = await getJson<HistoryIndex>('AIme/history/index.json')
    const localList = exportHistories()
    const localIds = new Set(localList.map(h => h.id))
    const remoteIds = new Set(remote.items.map(i => i.id))

    const toAdd = remote.items.filter(i => !localIds.has(i.id)).map(i => i.id)
    const toRemove = localList.filter(h => !remoteIds.has(h.id)).map(h => h.id)

    const addedRecords: ChatRecord[] = []
    for (const id of toAdd) {
      try {
        const rec = await getJson<ChatRecord>(`AIme/history/${id}.json`)
        addedRecords.push(rec)
      } catch (_) { /* 单条失败忽略 */ }
    }
    const finalList = localList.filter(h => remoteIds.has(h.id)).concat(addedRecords)
    const res = replaceHistories(finalList)
    if (!res.ok) return { ok: false, message: res.error || '本地替换失败', added: addedRecords.length, removed: toRemove.length }
    return { ok: true, message: `自动同步完成：下载 ${addedRecords.length} 条，删除 ${toRemove.length} 条`, added: addedRecords.length, removed: toRemove.length }
  } catch (e: any) {
    return { ok: false, message: '自动同步失败：' + (e?.message || '未知错误'), added: 0, removed: 0 }
  }
}

// 仅比较ID表差异，用于决定是否需要触发下载，避免不必要流量
export async function checkIndexDiff(): Promise<{ ok: boolean; added: number; removed: number }> {
  try {
    const remote = await getJson<HistoryIndex>('AIme/history/index.json')
    const localList = exportHistories()
    const localIds = new Set(localList.map(h => h.id))
    const remoteIds = new Set(remote.items.map(i => i.id))
    const added = remote.items.filter(i => !localIds.has(i.id)).length
    const removed = localList.filter(h => !remoteIds.has(h.id)).length
    return { ok: true, added, removed }
  } catch (e: any) {
    return { ok: false, added: 0, removed: 0 }
  }
}

// 仅上传用户资料（轻量覆盖）
export async function uploadUserProfileOnly(): Promise<{ ok: boolean; message: string }> {
  try {
    const up = exportProfile()
    await putJson('AIme/user_profile.json', up)
    return { ok: true, message: '用户资料已上传（轻量覆盖）' }
  } catch (e: any) {
    return { ok: false, message: '上传失败：' + (e?.message || '未知错误') }
  }
}