<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { chatStore } from '../store/chat'
import { reply as aiReply, replyStream, replyConversation, type ConversationMessage } from '../api/openai'
import { themeStore } from '../store/theme'
import { modelConfig, getModelsByGroup, setSelectedModel } from '../store/modelConfig'
import hljs from 'highlight.js'

import { renderMarkdown } from '../utils/markdown'

const props = defineProps<{ sidebarOpen: boolean; toggleSidebar: () => void; isMobile: boolean }>()
// 通过计算属性引用 props，避免某些场景下直接访问 props 导致渲染不更新
const isOpen = computed(() => !!props.sidebarOpen)

const activeChat = computed(() => chatStore.getActiveChat())

const inputText = ref('')
const messagesEl = ref<HTMLDivElement | null>(null)
const themeMode = computed(() => themeStore.mode.value)
const isGenerating = ref(false)

// 代码块预览状态管理
const isPreviewOpen = ref(false)
const previewWidth = ref(66) // 预览窗口宽度百分比
const isResizing = ref(false)
const previewCodeId = ref<string | null>(null)
const previewCodeContent = ref<string>('')
const previewCodeLanguage = ref<string>('')
const previewMode = ref<'code' | 'preview'>('code')

// 监听预览模式切换，重新高亮代码
watch(previewMode, (newMode) => {
  if (newMode === 'code') {
    highlightPreviewCode()
  }
})

