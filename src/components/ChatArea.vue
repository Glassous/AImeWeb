<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { chatStore } from '../store/chat'
import { reply as aiReply, replyStream, replyConversation, type ConversationMessage } from '../api/openai'
import { themeStore } from '../store/theme'
import { modelConfig, getModelsByGroup, setSelectedModel } from '../store/modelConfig'

import { renderMarkdown } from '../utils/markdown'
import hljs from 'highlight.js'

const props = defineProps<{ sidebarOpen: boolean; toggleSidebar: () => void }>()
// 通过计算属性引用 props，避免某些场景下直接访问 props 导致渲染不更新
const isOpen = computed(() => !!props.sidebarOpen)

const activeChat = computed(() => chatStore.getActiveChat())

const inputText = ref('')
const messagesEl = ref<HTMLDivElement | null>(null)
const themeMode = computed(() => themeStore.mode.value)
const isGenerating = ref(false)

// 代码块预览状态管理
const isPreviewOpen = ref(false)
const previewCodeId = ref<string | null>(null)
const previewCodeContent = ref<string>('')
const previewCodeLanguage = ref<string>('')
const expandedCodeBlocks = ref<string[]>([])

// 预览模式：code 或 preview
const previewMode = ref<'code' | 'preview'>('code')

// 检测代码是否包含 HTML 标签
function isHtmlCode(code: string, language: string): boolean {
  if (language.toLowerCase() === 'html') {
    return true
  }
  // 检测是否包含 HTML 标签或 DOCTYPE
  const htmlRegex = /<(!DOCTYPE|html|head|body|div|span|p|h[1-6]|script|style|link|meta|title|a|img|table|tr|td|th|ul|ol|li|input|button|form|select|option|textarea|label|br|hr|b|i|u|strong|em|code|pre|blockquote|header|footer|nav|section|article|aside|main|figure|figcaption|video|audio|canvas|svg|iframe|embed|object|param|source|track|map|area|base|col|colgroup|dd|dl|dt|fieldset|legend|optgroup|output|progress|ruby|rt|rp|samp|small|sub|sup|template|time|var|wbr)\b/i
  return htmlRegex.test(code)
}

