import { reactive } from 'vue'

// 历史记录中消息的结构，严格遵守用户提供的格式
export interface ChatMessage {
  content: string
  isError: boolean
  isFromUser: boolean
  timestamp: number
  modelDisplayName?: string
}

// 历史记录结构，严格遵守用户提供的格式
export interface ChatRecord {
  createdAt: number
  id: number
  messages: ChatMessage[]
  title: string
  updatedAt: number
  isDeleted?: boolean
  deletedAt?: number | null
}

const STORAGE_KEY = 'aime.chat.history'

const state = reactive<{ histories: ChatRecord[]; activeId: number | null; draft: ChatRecord | null }>({
  histories: [],
  activeId: null,
  draft: null,
})

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const list = JSON.parse(raw) as ChatRecord[]
      if (Array.isArray(list)) {
        state.histories = list
        const first = state.histories[0]
        if (first) state.activeId = first.id
        return
      }
    }
  } catch (_) {
    // ignore
  }
  // 初始化为空历史，不再注入预设示例
  state.histories = []
  state.activeId = null
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.histories))
}

// 移除示例预设：保留空加载逻辑即可

export function startDraft() {
  const now = Date.now()
  state.activeId = null
  state.draft = {
    createdAt: now,
    id: 0, // 0 仅用作占位，真正入库时会生成唯一 id
    messages: [],
    title: '新对话',
    updatedAt: now,
  }
}

function generateId(): number {
  // 简单的四位/五位随机ID，避免与现有重复
  let id = Math.floor(Math.random() * 90000) + 10000
  while (state.histories.some(h => h.id === id)) {
    id = Math.floor(Math.random() * 90000) + 10000
  }
  return id
}

export function getHistories() {
  return state.histories.filter(h => !h.isDeleted)
}

export function getActiveId() {
  return state.activeId
}

export function getActiveChat(): ChatRecord | undefined {
  return state.histories.find(h => h.id === state.activeId)
}

export function setActiveChat(id: number) {
  state.activeId = id
  persist()
}

export function createNewChat() {
  const now = Date.now()
  const record: ChatRecord = {
    createdAt: now,
    id: generateId(),
    messages: [],
    title: '新对话',
    updatedAt: now,
  }
  state.histories.unshift(record)
  state.activeId = record.id
  persist()
  return record
}

function deriveTitle(text: string) {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 20 ? t.slice(0, 20) + '…' : t
}

export function appendMessage(msg: ChatMessage) {
  const active = getActiveChat()
  if (!active) {
    // 没有选中历史会话：在草稿中累积，首条消息后再入库
    if (!state.draft) {
      startDraft()
    }
    state.draft!.messages.push(msg)
    state.draft!.updatedAt = msg.timestamp
    if (msg.isFromUser && state.draft!.messages.length === 1) {
      state.draft!.title = deriveTitle(msg.content)
    }
    // 首条消息后将草稿入库并设为当前会话
    if (state.draft!.messages.length === 1) {
      const record: ChatRecord = { ...state.draft!, id: generateId() }
      state.histories.unshift(record)
      state.activeId = record.id
      state.draft = null
    }
    persist()
    return
  }
  // 已在历史会话中：直接追加
  active.messages.push(msg)
  active.updatedAt = msg.timestamp
  if (msg.isFromUser && active.messages.length === 1) {
    active.title = deriveTitle(msg.content)
  }
  persist()
}

export function renameChat(id: number, title: string) {
  const r = state.histories.find(h => h.id === id)
  if (!r) return
  const t = title.trim()
  if (t.length === 0) return
  r.title = t
  persist()
}

export function deleteChat(id: number) {
  const idx = state.histories.findIndex(h => h.id === id)
  if (idx === -1) return
  const removedActive = state.activeId === id
  
  // 软删除
  const record = state.histories[idx]
  if (!record) return
  record.isDeleted = true
  record.deletedAt = Date.now()
  record.updatedAt = Date.now() // 更新时间戳以便同步

  if (removedActive) {
    // 查找第一个未删除的记录
    const first = state.histories.find(h => !h.isDeleted)
    state.activeId = first ? first.id : null
  }
  persist()
}