// 拖拽调整大小相关逻辑
function startResize() {
  isResizing.value = true
  document.addEventListener('mousemove', doResize)
  document.addEventListener('mouseup', stopResize)
  // 防止拖拽时选中文本
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function doResize(e: MouseEvent) {
  if (!isResizing.value) return
  const containerWidth = document.body.clientWidth
  // 计算右侧预览区域的宽度比例
  // e.clientX 是鼠标距离左侧的距离，所以右侧宽度 = 总宽 - 鼠标位置
  const rightWidthPx = containerWidth - e.clientX
  let percentage = (rightWidthPx / containerWidth) * 100
  
  // 限制范围 20% - 80%
  if (percentage < 20) percentage = 20
  if (percentage > 80) percentage = 80
  
  previewWidth.value = percentage
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', doResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

// 检测代码是否包含 HTML 标签
function isHtmlCode(code: string, language: string): boolean {
  if (language.toLowerCase() === 'html') {
    return true
  }
  const htmlRegex = /<(!DOCTYPE|html|head|body|div|span|p|h[1-6]|script|style|link|meta|title|a|img|table|tr|td|th|ul|ol|li|input|button|form|select|option|textarea|label|br|hr|b|i|u|strong|em|code|pre|blockquote|header|footer|nav|section|article|aside|main|figure|figcaption|video|audio|canvas|svg|iframe|embed|object|param|source|track|map|area|base|col|colgroup|dd|dl|dt|fieldset|legend|optgroup|output|progress|ruby|rt|rp|samp|small|sub|sup|template|time|var|wbr)\b/i
  return htmlRegex.test(code)
}

// 打开代码预览
function openCodePreview(content: string, language: string) {
  previewCodeContent.value = content
  previewCodeLanguage.value = language
  previewMode.value = isHtmlCode(content, language) ? 'preview' : 'code'
  isPreviewOpen.value = true
  
  // 高亮预览区域的代码
  if (previewMode.value === 'code') {
    highlightPreviewCode()
  }
}

// 关闭代码预览
function closeCodePreview() {
  isPreviewOpen.value = false
  previewCodeId.value = null
}

// 高亮预览区域的代码
function highlightPreviewCode() {
  if (!isPreviewOpen.value || previewMode.value !== 'code') return
  nextTick(() => {
    const previewCodeEl = document.querySelector('.code-preview .preview-code code') as HTMLElement | null
    if (previewCodeEl) {
      hljs.highlightElement(previewCodeEl)
    }
  })
}

// 复制提示（Toast）
const showCopyToast = ref(false)
const copyToastText = ref('已复制')
function showToast(msg: string, timeout = 1500) {
  copyToastText.value = msg
  showCopyToast.value = true
  window.setTimeout(() => { showCopyToast.value = false }, timeout)
}

// 编辑并重新发送弹窗状态
const showEditModal = ref(false)
const editDraft = ref('')
const editingIndex = ref<number | null>(null)
function openEdit(index: number, content: string) {
  editingIndex.value = index
  editDraft.value = content
  showEditModal.value = true
}
function closeEditModal() {
  showEditModal.value = false
  editingIndex.value = null
  editDraft.value = ''
}



// 当前选择模型信息
const selectedModel = computed(() => {
  const cfg = modelConfig.value
  const models = Array.isArray(cfg?.models) ? cfg.models : []
  const id = cfg?.selectedModelId || ''
  return models.find(m => m.id === id) || null
})
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
  if (isGenerating.value) return
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

  // 先追加一个 AI 占位消息，用于流式累积内容
  const placeholder = {
    content: '',
    isError: false,
    isFromUser: false,
    timestamp: Date.now(),
    modelDisplayName: selectedLabel.value,
  }
  chatStore.appendMessage(placeholder)
  scrollToBottom()

  // 构造完整上下文（不含刚追加的空AI占位）
  const active = chatStore.getActiveChat()
  const msgs = (active?.messages || [])
  const ctx: ConversationMessage[] = msgs.slice(0, Math.max(0, msgs.length - 1))
    .filter(m => !m.isError)
    .map(m => ({ role: m.isFromUser ? 'user' : 'assistant', content: m.content }))

  const aiIndex = Math.max(0, (active?.messages.length || 1) - 1)

  // 开启流式输出；失败时回退到非流式
  isGenerating.value = true
  replyStream(ctx, {
    model: (selectedModel.value?.modelName || selectedModel.value?.name || ''),
    groupId: selectedModel.value?.groupId,
  }, (delta: string) => {
    const cur = chatStore.getActiveChat()
    if (!cur) return
    const target = cur.messages[aiIndex]
    if (!target) return
    target.content += delta
    target.timestamp = Date.now()
    scrollToBottom()
  })
    .then(() => {
      // 流式完成
    })
    .catch(async (err) => {
      // 回退：非流式一次性请求
      try {
        const res = await aiReply(text, {
          model: (selectedModel.value?.modelName || selectedModel.value?.name || ''),
          groupId: selectedModel.value?.groupId,
        })
        const cur = chatStore.getActiveChat()
        if (cur) {
          const nm = cur.messages[aiIndex]
          if (nm) {
            nm.content = res
            nm.timestamp = Date.now()
          }
        }

      } catch (e2) {
        const cur = chatStore.getActiveChat()
        if (cur) {
          const nm = cur.messages[aiIndex]
          if (nm) {
            nm.content = `OpenAI 请求失败：${(err && err.message) ? err.message : '未知错误'}`
            nm.isError = true
            nm.timestamp = Date.now()
          }
        }
      }
    })
    .finally(() => { isGenerating.value = false; scrollToBottom() })
}

function copy(text: string) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(() => { showToast('已复制') }).catch(() => {})
  } else {
    // 兜底方案
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (_) {}
    document.body.removeChild(ta)
    showToast('已复制')
  }
}