// 处理代码块折叠/展开
function toggleCodeBlock(codeId: string) {
  if (isPreviewOpen.value) {
    // 预览时只允许折叠，不允许展开
    if (expandedCodeBlocks.value.includes(codeId)) {
      expandedCodeBlocks.value = expandedCodeBlocks.value.filter(id => id !== codeId)
    }
  } else {
    // 正常模式下可以展开/折叠
    if (expandedCodeBlocks.value.includes(codeId)) {
      expandedCodeBlocks.value = expandedCodeBlocks.value.filter(id => id !== codeId)
    } else {
      expandedCodeBlocks.value.push(codeId)
    }
  }
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

// 打开代码预览
function openCodePreview(codeId: string, content: string, language: string) {
  previewCodeId.value = codeId
  previewCodeContent.value = content
  previewCodeLanguage.value = language
  previewMode.value = 'code' // 默认使用代码模式
  isPreviewOpen.value = true
  
  // 高亮预览区域的代码
  highlightPreviewCode()
}

// 关闭代码预览
function closeCodePreview() {
  isPreviewOpen.value = false
  previewCodeId.value = null
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
  
  // 处理折叠/展开按钮点击
  const toggleBtn = target.closest('.code-toggle-btn') as HTMLElement | null
  if (toggleBtn) {
    const wrapper = toggleBtn.closest('.code-block') as HTMLElement | null
    const codeBlockId = wrapper?.getAttribute('data-code-block-id')
    if (codeBlockId) {
      toggleCodeBlock(codeBlockId)
    }
    return
  }
  
  // 处理查看按钮点击
  const viewBtn = target.closest('.code-view-btn') as HTMLElement | null
  if (viewBtn) {
    const wrapper = viewBtn.closest('.code-block') as HTMLElement | null
    const codeBlockId = viewBtn.getAttribute('data-code-block-id')
    const language = viewBtn.getAttribute('data-code-language') || ''
    const codeEl = wrapper?.querySelector('pre > code') as HTMLElement | null
    const codeText = codeEl?.textContent || ''
    if (codeBlockId && codeText) {
      openCodePreview(codeBlockId, codeText, language)
    }
    return
  }
}

// 更新代码块展开状态
function updateCodeBlockExpansion() {
  if (!messagesEl.value) return
  
  // 移除所有展开状态
  const allCodeBlocks = messagesEl.value.querySelectorAll('.code-block')
  allCodeBlocks.forEach(block => {
    block.classList.remove('expanded')
  })
  
  // 添加当前展开状态
  expandedCodeBlocks.value.forEach(codeId => {
    const codeBlock = messagesEl.value?.querySelector(`[data-code-block-id="${codeId}"]`)
    codeBlock?.classList.add('expanded')
  })
}

// 首次进入主页时显示“新对话”状态
onMounted(() => {
  chatStore.startDraft()
  // 绑定点击事件，用于复制代码块
  try { messagesEl.value?.addEventListener('click', onMessageClick) } catch (_) {}
  
  // 初始调用一次，确保代码块默认折叠
  nextTick(() => {
    updateCodeBlockExpansion()
  })
  
  // 监听消息变化，更新代码块展开状态
  watch(() => activeChat.value?.messages, () => {
    nextTick(() => {
      updateCodeBlockExpansion()
    })
  }, { deep: true })
  
  // 监听展开状态变化，更新代码块
  watch(expandedCodeBlocks, () => {
    updateCodeBlockExpansion()
  })
  
  // 监听预览模式变化，当切换到代码模式时重新高亮
  watch(previewMode, (newMode) => {
    if (newMode === 'code') {
      highlightPreviewCode()
    }
  })
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
    <section class="chat-main" :class="{ 'preview-open': isPreviewOpen }">
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
    
    <!-- 代码预览面板 -->
    <div v-if="isPreviewOpen" class="code-preview">
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
        
        <!-- 预览模式 -->
        <div v-else class="html-preview" v-html="previewCodeContent"></div>
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
}

/* 主聊天区域 */
.chat-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  transition: width 0.3s ease;
  flex-shrink: 0;
}

/* 预览打开时，主聊天区域宽度调整为50% */
.chat-main.preview-open {
  width: calc(100% - 50%);
}

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

.scroll { flex: 1; overflow-y: auto; overflow-x: hidden; background: var(--bg); width: 100%; min-width: 0; }
.messages { padding: 20px; max-width: 860px; margin: 0 auto; }
.empty { color: var(--muted); text-align: center; margin-top: 80px; }

.msg { width: 100%; margin-bottom: 24px; }
.msg.user { text-align: right; }
.bubble-wrap { display: inline-flex; flex-direction: column; align-items: flex-end; max-width: 100%; }
.bubble {
  display: inline-block;
  max-width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bubble-user-bg);
  text-align: left; /* 保证换行后每行左对齐，避免右对齐问题 */
  white-space: pre-wrap;
  word-break: break-word;
}
.copy-inline {
  margin-top: 4px;
  border: none; background: transparent; border-radius: 8px; padding: 4px; cursor: pointer; color: var(--text);
  opacity: 0; pointer-events: none; transition: opacity 0.15s ease-in-out;
}
.bubble-wrap:hover .copy-inline { opacity: 1; pointer-events: auto; }

/* 发送气泡下方的行内操作区域（编辑 / 复制） */
.inline-actions { margin-top: 4px; display: inline-flex; align-items: center; gap: 6px; opacity: 0; pointer-events: none; transition: opacity 0.15s ease-in-out; }
.bubble-wrap:hover .inline-actions { opacity: 1; pointer-events: auto; }
.edit-inline { border: none; background: transparent; border-radius: 8px; padding: 4px; cursor: pointer; color: var(--text); display: inline-flex; align-items: center; }
.edit-inline:hover, .copy-inline:hover { background: var(--hover); }

