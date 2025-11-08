<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { chatStore } from '../store/chat'
import { reply as mockReply } from '../api/mock'
import { themeStore } from '../store/theme'
import { modelConfig, getGroupById, getModelsByGroup, setSelectedModel } from '../store/modelConfig'
import { autoSyncEnabled, uploadHistoryRecordAndIndex, mirrorLocalWithCloud, lastSyncSuccessAt, markSyncSuccess, checkIndexDiff } from '../store/oss'

const props = defineProps<{ sidebarOpen: boolean; toggleSidebar: () => void }>()
// 通过计算属性引用 props，避免某些场景下直接访问 props 导致渲染不更新
const isOpen = computed(() => !!props.sidebarOpen)

const activeChat = computed(() => chatStore.getActiveChat())

const inputText = ref('')
const messagesEl = ref<HTMLDivElement | null>(null)
const themeMode = computed(() => themeStore.mode.value)

// 主页右上角同步成功图标（2秒后消失）
const showSyncOk = ref(false)
watch(lastSyncSuccessAt, () => {
  showSyncOk.value = true
  window.setTimeout(() => { showSyncOk.value = false }, 2000)
})

// 当前选择模型信息
const selectedModel = computed(() => {
  const cfg = modelConfig.value
  const models = Array.isArray(cfg?.models) ? cfg.models : []
  const id = cfg?.selectedModelId || ''
  return models.find(m => m.id === id) || null
})
const selectedProvider = computed(() => selectedModel.value ? (getGroupById(selectedModel.value.groupId)?.name || '未分组') : '未选择')
// 顶部按钮仅显示“显示名称”（ModelItem.name），不显示调用名或分组
const selectedLabel = computed(() => selectedModel.value?.name || '未选择模型')
const showModelModal = ref(false)
function openModelSelector() { showModelModal.value = true }
function closeModelSelector() { showModelModal.value = false }
function chooseModel(id: string) {
  setSelectedModel(id)
  closeModelSelector()
}

// 安全获取分组与模型列表，避免初始渲染时空值报错
const groups = computed(() => Array.isArray(modelConfig.value?.modelGroups) ? modelConfig.value!.modelGroups : [])
function listModelsInGroup(groupId: string) {
  try { return getModelsByGroup(groupId) } catch { return [] }
}
const selectedId = computed(() => modelConfig.value?.selectedModelId || '')

function scrollToBottom() {
  nextTick(() => {
    const el = messagesEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function sendMessage() {
  const text = inputText.value.trim()
  if (!text) return
  const now = Date.now()
  chatStore.appendMessage({
    content: text,
    isError: false,
    isFromUser: true,
    timestamp: now,
  })
  inputText.value = ''
  scrollToBottom()

  // 使用模拟 API 服务回复
  mockReply(text, {
    provider: selectedProvider.value || 'mock-provider',
    model: (selectedModel.value?.modelName || selectedModel.value?.name || 'mock-default'),
  })
    .then(async res => {
      chatStore.appendMessage({
        content: res,
        isError: false,
        isFromUser: false,
        timestamp: Date.now(),
      })
      try {
        const enabled = (autoSyncEnabled as any).value !== undefined ? (autoSyncEnabled as any).value : autoSyncEnabled
        const id = chatStore.getActiveChat()?.id
        if (enabled && typeof id === 'number') {
          await uploadHistoryRecordAndIndex(id)
          // 上传成功后标记同步成功，右上角显示勾号 2 秒
          markSyncSuccess()
        }
      } catch (_) { /* ignore auto-upload failure */ }
    })
    .catch(() => {
      chatStore.appendMessage({
        content: '（模拟服务）请求失败',
        isError: true,
        isFromUser: false,
        timestamp: Date.now(),
      })
    })
    .finally(() => scrollToBottom())
}

function copy(text: string) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).catch(() => {})
  } else {
    // 兜底方案
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (_) {}
    document.body.removeChild(ta)
  }
}