// 重新发送指定 AI 回复：基于该条之前的完整上下文重试，完成后删除旧记录
async function resend(index: number) {
  if (isGenerating.value) return
  const active = chatStore.getActiveChat()
  if (!active) return
  const msgs = active.messages
  if (!msgs || index < 0 || index >= msgs.length) return
  const target = msgs[index]
  if (!target) return
  if (target.isFromUser) return // 仅对 AI 消息提供“重新发送”

  // 构造上下文：仅取到旧 AI 回复之前的消息
  const ctx: ConversationMessage[] = msgs.slice(0, index)
    .filter(m => !m.isError)
    .map(m => ({ role: m.isFromUser ? 'user' : 'assistant', content: m.content }))

  // 立刻删除旧记录，并在相同位置插入新的占位
  const id = chatStore.getActiveChat()?.id
  if (typeof id === 'number') {
    chatStore.removeMessageAt(id, index)
    const placeholder = { content: '', isError: false, isFromUser: false, timestamp: Date.now() }
    chatStore.insertMessageAt(id, index, placeholder)
    chatStore.persistNow()
  }
  const aiIndexNew = index

  // 首选流式重试；失败回退到非流式整段上下文
  try {
    isGenerating.value = true
    await replyStream(ctx, {
      model: (selectedModel.value?.modelName || selectedModel.value?.name || ''),
      groupId: selectedModel.value?.groupId,
    }, (delta: string) => {
      const cur = chatStore.getActiveChat(); if (!cur) return
      const nm = cur.messages[aiIndexNew]
      if (!nm) return
      nm.content += delta
      nm.timestamp = Date.now()
      scrollToBottom()
    })

    isGenerating.value = false
  } catch (err) {
    // 非流式整段上下文回退
    try {
      const res = await replyConversation(ctx, {
        model: (selectedModel.value?.modelName || selectedModel.value?.name || ''),
        groupId: selectedModel.value?.groupId,
      })
      const cur = chatStore.getActiveChat(); if (cur) {
        const nm = cur.messages[aiIndexNew]
        if (nm) {
          nm.content = res
          nm.timestamp = Date.now()
        }
      }

      isGenerating.value = false
    } catch (e2: any) {
      const cur = chatStore.getActiveChat(); if (cur) {
        const nm = cur.messages[aiIndexNew]
        if (nm) {
          nm.content = `重新发送失败：${(e2 && e2.message) ? e2.message : '未知错误'}`
          nm.isError = true
          nm.timestamp = Date.now()
        }
      }
      isGenerating.value = false
    }
  }
}

// 编辑后重新发送：更新指定用户消息，截断其后的所有消息并基于新上下文生成回复
async function applyEditAndResend() {
  if (isGenerating.value) return
  const idx = editingIndex.value
  if (idx == null) return
  const active = chatStore.getActiveChat(); if (!active) return
  const msgs = active.messages
  if (!msgs || idx < 0 || idx >= msgs.length) return
  const target = msgs[idx]
  if (!target) { closeEditModal(); return }
  if (!target.isFromUser) { closeEditModal(); return }

  // 更新文本并刷新时间戳
  target.content = editDraft.value.trim()
  target.timestamp = Date.now()

  // 截断其后的全部消息
  const id = active.id
  while (active.messages.length > idx + 1) {
    chatStore.removeMessageAt(id, idx + 1)
  }
  chatStore.persistNow()

  // 关闭弹窗，清理状态
  closeEditModal()

  // 追加新的 AI 占位并开始按上下文重新生成
  const placeholder = { content: '', isError: false, isFromUser: false, timestamp: Date.now() }
  chatStore.appendMessage(placeholder)
  const cur = chatStore.getActiveChat(); if (!cur) return
  const arr = cur.messages
  const ctx: ConversationMessage[] = arr.slice(0, Math.max(0, arr.length - 1))
    .filter(m => !m.isError)
    .map(m => ({ role: m.isFromUser ? 'user' : 'assistant', content: m.content }))
  const aiIndex = Math.max(0, arr.length - 1)

  try {
    isGenerating.value = true
    await replyStream(ctx, {
      model: (selectedModel.value?.modelName || selectedModel.value?.name || ''),
      groupId: selectedModel.value?.groupId,
    }, (delta: string) => {
      const cur2 = chatStore.getActiveChat(); if (!cur2) return
      const nm = cur2.messages[aiIndex]
      if (!nm) return
      nm.content += delta
      nm.timestamp = Date.now()
      scrollToBottom()
    })

    isGenerating.value = false
  } catch (err) {
    // 非流式整段上下文回退
    try {
      const res = await replyConversation(ctx, {
        model: (selectedModel.value?.modelName || selectedModel.value?.name || ''),
        groupId: selectedModel.value?.groupId,
      })
      const cur3 = chatStore.getActiveChat(); if (cur3) {
        const nm = cur3.messages[aiIndex]
        if (nm) {
          nm.content = res
          nm.timestamp = Date.now()
        }
      }

      isGenerating.value = false
    } catch (e2: any) {
      const cur4 = chatStore.getActiveChat(); if (cur4) {
        const nm = cur4.messages[aiIndex]
        if (nm) {
          nm.content = `重新发送失败：${(e2 && e2.message) ? e2.message : '未知错误'}`
          nm.isError = true
          nm.timestamp = Date.now()
        }
      }
      isGenerating.value = false
    }
  }
}