.text { color: var(--text); white-space: normal; word-break: break-word; }
.text.markdown { max-width: 100%; overflow-x: hidden; }
.markdown img { max-width: 100%; height: auto; }
.markdown table { display: block; width: 100%; overflow-x: auto; }
.markdown .katex-display { display: block; overflow-x: auto; }
.markdown .katex { max-width: 100%; }
.copy-ai {
  margin-top: 6px; display: inline-flex; align-items: center;
  border: none; background: transparent; border-radius: 8px; padding: 4px; cursor: pointer; color: var(--text);
}
.resend-ai {
  margin-top: 6px; display: inline-flex; align-items: center;
  border: none; background: transparent; border-radius: 8px; padding: 4px; cursor: pointer; color: var(--text);
}
.actions { display: flex; gap: 6px; align-items: center; }
.copy-ai:hover, .copy-inline:hover { background: var(--hover); }
.resend-ai:hover { background: var(--hover); }

.model-info {
  margin-top: 6px;
  margin-left: 8px;
  font-size: 12px;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  background: var(--hover);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.error .bubble { background: var(--error-bg); }

.inputbar {
  display: flex; gap: 10px; padding: 12px; border-top: 1px solid var(--border); background: var(--bg);
}
.input {
  flex: 1; padding: 10px 12px; border: 1px solid var(--btn-border); border-radius: 10px; resize: none; background: var(--btn-bg); color: var(--text);
}
.send-btn { padding: 10px 16px; border-radius: 10px; border: 1px solid var(--btn-border); background: var(--btn-bg); cursor: pointer; color: var(--text); }
.send-btn:hover { background: var(--hover); }
.send-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.loading { display: inline-flex; align-items: center; gap: 6px; }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Markdown 基础样式（仅用于 AI 文本区域） */
.markdown p { margin: 0 0 8px; }
.markdown ul, .markdown ol { margin: 0 0 8px; padding-left: 1.25em; }
.markdown li { margin: 4px 0; }
.markdown a { color: var(--primary); text-decoration: underline; }
.markdown blockquote {
  margin: 0 0 8px; padding-left: 10px; border-left: 3px solid var(--btn-border);
  color: var(--muted);
}
.markdown code {
  background: var(--btn-bg); border: 1px solid var(--btn-border); border-radius: 6px;
  padding: 2px 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.92em;
}
.markdown pre {
  background: var(--btn-bg); border: 1px solid var(--btn-border); border-radius: 8px;
  padding: 10px; overflow: auto; margin: 0 0 10px;
}
.markdown pre code { border: none; padding: 0; background: transparent; font-size: 0.9em; display: block; }

/* 代码块样式 */
.markdown .code-block {
  position: relative;
  margin: 0 0 10px;
  border-radius: 8px;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  overflow: hidden;
}

/* 代码块头部 */
.markdown .code-block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--hover);
  border-bottom: 1px solid var(--btn-border);
}

/* 代码语言显示 */
.markdown .code-language {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
}

/* 代码块按钮通用样式 */
.markdown .code-toggle-btn,
.markdown .code-view-btn,
.markdown .code-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  padding: 0;
}

.markdown .code-toggle-btn:hover,
.markdown .code-view-btn:hover,
.markdown .code-copy-btn:hover {
  background: var(--bg);
  opacity: 1;
}

/* 代码块按钮定位 */
.markdown .code-toggle-btn,
.markdown .code-view-btn,
.markdown .code-copy-btn {
  position: static;
  opacity: 1;
  margin-left: auto;
}

/* 代码内容区域 */
.markdown .code-content {
  max-height: 200px;
  overflow: hidden;
  transition: max-height 0.3s ease-in-out;
}

/* 展开状态 */
.markdown .code-block.expanded .code-content {
  max-height: 2000px;
}

/* 折叠/展开按钮旋转动画 */
.markdown .code-toggle-btn svg {
  transition: transform 0.3s ease-in-out;
}