// 首次进入主页时显示“新对话”状态
onMounted(() => {
  chatStore.startDraft()
  try {
    const enabled = (autoSyncEnabled as any).value !== undefined ? (autoSyncEnabled as any).value : autoSyncEnabled
    if (enabled) {
      // 先比对ID表，只有不同才触发下载，减少流量
      checkIndexDiff()
        .then(diff => {
          if (diff.ok && (diff.added > 0 || diff.removed > 0)) {
            return mirrorLocalWithCloud()
          }
          return { ok: false, message: '无需同步', added: 0, removed: 0 }
        })
        .then(res => { if ((res as any).ok) markSyncSuccess() })
        .catch(() => {})
    }
  } catch (_) {}
})

// 切换会话或消息变动时滚到底
watch(() => activeChat.value?.id, () => scrollToBottom())
watch(() => activeChat.value?.messages.length, () => scrollToBottom())
</script>

<template>
  <section class="chat-main">
    <header class="topbar">
      <button class="menu-btn" aria-label="菜单" title="菜单" @click="props.toggleSidebar">
        <svg v-if="!isOpen" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="model-btn" :title="selectedLabel" @click.stop="openModelSelector">
        {{ selectedLabel }}
      </button>
      <div class="spacer"></div>
      <button class="theme-btn" :aria-label="'主题：' + themeMode" :title="'主题：' + themeMode" @click="themeStore.cycle()">
        <svg v-if="themeMode === 'system'" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="5" width="18" height="12" rx="2" stroke="currentColor" stroke-width="2"/>
          <rect x="9" y="17" width="6" height="2" fill="currentColor"/>
        </svg>
        <svg v-else-if="themeMode === 'light'" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="4" fill="currentColor"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 12a8 8 0 1 1-8-8 6 6 0 0 0 8 8z" fill="currentColor"/>
        </svg>
      </button>
      <div class="sync-ok" v-show="showSyncOk" title="同步完成">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="#16a34a" stroke-width="2" fill="none"/>
          <path d="M7 12l3 3 7-7" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </header>

    <div class="scroll" ref="messagesEl">
      <div class="messages">
        <div v-if="!activeChat || activeChat.messages.length === 0" class="empty">
          有什么可以帮忙的？
        </div>
        <div v-else>
          <div
            v-for="(m, i) in activeChat.messages"
            :key="i"
            class="msg"
            :class="{ user: m.isFromUser, ai: !m.isFromUser, error: m.isError }"
          >
            <!-- 发送气泡：右侧对齐；hover 显示复制按钮（下方） -->
            <template v-if="m.isFromUser">
              <div class="bubble-wrap">
                <div class="bubble">{{ m.content }}</div>
        <button class="copy-inline" title="复制" @click="copy(m.content)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="9" y="9" width="10" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <rect x="5" y="3" width="10" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
              </div>
            </template>
            <!-- AI 文本：左侧常驻复制按钮（在内容下方靠左） -->
            <template v-else>
              <div class="text">{{ m.content }}</div>
              <button class="copy-ai" aria-label="复制" title="复制" @click="copy(m.content)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="9" y="9" width="10" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
                  <rect x="5" y="3" width="10" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <footer class="inputbar">
      <textarea
        v-model="inputText"
        class="input"
        placeholder="输入消息，按下发送"
        rows="1"
        @keydown.enter.exact.prevent="sendMessage"
      ></textarea>
      <button class="send-btn" @click="sendMessage">发送</button>
    </footer>

    <!-- 模型选择弹窗 -->
    <div v-if="showModelModal" class="modal-mask" @click.self="closeModelSelector">
      <div class="modal">
        <div class="modal-title">选择模型</div>
        <div class="modal-body">
          <div v-if="groups.length === 0" class="empty">暂无模型组，请在设置页添加。</div>
          <div v-else class="group-list">
            <div class="group" v-for="g in groups" :key="g.id">
              <div class="group-title">{{ g.name }}</div>
              <div class="model-list">
                <button
                  v-for="m in listModelsInGroup(g.id)"
                  :key="m.id"
                  class="model-item"
                  :class="{ active: m.id === selectedId }"
                  @click="chooseModel(m.id)"
                >
                  {{ m.name || m.modelName }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="closeModelSelector">关闭</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chat-main { display: flex; flex-direction: column; height: 100%; }
.topbar {
  position: sticky; top: 0; z-index: 2;
  display: flex; align-items: center; justify-content: flex-start; gap: 8px;
  height: 56px; border-bottom: 1px solid var(--border); background: var(--bg); padding: 0 20px; color: var(--text);
}
.model-btn { border: none; background: transparent; cursor: pointer; padding: 6px 8px; border-radius: 8px; color: var(--text); font-weight: 600; font-size: 14px; }
.model-btn:hover { background: var(--hover); }

.menu-btn { border: none; background: transparent; cursor: pointer; padding: 0; border-radius: 8px; margin-right: 0; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; color: var(--text); }
.menu-btn svg { display: block; }
.menu-btn:hover { background: var(--hover); }
.spacer { flex: 1; }
.theme-btn { border: none; background: transparent; cursor: pointer; padding: 0; border-radius: 8px; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; color: var(--text); }
.theme-btn:hover { background: var(--hover); }
.sync-ok { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; }
.sync-ok svg { display: block; }

.scroll { flex: 1; overflow-y: auto; background: var(--bg); width: 100%; }
.messages { padding: 20px; max-width: 860px; margin: 0 auto; }
.empty { color: var(--muted); text-align: center; margin-top: 80px; }

.msg { width: 100%; margin-bottom: 24px; }
.msg.user { text-align: right; }
.bubble-wrap { display: inline-block; position: relative; max-width: 100%; }
.bubble {
  display: inline-block;
  max-width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bubble-user-bg);
  white-space: pre-wrap;
  word-break: break-word;
}
.copy-inline {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  border: none; background: transparent; border-radius: 8px; padding: 4px; cursor: pointer; color: var(--text);
  opacity: 0; pointer-events: none; transition: opacity 0.15s ease-in-out;
}
.bubble-wrap:hover .copy-inline { opacity: 1; pointer-events: auto; }