// 事件委托：处理代码块相关按钮点击
function onMessageClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target) return
  
  // 处理复制按钮点击
  const copyBtn = target.closest('.code-copy-btn') as HTMLElement | null
  if (copyBtn) {
    const wrapper = copyBtn.closest('.code-block') as HTMLElement | null
    const codeEl = wrapper?.querySelector('pre > code') as HTMLElement | null
    const codeText = codeEl?.textContent || ''
    copy(codeText)
    return
  }
  
  // 处理预览按钮点击
  const previewBtn = target.closest('.code-preview-btn') as HTMLElement | null
  if (previewBtn) {
    const wrapper = previewBtn.closest('.code-block') as HTMLElement | null
    if (!wrapper) return
    
    const codeEl = wrapper.querySelector('pre > code')
    const codeText = codeEl?.textContent || ''
    const language = wrapper.querySelector('.code-language')?.textContent || ''
    
    openCodePreview(codeText, language)
    return
  }
 
  // 处理源码按钮点击（如果有的话，通常源码就是直接看）
  // ...

  // 处理折叠/展开按钮点击
  const toggleBtn = target.closest('.code-toggle-btn') as HTMLElement | null
  if (toggleBtn) {
    const wrapper = toggleBtn.closest('.code-block') as HTMLElement | null
    if (wrapper) {
      wrapper.classList.toggle('collapsed')
      // 更新按钮图标或提示（如果需要动态改变SVG，可以在这里做，或者CSS控制）
    }
    return
  }
}

// 首次进入主页时显示“新对话”状态
onMounted(() => {
  chatStore.startDraft()
  // 绑定点击事件，用于复制代码块
  try { messagesEl.value?.addEventListener('click', onMessageClick) } catch (_) {}
})

onUnmounted(() => {
  try { messagesEl.value?.removeEventListener('click', onMessageClick) } catch (_) {}
})

// 切换会话或消息变动时滚到底
watch(() => activeChat.value?.id, () => scrollToBottom())
watch(() => activeChat.value?.messages.length, () => scrollToBottom())
</script>

