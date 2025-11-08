import { reactive } from 'vue'

// 历史记录中消息的结构，严格遵守用户提供的格式
export interface ChatMessage {
  content: string
  isError: boolean
  isFromUser: boolean
  timestamp: number
}

// 历史记录结构，严格遵守用户提供的格式
export interface ChatRecord {
  createdAt: number
  id: number
  messages: ChatMessage[]
  title: string
  updatedAt: number
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
        if (state.histories.length > 0) state.activeId = state.histories[0].id
        return
      }
    }
  } catch (_) {
    // ignore
  }
  seedSample()
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.histories))
}

function seedSample() {
  const sample: ChatRecord = {
    createdAt: 1761718724409,
    id: 3494,
    messages: [
      {
        content: '美元，美分，那毛呢，美毛？',
        isError: false,
        isFromUser: true,
        timestamp: 1761718724409,
      },
      {
        content:
          '“毛”是中文里对“角”的口语说法，等于0.1元（1元 = 10角/毛 = 100分）。美元体系里没有叫“毛”的单位——1美元 = 100美分（cent）。  \n所以没有标准的“美毛”。与“1毛人民币（0.1元）”最接近的美式等价是“10美分”（0.1美元），英文币名为dime（美洲十美分币）。  \n\n常用说法建议：\n- 0.1美元 = 10美分 = a dime（可以说“十美分”或“0.1美元”）  \n- 1美分 = penny（便称“美分”或“分”）  \n- 5美分 = nickel，25美分 = quarter，50美分 = half dollar。  \n\n口语上有人玩笑说“美毛”，但不是正式用法。',
        isError: false,
        isFromUser: false,
        timestamp: 1761718724709,
      },
    ],
    title: '美元，美分，那毛呢，美毛？',
    updatedAt: 1761718741480,
  }
  state.histories = [sample]
  state.activeId = sample.id
  persist()
}

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
  return state.histories
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
  state.histories.splice(idx, 1)
  if (removedActive) {
    state.activeId = state.histories.length ? state.histories[0].id : null
  }
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
}

// ===== 新增：导入/导出历史记录（用于全局同步） =====
function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)) as T }

function normalizeMessage(m: any): ChatMessage {
  return {
    content: typeof m?.content === 'string' ? m.content : '',
    isError: Boolean(m?.isError),
    isFromUser: Boolean(m?.isFromUser),
    timestamp: typeof m?.timestamp === 'number' && Number.isFinite(m.timestamp) ? m.timestamp : Date.now(),
  }
}

function normalizeRecord(r: any): ChatRecord {
  const now = Date.now()
  const msgs: ChatMessage[] = Array.isArray(r?.messages) ? r.messages.map(normalizeMessage) : []
  let id: number = typeof r?.id === 'number' && Number.isFinite(r.id) ? r.id : generateId()
  // 避免重复 id
  while (state.histories.some(h => h.id === id)) id = generateId()
  return {
    createdAt: typeof r?.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : now,
    id,
    messages: msgs,
    title: typeof r?.title === 'string' && r.title.trim().length ? r.title.trim() : (msgs[0]?.content ? msgs[0].content.slice(0, 20) : '新对话'),
    updatedAt: typeof r?.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : (msgs.length ? msgs[msgs.length - 1].timestamp : now),
  }
}

export function exportHistories(): ChatRecord[] {
  return clone(state.histories)
}

export function replaceHistories(input: any): { ok: boolean; error?: string } {
  try {
    if (!Array.isArray(input)) return { ok: false, error: '历史记录格式错误：期望为数组' }
    const list: ChatRecord[] = input.map(normalizeRecord)
    state.histories = list
    state.activeId = state.histories.length ? state.histories[0].id : null
    persist()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}