// ===== 扩展：按索引删除消息并持久化（用于“重新发送”后移除旧回复） =====
export function removeMessageAt(chatId: number, index: number) {
  const r = state.histories.find(h => h.id === chatId)
  if (!r) return
  if (index < 0 || index >= r.messages.length) return
  r.messages.splice(index, 1)
  {
    const last = r.messages[r.messages.length - 1]
    r.updatedAt = last ? last.timestamp : Date.now()
  }
  persist()
}

// 暴露一次显式持久化（用于批量更新或流式写入结束时保存）
export function persistNow() { persist() }

// 在指定索引插入消息（用于“重新发送”占位）
export function insertMessageAt(chatId: number, index: number, msg: ChatMessage) {
  const r = state.histories.find(h => h.id === chatId)
  if (!r) return
  const i = Math.max(0, Math.min(index, r.messages.length))
  r.messages.splice(i, 0, msg)
  r.updatedAt = msg.timestamp
  persist()
}

// 初始化：加载或创建示例记录
loadFromLocalStorage()

export const chatStore = {
  getHistories,
  getActiveId,
  getActiveChat,
  setActiveChat,
  startDraft,
  createNewChat,
  appendMessage,
  renameChat,
  deleteChat,
  removeMessageAt,
  insertMessageAt,
  persistNow,
}

// ===== 新增：导入/导出历史记录（用于全局同步） =====

function normalizeMessage(m: any): ChatMessage {
  return {
    content: typeof m?.content === 'string' ? m.content : '',
    isError: Boolean(m?.isError),
    isFromUser: Boolean(m?.isFromUser),
    timestamp: typeof m?.timestamp === 'number' && Number.isFinite(m.timestamp) ? m.timestamp : Date.now(),
    modelDisplayName: typeof m?.modelDisplayName === 'string' ? m.modelDisplayName : undefined,
  }
}

function normalizeRecord(r: any): ChatRecord {
  const now = Date.now()
  const msgs: ChatMessage[] = Array.isArray(r?.messages) ? r.messages.map(normalizeMessage) : []
  let id: number = typeof r?.id === 'number' && Number.isFinite(r.id) ? r.id : generateId()
  // 避免重复 id
  while (state.histories.some(h => h.id === id)) id = generateId()
  
  // 兼容 camelCase 和 snake_case
  const createdAt = typeof r?.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : 
                   (typeof r?.created_at === 'number' && Number.isFinite(r.created_at) ? r.created_at : now)
  const updatedAt = typeof r?.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 
                   (typeof r?.updated_at === 'number' && Number.isFinite(r.updated_at) ? r.updated_at : ((msgs[msgs.length - 1]?.timestamp) ?? now))
  const isDeleted = Boolean(r?.isDeleted ?? r?.is_deleted ?? false)
  const deletedAt = typeof r?.deletedAt === 'number' && Number.isFinite(r.deletedAt) ? r.deletedAt : 
                   (typeof r?.deleted_at === 'number' && Number.isFinite(r.deleted_at) ? r.deleted_at : null)

  return {
    createdAt,
    id,
    messages: msgs,
    title: typeof r?.title === 'string' && r.title.trim().length ? r.title.trim() : (msgs[0]?.content ? msgs[0].content.slice(0, 20) : '新对话'),
    updatedAt,
    isDeleted,
    deletedAt
  }
}

export function exportHistories(): any[] {
  return state.histories.map(h => ({
    ...h,
    is_deleted: h.isDeleted,
    deleted_at: h.deletedAt,
    created_at: h.createdAt,
    updated_at: h.updatedAt
  }))
}