<template>
  <div class="chat-container">
    <!-- 主聊天区域 -->
    <section class="chat-main" :class="{ 'preview-open': isPreviewOpen }" :style="isPreviewOpen ? { width: `calc(100% - ${previewWidth}%)` } : {}">
      <header class="topbar">
        <button class="menu-btn" @click="toggleSidebar">
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
              :class="[m.isFromUser ? 'user' : 'ai', m.isError ? 'error' : '']"
            >
              <template v-if="m.isFromUser">
                <div class="bubble-wrap">
                  <div class="bubble">{{ m.content }}</div>
          <div class="inline-actions">
            <button class="edit-inline" aria-label="编辑并重新发送" title="编辑并重新发送" @click="openEdit(i, m.content)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 16l1-4 9-9 4 4-9 9-4 1z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
                <path d="M12 5l4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="copy-inline" aria-label="复制" title="复制" @click="copy(m.content)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="9" y="9" width="10" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
                <rect x="5" y="3" width="10" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </button>
          </div>
                </div>
              </template>
              <template v-else>
                <div class="text markdown" v-html="renderMarkdown(m.content)"></div>
                <div class="actions">
                  <button class="copy-ai" aria-label="复制" title="复制" @click="copy(m.content)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="9" y="9" width="10" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
                      <rect x="5" y="3" width="10" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                  </button>
                  <button class="resend-ai" aria-label="重新发送" title="重新发送该条回复" @click="resend(i)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 5a7 7 0 1 1-6.9 8.3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                      <path d="M7 4v4h4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <span v-if="m.modelDisplayName" class="model-info" title="使用的模型">{{ m.modelDisplayName }}</span>
                </div>
              </template>
            </div>
          </div>
      </div>
      </div>

      <div v-if="showCopyToast" class="toast-layer" aria-live="polite">
        <div class="toast">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="#16a34a" stroke-width="2" fill="none"/>
            <path d="M7 12l3 3 7-7" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>{{ copyToastText }}</span>
        </div>
      </div>

      <footer class="inputbar">
        <textarea
          v-model="inputText"
          class="input"
          placeholder="输入消息，按下发送"
          rows="1"
          @keydown.enter.exact.prevent="!isGenerating && sendMessage()"
        ></textarea>
        <button class="send-btn" :disabled="isGenerating" @click="sendMessage">
          <span v-if="!isGenerating">发送</span>
          <span class="loading" v-else>
            <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25"/>
              <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            正在回复…
          </span>
        </button>
      </footer>

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
                    :class="[m.id === selectedId ? 'active' : '']"
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

      <div v-if="showEditModal" class="modal-mask" @click.self="closeEditModal">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-title">编辑消息</div>
          <div class="modal-body">
            <textarea v-model="editDraft" class="edit-input" rows="6" placeholder="在此修改您的消息"></textarea>
          </div>
          <div class="modal-actions">
            <button class="btn" @click="closeEditModal">取消</button>
            <button class="btn primary" @click="applyEditAndResend">更新并重新发送</button>
          </div>
        </div>
      </div>
    </section>
    
    <!-- 拖拽调整宽度的把手 -->
    <div 
      v-if="isPreviewOpen" 
      class="resize-handle" 
      @mousedown="startResize"
    ></div>

    <!-- 代码预览面板 -->
    <div v-if="isPreviewOpen" class="code-preview" :style="{ width: `${previewWidth}%` }">
      <div class="preview-header">
        <h3>代码预览</h3>
        <div class="preview-language">{{ previewCodeLanguage }}</div>
        
        <!-- 预览/代码切换按钮 -->
        <div v-if="isHtmlCode(previewCodeContent, previewCodeLanguage)" class="preview-mode-toggle">
          <button 
            class="mode-btn" 
            :class="{ active: previewMode === 'code' }" 
            @click="previewMode = 'code'"
          >
            代码
          </button>
          <button 
            class="mode-btn" 
            :class="{ active: previewMode === 'preview' }" 
            @click="previewMode = 'preview'"
          >
            预览
          </button>
        </div>
        
        <button class="preview-close-btn" @click="closeCodePreview" aria-label="关闭预览">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="preview-content">
        <!-- 代码模式 -->
        <pre v-if="previewMode === 'code'" class="preview-code"><code :class="`language-${previewCodeLanguage} hljs`">{{ previewCodeContent }}</code></pre>
        
        <!-- 预览模式 (使用 iframe 隔离) -->
        <iframe 
          v-else 
          class="preview-iframe" 
          sandbox="allow-scripts" 
          :srcdoc="previewCodeContent"
        ></iframe>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 聊天容器 */
.chat-container {
  display: flex;
  height: 100%;
  overflow: hidden;
  position: relative;
  background: var(--bg);
}

/* 主聊天区域 */
.chat-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  flex-shrink: 0;
  position: relative;
  background: var(--bg);
}