.markdown .code-block.expanded .code-toggle-btn svg {
  transform: rotate(180deg);
}

/* 代码预览面板 */
.code-preview {
  width: 50%;
  height: 100%;
  background: var(--bg);
  border-left: 1px solid var(--border);
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  animation: slideInRight 0.3s ease-in-out;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

/* 预览面板头部 */
.preview-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--hover);
  border-bottom: 1px solid var(--btn-border);
  flex-shrink: 0;
}

.preview-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.preview-language {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  margin-right: auto;
}

/* 预览模式切换按钮 */
.preview-mode-toggle {
  display: flex;
  gap: 4px;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  border-radius: 6px;
  padding: 2px;
}

.mode-btn {
  padding: 4px 12px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s ease-in-out;
}

.mode-btn.active {
  background: var(--primary);
  color: white;
}

.mode-btn:hover {
  background: var(--hover);
}

.mode-btn.active:hover {
  background: var(--primary);
}

.preview-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  padding: 0;
  margin-left: auto;
}

.preview-close-btn:hover {
  background: var(--btn-bg);
}

/* 预览面板内容 */
.preview-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
  background: var(--bg);
}

/* 预览代码块 */
.preview-code {
  margin: 0;
  padding: 20px;
  border-radius: 8px;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  overflow: auto;
  font-size: 0.9em;
}

.preview-code code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

/* HTML预览区域 */
.html-preview {
  margin: 0;
  padding: 20px;
  border-radius: 8px;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  overflow: auto;
  font-size: 0.9em;
  color: var(--text);
}

/* HTML预览区域的基本样式重置 */
.html-preview * {
  box-sizing: border-box;
}

.html-preview body {
  margin: 0;
  padding: 0;
  background: transparent;
  color: var(--text);
}

.html-preview h1, .html-preview h2, .html-preview h3, .html-preview h4, .html-preview h5, .html-preview h6 {
  margin: 1em 0 0.5em;
  color: var(--text);
}

.html-preview p {
  margin: 0.5em 0;
}

.html-preview a {
  color: var(--primary);
  text-decoration: underline;
}

.html-preview img {
  max-width: 100%;
  height: auto;
}

.html-preview code {
  background: var(--hover);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

.html-preview pre {
  background: var(--subtle);
  padding: 12px;
  border-radius: 6px;
  overflow: auto;
}

.html-preview pre code {
  background: transparent;
  padding: 0;
}

.html-preview table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.html-preview th, .html-preview td {
  border: 1px solid var(--border);
  padding: 6px 12px;
  text-align: left;
}

.html-preview th {
  background: var(--hover);
  font-weight: 600;
}

.html-preview ul, .html-preview ol {
  padding-left: 24px;
  margin: 1em 0;
}

.html-preview li {
  margin: 0.25em 0;
}

.html-preview blockquote {
  border-left: 3px solid var(--border);
  padding-left: 12px;
  margin: 1em 0;
  color: var(--muted);
}

.html-preview hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1em 0;
}

/* 表格线条样式 */
.markdown table { width: 100%; border-collapse: collapse; margin: 8px 0; }
.markdown th, .markdown td { border: 1px solid var(--btn-border); padding: 6px 8px; }
.markdown thead th { background: var(--hover); }

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

/* 复制提示样式 */
.toast-layer { position: fixed; top: 20px; right: 20px; z-index: 40; pointer-events: none; }
.toast { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px; background: var(--modal-bg); border: 1px solid var(--btn-border); color: var(--text); box-shadow: var(--shadow); }

/* 编辑弹窗输入框及主按钮样式 */
.edit-input { width: 100%; min-height: 120px; resize: vertical; padding: 10px 12px; border: 1px solid var(--btn-border); border-radius: 10px; background: var(--btn-bg); color: var(--text); }
.btn.primary { background: var(--primary); color: #fff; border-color: var(--primary); }
.btn.primary:hover { filter: brightness(1.05); }
</style>