export function replaceHistories(input: any): { ok: boolean; error?: string } {
  try {
    if (!Array.isArray(input)) return { ok: false, error: '历史记录格式错误：期望为数组' }
    const prevActive = state.activeId
    const hadDraft = state.draft != null
    const list: ChatRecord[] = input.map(normalizeRecord)
    state.histories = list
    // 保留当前激活会话：
    // - 若此前在某个历史会话中（prevActive!=null），且仍存在则保持；不存在则回退为第一条或空
    // - 若此前处于“新对话”（prevActive==null）且存在草稿，则保持为 null（不跳转到历史会话）
    if (prevActive != null) {
      const stillExists = state.histories.some(h => h.id === prevActive)
      const first = state.histories[0]
      state.activeId = stillExists ? prevActive : (first ? first.id : null)
    } else {
      const first = state.histories[0]
      state.activeId = hadDraft ? null : (first ? first.id : null)
    }
    persist()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function mergeHistories(input: any): { ok: boolean; error?: string } {
  try {
    if (!Array.isArray(input)) return { ok: false, error: '历史记录格式错误：期望为数组' }
    
    const inputList: ChatRecord[] = []
    // 预处理并校验输入，尽量保留原有 ID
    for (const item of input) {
       const msgs: ChatMessage[] = Array.isArray(item?.messages) ? item.messages.map(normalizeMessage) : []
       // 信任云端的 ID，只要是数字即可，不强制 regenerate
       const id = typeof item?.id === 'number' && Number.isFinite(item.id) ? item.id : generateId()
       const now = Date.now()
       
       // 兼容 camelCase 和 snake_case
       const createdAt = typeof item?.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : 
                        (typeof item?.created_at === 'number' && Number.isFinite(item.created_at) ? item.created_at : now)
       const updatedAt = typeof item?.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : 
                        (typeof item?.updated_at === 'number' && Number.isFinite(item.updated_at) ? item.updated_at : ((msgs[msgs.length - 1]?.timestamp) ?? now))
       const isDeleted = Boolean(item?.isDeleted ?? item?.is_deleted ?? false)
       const deletedAt = typeof item?.deletedAt === 'number' && Number.isFinite(item.deletedAt) ? item.deletedAt : 
                        (typeof item?.deleted_at === 'number' && Number.isFinite(item.deleted_at) ? item.deleted_at : null)

       inputList.push({
         createdAt,
         id,
         messages: msgs,
         title: typeof item?.title === 'string' && item.title.trim().length ? item.title.trim() : (msgs[0]?.content ? msgs[0].content.slice(0, 20) : '新对话'),
         updatedAt,
         isDeleted,
         deletedAt
       })
    }

    let updatedCount = 0
    let addedCount = 0

    for (const record of inputList) {
      // Cloud uses Title as unique key (implied by SQL logic), so we must follow suit
      // to avoid duplicates, since we don't store Cloud UUIDs locally.
      const idx = state.histories.findIndex(h => h.title === record.title)
      if (idx !== -1) {
        // 已存在
        const local = state.histories[idx]
        if (local) {
            // Case 1: 云端标记为删除
            if (record.isDeleted) {
                if (!local.isDeleted) {
                    // 本地未删除，则同步删除
                    local.isDeleted = true
                    local.deletedAt = record.deletedAt || Date.now()
                    local.updatedAt = record.updatedAt
                    updatedCount++
                }
                // 如果本地已删除，无需操作
            } 
            // Case 2: 云端未删除
            else {
                if (local.isDeleted) {
                    // 本地已删除：检查云端是否更新（可能是在其他设备恢复）
                    // 只有当云端更新时间明显晚于本地删除时间时才恢复
                    // 假设 record.updatedAt > local.deletedAt
                    if (record.updatedAt > (local.deletedAt || 0)) {
                         // 恢复并更新
                         record.id = local.id
                         state.histories[idx] = record
                         updatedCount++
                    }
                    // 否则，忽略云端的旧数据，保持本地删除状态（避免重新下载）
                } else {
                    // 本地未删除：正常合并，取较新者
                    if (record.updatedAt > local.updatedAt || record.messages.length > local.messages.length) {
                        // Keep local ID, update content
                        record.id = local.id
                        state.histories[idx] = record
                        updatedCount++
                    }
                }
            }
        }
      } else {
        // 不存在：只有当云端数据未删除时才添加
        if (!record.isDeleted) {
            state.histories.push(record)
            addedCount++
        }
      }
    }

    if (addedCount > 0 || updatedCount > 0) {
        // 按更新时间倒序排列
        state.histories.sort((a, b) => b.updatedAt - a.updatedAt)
        persist()
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