/* 顶部栏 - 悬浮玻璃态 */
.topbar {
  position: absolute; top: 0; left: 0; right: 0; z-index: 10;
  display: flex; align-items: center; gap: 12px;
  height: 64px; 
  padding: 0 24px; 
  color: var(--text);
  background: var(--backdrop-bg);
  backdrop-filter: var(--blur-md);
  -webkit-backdrop-filter: var(--blur-md);
  border-bottom: 1px solid rgba(0,0,0,0.05);
}

.model-btn { 
  border: 1px solid transparent; 
  background: rgba(125, 125, 125, 0.08); 
  cursor: pointer; 
  padding: 8px 16px; 
  border-radius: var(--radius-full); 
  color: var(--text); 
  font-weight: 600; 
  font-size: 14px; 
  transition: all 0.2s;
  display: flex; align-items: center; gap: 6px;
}
.model-btn:hover { background: var(--hover); box-shadow: var(--shadow-sm); transform: translateY(-1px); }

.menu-btn, .theme-btn { 
  border: none; background: transparent; cursor: pointer; padding: 0; 
  border-radius: var(--radius-full); 
  width: 40px; height: 40px; 
  display: inline-flex; align-items: center; justify-content: center; 
  color: var(--muted); 
  transition: all 0.2s;
}
.menu-btn:hover, .theme-btn:hover { background: var(--hover); color: var(--text); transform: rotate(15deg); }
.spacer { flex: 1; }

/* 消息滚动区 */
.scroll { 
  flex: 1; overflow-y: auto; overflow-x: hidden; 
  padding-top: 80px; /* Topbar height + spacing */
  padding-bottom: 120px; /* Inputbar height + spacing */
  scroll-behavior: smooth;
}
.messages { padding: 0 24px; max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }

.empty { 
  color: var(--muted); 
  text-align: center; 
  margin-top: 25vh; 
  font-size: 1.5rem;
  font-weight: 600;
  opacity: 0.6;
  letter-spacing: 1px;
}

/* 消息条目 */
.msg { width: 100%; display: flex; flex-direction: column; animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.msg.user { align-items: flex-end; }
.msg.ai { align-items: flex-start; }

.bubble-wrap { display: flex; flex-direction: column; align-items: flex-end; max-width: 85%; }
.bubble {
  padding: 12px 18px;
  border-radius: var(--radius-xl);
  border-bottom-right-radius: 4px;
  background: var(--primary);
  color: #fff;
  box-shadow: var(--shadow-md);
  text-align: left;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 15px;
  line-height: 1.6;
}

.msg.ai .text { 
  max-width: 100%; 
  padding: 0 12px;
  font-size: 16px;
  line-height: 1.75;
  color: var(--text);
}

/* 行内操作栏 */
.inline-actions { margin-top: 6px; display: flex; gap: 6px; opacity: 0; transition: all 0.2s; transform: translateY(-5px); }
.bubble-wrap:hover .inline-actions { opacity: 1; transform: translateY(0); }

.actions { display: flex; gap: 8px; margin-top: 8px; opacity: 0; transition: all 0.2s; padding-left: 12px; }
.msg.ai:hover .actions { opacity: 1; }

.edit-inline, .copy-inline, .copy-ai, .resend-ai {
  border: none; background: transparent; 
  border-radius: var(--radius-md); 
  padding: 6px; cursor: pointer; color: var(--muted);
  transition: all 0.2s;
  display: flex; align-items: center; justify-content: center;
}
.edit-inline:hover, .copy-inline:hover, .copy-ai:hover, .resend-ai:hover { 
  background: var(--hover); color: var(--text); transform: scale(1.1);
}

.model-info {
  margin-top: 8px; margin-left: 12px;
  font-size: 11px; color: var(--muted);
  background: var(--panel); border: 1px solid var(--border);
  padding: 2px 8px; border-radius: var(--radius-sm);
}

/* 输入框 - 悬浮胶囊样式 */
.inputbar {
  position: absolute; bottom: 32px; left: 50%; transform: translateX(-50%);
  width: calc(100% - 48px); max-width: 860px;
  z-index: 20;
  display: flex; gap: 12px; align-items: flex-end;
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 24px;
  box-shadow: var(--shadow-float);
  backdrop-filter: var(--blur-lg);
  -webkit-backdrop-filter: var(--blur-lg);
  transition: all 0.3s ease;
}

.inputbar:focus-within {
  border-color: var(--primary);
  box-shadow: var(--shadow-xl);
  transform: translateX(-50%) translateY(-2px);
}

.input {
  flex: 1; padding: 8px 4px; border: none; 
  border-radius: 0; resize: none; 
  background: transparent; color: var(--text);
  font-size: 16px; line-height: 1.5;
  max-height: 200px; outline: none;
}
.input::placeholder { color: var(--muted); opacity: 0.7; }

.send-btn { 
  width: 40px; height: 40px; 
  border-radius: 50%; 
  border: none; 
  background: var(--primary); 
  color: #fff; 
  cursor: pointer; 
  display: flex; align-items: center; justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  box-shadow: var(--shadow-md);
}
.send-btn:hover { transform: scale(1.1) rotate(-10deg); box-shadow: var(--shadow-lg); }
.send-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; background: var(--muted); }