.text { color: var(--text); white-space: pre-wrap; word-break: break-word; }
.copy-ai {
  margin-top: 6px; display: inline-flex; align-items: center;
  border: none; background: transparent; border-radius: 8px; padding: 4px; cursor: pointer; color: var(--text);
}
.copy-ai:hover, .copy-inline:hover { background: var(--hover); }

.error .bubble { background: var(--error-bg); }

.inputbar {
  display: flex; gap: 10px; padding: 12px; border-top: 1px solid var(--border); background: var(--bg);
}
.input {
  flex: 1; padding: 10px 12px; border: 1px solid var(--btn-border); border-radius: 10px; resize: none; background: var(--btn-bg); color: var(--text);
}
.send-btn { padding: 10px 16px; border-radius: 10px; border: 1px solid var(--btn-border); background: var(--btn-bg); cursor: pointer; color: var(--text); }
.send-btn:hover { background: var(--hover); }

/* 模态框样式（采用全局白/黑背景变量） */
.modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.28); display: flex; align-items: center; justify-content: center; z-index: 20; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.modal { width: min(92vw, 560px); background: var(--modal-bg); border: 1px solid var(--btn-border); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; 
  max-height: min(82vh, 720px); display: flex; flex-direction: column; }
.modal-title { font-weight: 600; padding: 14px 16px; border-bottom: 1px solid var(--border); color: var(--text); }
.modal-body { padding: 16px; color: var(--text); flex: 1 1 auto; overflow-y: auto; }
.group-list { display: grid; gap: 12px; }
.group { border: 1px dashed var(--btn-border); border-radius: 10px; padding: 10px; }
.group-title { font-weight: 600; margin-bottom: 8px; }
.model-list { display: flex; flex-wrap: wrap; gap: 8px; }
.model-item { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); cursor: pointer; color: var(--text); }
.model-item:hover { background: var(--hover); }
.model-item.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }
.btn { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); cursor: pointer; color: var(--text); }
.btn:hover { background: var(--hover); }
</style>