.loading { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* 拖拽把手 */
.resize-handle {
  width: 6px; height: 100%;
  cursor: col-resize;
  background: transparent;
  z-index: 30;
  transition: background 0.2s;
  margin-left: -3px; margin-right: -3px;
}
.resize-handle:hover, .resize-handle:active { background: var(--primary); opacity: 0.5; }

/* 代码预览面板 */
.code-preview {
  height: 100%;
  background: var(--panel);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-xl);
  z-index: 20;
  display: flex; flex-direction: column;
}

.preview-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.preview-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text); }
.preview-language {
  font-size: 11px; font-weight: 700; color: var(--primary);
  text-transform: uppercase; background: rgba(var(--primary-rgb), 0.1);
  padding: 2px 6px; border-radius: 4px; margin-right: auto;
}

.preview-mode-toggle {
  display: flex; gap: 4px; padding: 3px;
  background: var(--btn-bg); border: 1px solid var(--border);
  border-radius: 8px;
}
.mode-btn {
  padding: 4px 10px; border: none; background: transparent;
  border-radius: 6px; color: var(--muted); cursor: pointer;
  font-size: 12px; font-weight: 600; transition: all 0.2s;
}
.mode-btn.active { background: var(--bg); color: var(--primary); box-shadow: var(--shadow-sm); }

.preview-close-btn {
  width: 32px; height: 32px; border-radius: 8px;
  background: transparent; border: none; color: var(--muted);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s; margin-left: 8px;
}
.preview-close-btn:hover { background: var(--hover); color: var(--text); }

.preview-content { flex: 1; overflow: hidden; position: relative; background: var(--bg); }
.preview-code { 
  margin: 0; padding: 20px; height: 100%; overflow: auto; 
  background: var(--bg); font-size: 14px; 
}
.preview-iframe { width: 100%; height: 100%; border: none; background: #fff; }

/* 模态框通用 */
.modal-mask { 
  position: fixed; inset: 0; 
  background: var(--mask); 
  display: flex; align-items: center; justify-content: center; 
  z-index: 100;
  backdrop-filter: var(--blur-sm);
  -webkit-backdrop-filter: var(--blur-sm);
  animation: fadeIn 0.2s ease;
}

.modal { 
  width: min(90vw, 520px); 
  background: var(--bg); 
  border: 1px solid var(--border); 
  border-radius: var(--radius-xl); 
  box-shadow: var(--shadow-float);
  overflow: hidden; 
  display: flex; flex-direction: column;
  animation: modalPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  max-height: 80vh;
}
@keyframes modalPop {
  from { opacity: 0; transform: scale(0.95) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-title { 
  font-weight: 600; font-size: 18px; 
  padding: 20px 24px; 
  border-bottom: 1px solid var(--border); 
  color: var(--text); 
}
.modal-body { padding: 24px; overflow-y: auto; color: var(--text); }
.modal-actions { 
  display: flex; justify-content: flex-end; gap: 12px; 
  padding: 20px 24px; 
  border-top: 1px solid var(--border); 
  background: var(--panel);
}

/* 按钮通用 */
.btn { 
  padding: 10px 18px; border-radius: 10px; 
  border: 1px solid var(--border); background: var(--bg); 
  cursor: pointer; color: var(--text); font-weight: 500;
  transition: all 0.2s;
}
.btn:hover { background: var(--hover); border-color: var(--muted); }
.btn.primary { 
  background: var(--primary); color: #fff; border-color: transparent; 
  box-shadow: var(--shadow-md);
}
.btn.primary:hover { filter: brightness(1.1); transform: translateY(-1px); }

/* 模型选择列表 */
.group-list { display: flex; flex-direction: column; gap: 16px; }
.group-title { font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; margin-bottom: 8px; padding-left: 4px; }
.model-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.model-item { 
  padding: 10px; border-radius: 10px; 
  border: 1px solid var(--border); background: var(--panel); 
  cursor: pointer; color: var(--text); text-align: center;
  transition: all 0.2s; font-size: 14px;
}
.model-item:hover { border-color: var(--primary); background: var(--hover); }
.model-item.active { background: var(--primary); color: #fff; border-color: transparent; box-shadow: var(--shadow-sm); }

/* 编辑框 */
.edit-input { 
  width: 100%; min-height: 140px; 
  padding: 16px; border: 1px solid var(--border); 
  border-radius: 12px; background: var(--panel); 
  color: var(--text); font-size: 15px; resize: vertical; outline: none;
  transition: border-color 0.2s;
}
.edit-input:focus { border-color: var(--primary); }

/* Toast */
.toast-layer { position: fixed; top: 30px; left: 50%; transform: translateX(-50%); z-index: 200; pointer-events: none; }
.toast { 
  display: flex; align-items: center; gap: 10px; 
  padding: 10px 20px; border-radius: 50px; 
  background: rgba(0,0,0,0.8); color: #fff; 
  box-shadow: var(--shadow-lg); backdrop-filter: blur(8px);
  animation: slideDown 0.3s ease;
}
@keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

/* Markdown 样式适配 */
.markdown p { margin: 0 0 12px; line-height: 1.7; }
.markdown ul, .markdown ol { padding-left: 1.5em; margin-bottom: 12px; }
.markdown li { margin: 6px 0; }
.markdown pre { 
  background: var(--panel); border: 1px solid var(--border); 
  border-radius: 12px; padding: 0; overflow: hidden; margin: 16px 0; 
  box-shadow: var(--shadow-sm);
}
.markdown code { 
  background: rgba(125,125,125,0.1); padding: 2px 5px; 
  border-radius: 6px; font-size: 0.9em; color: var(--accent);
}
.markdown pre code { 
  background: transparent; padding: 16px; color: inherit; display: block; overflow-x: auto;
}
.markdown blockquote { 
  border-left: 4px solid var(--primary); padding-left: 16px; 
  color: var(--muted); margin: 16px 0; font-style: italic; background: var(--panel); padding: 12px 16px; border-radius: 0 8px 8px 0;
}

/* 代码块头部美化 */
.markdown .code-block { margin: 16px 0; border-radius: 12px; border: 1px solid var(--border); overflow: hidden; box-shadow: var(--shadow-sm); }
.markdown .code-block-header { background: var(--panel); padding: 8px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; }
.markdown .code-language { font-size: 12px; font-weight: 700; color: var(--muted); }

/* 暗黑模式微调 */
@media (prefers-color-scheme: dark) {
  .topbar { background: rgba(20, 20, 20, 0.8); }
}
</style>