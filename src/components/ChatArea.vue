<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { chatStore } from '../store/chat'
import { toastStore } from '../store/toast'
import { authState } from '../store/auth'
import { syncWithCloud, syncState } from '../store/sync'
import { reply as aiReply, replyStream, replyConversation, type ConversationMessage } from '../api/openai'
import { themeStore } from '../store/theme'
import { modelConfig, getModelsByGroup, setSelectedModel } from '../store/modelConfig'
import hljs from 'highlight.js'

import { renderMarkdown } from '../utils/markdown'
import { countTokens } from '../utils/token'
import { parseMessageContent } from '../utils/thinkParser'
import ThinkingBlock from './ThinkingBlock.vue'

const props = defineProps<{ sidebarOpen: boolean; toggleSidebar: () => void; isMobile: boolean; onMenuHover?: (v: boolean) => void }>()
// 通过计算属性引用 props，避免某些场景下直接访问 props 导致渲染不更新
const isOpen = computed(() => !!props.sidebarOpen)

const activeChat = computed(() => chatStore.getActiveChat())

const inputText = ref('')
const messagesEl = ref<HTMLDivElement | null>(null)
const themeMode = computed(() => themeStore.mode.value)
const isGenerating = ref(false)
const showScrollToBottomBtn = ref(false) // 控制回到底部按钮显示

// 输入框高度控制
const inputRef = ref<HTMLTextAreaElement | null>(null)
const isInputExpanded = ref(false)
const showExpandBtn = ref(false)

function adjustInputHeight() {
  const el = inputRef.value
  if (!el) return
  // 重置高度以获得正确的 scrollHeight
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
  
  // 当内容高度超过默认最大高度(约190px，留点余量)或当前已展开时，显示按钮
  // 默认最大高度是 css 中设定的 200px
  if (el.scrollHeight > 190 || isInputExpanded.value) {
    showExpandBtn.value = true
  } else {
    showExpandBtn.value = false
  }
}

function toggleInputExpand() {
  isInputExpanded.value = !isInputExpanded.value
  nextTick(adjustInputHeight)
}

// 监听输入内容变化，自动调整高度
watch(inputText, () => {
  nextTick(adjustInputHeight)
})

// 代码块预览状态管理
const isPreviewOpen = ref(false)
const previewWidth = ref(66) // 预览窗口宽度百分比
const isResizing = ref(false)
const isMobilePreview = ref(false)

// 切换手机/桌面预览模式
function toggleMobilePreview() {
  isMobilePreview.value = !isMobilePreview.value
  // 自动调整预览区域宽度
  if (isMobilePreview.value) {
    // 手机模式下，根据当前屏幕宽度估算一个合适的百分比，或者直接固定一个稍窄的百分比
    // 例如 45% (取决于屏幕宽度，但在大多数桌面屏上45%足够容纳手机框)
    previewWidth.value = 45
  } else {
    // 恢复到默认较宽状态
    previewWidth.value = 66
  }
}

const previewCodeId = ref<string | null>(null)
const previewCodeContent = ref<string>('')
const previewCodeLanguage = ref<string>('')
const previewMode = ref<'code' | 'preview'>('code')
const previewErrors = ref<string[]>([]) // 预览错误日志
const showConsole = ref(false) // 是否显示控制台

// 清空错误日志当预览内容变化
watch(previewCodeContent, () => {
  previewErrors.value = []
  showConsole.value = false
})

// 监听 iframe 传来的错误信息
onMounted(() => {
  window.addEventListener('message', handleIframeMessage)
})
onUnmounted(() => {
  window.removeEventListener('message', handleIframeMessage)
})

function handleIframeMessage(event: MessageEvent) {
  if (event.data && event.data.type === 'preview-console-error') {
    // 避免重复错误刷屏
    const err = String(event.data.data)
    if (!previewErrors.value.includes(err)) {
      previewErrors.value.push(err)
      showConsole.value = true // 收到错误自动展开控制台
    }
  }
}

// 插入错误到输入框
function insertErrorToInput(err: string) {
  const text = `I encountered an error running the code:\n\`\`\`\n${err}\n\`\`\`\nPlease fix it.`
  if (inputText.value) {
    inputText.value += '\n' + text
  } else {
    inputText.value = text
  }
}

// 切换对话时自动关闭预览
watch(() => activeChat.value?.id, () => {
  isPreviewOpen.value = false
})

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

// 构建 React 预览 HTML
function constructReactPreview(code: string) {
  // 简单的 React 模板，使用 jsdelivr CDN
  // 移除 import 语句，移除 export default
  
  let processedCode = code
    .replace(/^\s*import\s+.*?[\r\n]+/gm, '') // 移除 import
    .replace(/^\s*export\s+default\s+function\s+(\w+)/m, 'function $1')
    .replace(/^\s*export\s+default\s+function\s*\(/m, 'function App(')
    .replace(/^\s*export\s+default\s+class\s+(\w+)/m, 'class $1')
    .replace(/^\s*export\s+default\s+/m, '// export default ')

  // 尝试检测组件名称
  let componentName = 'App'
  const match = code.match(/export\s+default\s+(?:function|class)?\s*(\w+)/)
  if (match && match[1]) {
    componentName = match[1]
  }

  // 如果没有渲染逻辑，添加渲染逻辑
  if (!processedCode.includes('ReactDOM.createRoot') && !processedCode.includes('ReactDOM.render')) {
      processedCode += `
      const root = ReactDOM.createRoot(document.getElementById('root'));
      if (typeof ${componentName} !== 'undefined') {
        root.render(<${componentName} />);
      } else {
        document.getElementById('root').innerHTML = '<div style="padding: 20px; color: #666;">无法自动检测入口组件。请确保组件名为 App 或包含 export default。</div>';
      }
      `
  }

  // 注入错误捕获脚本
  const errorScript = `
    <script>
      (function() {
        function sendError(msg) {
          window.parent.postMessage({ type: 'preview-console-error', data: msg }, '*');
        }
        window.onerror = function(msg, url, line, col, error) {
          sendError('Error: ' + msg);
          return false;
        };
        window.addEventListener('unhandledrejection', function(event) {
          sendError('Unhandled Promise Rejection: ' + event.reason);
        });
        const originalConsoleError = console.error;
        console.error = function(...args) {
          sendError('Console Error: ' + args.join(' '));
          originalConsoleError.apply(console, args);
        };
      })();
    <\/script>
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.development.js" crossorigin><\/script>
  <script src="https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.development.js" crossorigin><\/script>
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.23.6/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    #root { height: 100vh; overflow: auto; }
  <\/style>
  ${errorScript}
<\/head>
<body>
  <div id="root"><\/div>
  <script type="text/babel" data-presets="env,react">
    try {
      const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext } = React;
      ${processedCode}
    } catch (err) {
      console.error(err);
      document.getElementById('root').innerHTML = '<div style="color:red; padding: 20px;">' + err.toString() + '</div>';
    }
  <\/script>
<\/body>
<\/html>`
}

// 检测代码是否包含 HTML 标签
function isHtmlCode(code: string, language: string): boolean {
  const lang = (language || '').toLowerCase()
  if (['html', 'jsx', 'react'].includes(lang)) {
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

function refreshPreview() {
  const iframe = document.querySelector('.preview-iframe') as HTMLIFrameElement | null
  if (iframe) {
    // 重新赋值 srcdoc 以刷新
    const content = iframe.srcdoc
    iframe.srcdoc = ''
    setTimeout(() => {
      iframe.srcdoc = content
    }, 10)
  }
}

function downloadHtml() {
  const blob = new Blob([previewCodeContent.value], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'preview.html'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  showToast('已开始下载')
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
function showToast(msg: string) {
  toastStore.success(msg)
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

// 同步相关
const isAuthenticated = computed(() => authState.value.isAuthenticated)
const isSyncing = computed(() => syncState.value.status === 'syncing')

async function handleSync() {
  if (isSyncing.value) return
  await syncWithCloud()
  if (syncState.value.status === 'success') {
    toastStore.success('同步成功')
  } else if (syncState.value.status === 'failed') {
    toastStore.error('同步失败：' + (syncState.value.error || '未知错误'))
  }
}

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
  
  // 重置预览相关状态（如果是新消息）
  // 注意：如果是 resend 或 applyEditAndResend，可能需要保留之前的状态？
  // 暂时每次生成都重新检测
  
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
    
    // 实时检测 HTML 代码块并自动开启预览（仅代码模式）
    detectAndStreamPreview(target.content)
    
    scrollToBottom()
  })
    .then(() => {
      // 流式完成，如果开启了预览且内容是HTML，自动切换到预览模式
      if (isPreviewOpen.value && isHtmlCode(previewCodeContent.value, previewCodeLanguage.value)) {
        previewMode.value = 'preview'
      }
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

// 检测并流式更新预览内容
function detectAndStreamPreview(fullContent: string) {
  // 简单的正则匹配最后一个 HTML 代码块
  // 支持 html, xml, svg, vue, jsx, react
  const codeBlockRegex = /```(html|xml|svg|vue|jsx|react)\s*([\s\S]*?)(?:```|$)/gi
  let match
  let lastMatch = null
  
  // 找到最后一个匹配的代码块
  while ((match = codeBlockRegex.exec(fullContent)) !== null) {
    lastMatch = match
  }
  
  if (lastMatch) {
    const lang = (lastMatch[1] || '').toLowerCase()
    const content = lastMatch[2] || '' // 不trim，保留格式
    
    // 如果还没打开预览，或者正在预览但不是当前这个（简单判断内容长度增长）
    if (!isPreviewOpen.value) {
      isPreviewOpen.value = true
      previewMode.value = 'code' // 强制代码模式
    }
    
    // 强制更新为代码模式，禁用预览渲染
    if (previewMode.value !== 'code') {
      previewMode.value = 'code'
    }
    
    previewCodeLanguage.value = lang
    previewCodeContent.value = content
  }
}

// 处理预览内容，确保包含 viewport meta 标签以支持响应式
const finalPreviewContent = computed(() => {
  let content = previewCodeContent.value
  const lang = (previewCodeLanguage.value || '').toLowerCase()
  if (!content) return ''

  // JSX/React 预览
  if (['jsx', 'react'].includes(lang)) {
    return constructReactPreview(content)
  }
  
  // 仅在预览模式且为 HTML 时注入 viewport
  if (isHtmlCode(content, previewCodeLanguage.value)) {
    // 检查是否已有 viewport
    if (!/meta\s+name=["']viewport["']/i.test(content)) {
      const viewportTag = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">'
      if (/<head>/i.test(content)) {
        content = content.replace(/<head>/i, `<head>${viewportTag}`)
      } else if (/<html>/i.test(content)) {
        content = content.replace(/<html>/i, `<html><head>${viewportTag}</head>`)
      } else {
        // 片段或无结构 HTML，直接拼在前面
        content = viewportTag + content
      }
    }
    
    // 注入简单的样式重置，确保 iframe 中无默认边距干扰全屏效果
    let resetStyle = 'body { margin: 0; padding: 0; }'
    
    // 如果是手机模拟模式，隐藏滚动条以获得更像原生 App 的体验
    if (isMobilePreview.value) {
      resetStyle += `
        ::-webkit-scrollbar { display: none; }
        html, body { scrollbar-width: none; -ms-overflow-style: none; }
      `
    }
    
    const styleTag = `<style>${resetStyle}</style>`
    
    if (!content.includes('body { margin: 0')) {
       if (/<\/head>/i.test(content)) {
         content = content.replace(/<\/head>/i, `${styleTag}</head>`)
       } else {
         content = styleTag + content
       }
    }
  }
  return content
})

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
      const cur2 = chatStore.getActiveChat(); if (!cur2) return
      const nm = cur2.messages[aiIndexNew]
      if (!nm) return
      nm.content += delta
      nm.timestamp = Date.now()
      
      // 实时检测 HTML 代码块并自动开启预览（仅代码模式）
      detectAndStreamPreview(nm.content)
      
      scrollToBottom()
    })

    // 流式完成，如果开启了预览且内容是HTML，自动切换到预览模式
    if (isPreviewOpen.value && isHtmlCode(previewCodeContent.value, previewCodeLanguage.value)) {
      previewMode.value = 'preview'
    }

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
      
      // 实时检测 HTML 代码块并自动开启预览（仅代码模式）
      detectAndStreamPreview(nm.content)
      
      scrollToBottom()
    })

    // 流式完成，如果开启了预览且内容是HTML，自动切换到预览模式
    if (isPreviewOpen.value && isHtmlCode(previewCodeContent.value, previewCodeLanguage.value)) {
      previewMode.value = 'preview'
    }

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
      // 如果预览打开，且该代码块正是正在预览的内容，则禁止展开
      if (isPreviewOpen.value) {
        const codeEl = wrapper.querySelector('pre > code')
        const codeText = codeEl?.textContent || ''
        // 简单比对内容长度或前100字符，避免大文本完全比对性能损耗，或者直接比对
        // 考虑到这里是点击事件，完全比对应该没问题
        if (codeText === previewCodeContent.value) {
           showToast('预览模式下该代码块保持折叠')
           return
        }
      }
      wrapper.classList.toggle('collapsed')
      // 更新按钮图标或提示（如果需要动态改变SVG，可以在这里做，或者CSS控制）
    }
    return
  }
}

// 首次进入主页时显示“新对话”状态


const messageTokenStats = computed(() => {
  const msgs = activeChat.value?.messages
  if (!msgs) return []
  
  let runningTotal = 0
  return msgs.map(m => {
    const t = countTokens(m.content)
    // Context tokens before this message (Input)
    // For the first message, input is 0. 
    // For subsequent, it's sum of previous messages + 3 (reply prime overhead)
    const input = runningTotal > 0 ? runningTotal + 3 : 0
    
    // Update running total for next iteration (each msg adds 4 + content)
    runningTotal += (4 + t)
    
    return {
      input,
      output: t
    }
  })
})

// 滚动监听处理函数
function handleScroll() {
  const container = messagesEl.value
  if (!container) return
  
  // 计算滚动位置：当距离底部超过一定距离（比如100px）时显示按钮
  const scrollThreshold = 100
  const isScrolledUp = container.scrollHeight - container.scrollTop - container.clientHeight > scrollThreshold
  showScrollToBottomBtn.value = isScrolledUp
}

onMounted(() => {
  chatStore.startDraft()
  // 绑定点击事件，用于复制代码块
  try { messagesEl.value?.addEventListener('click', onMessageClick) } catch (_) {}
  // 添加滚动监听，控制回到底部按钮显示
  try { messagesEl.value?.addEventListener('scroll', handleScroll) } catch (_) {}
})

onUnmounted(() => {
  try { messagesEl.value?.removeEventListener('click', onMessageClick) } catch (_) {}
  // 移除滚动监听
  try { messagesEl.value?.removeEventListener('scroll', handleScroll) } catch (_) {}
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
        <button v-if="activeChat && activeChat.messages.length > 0" class="new-chat-btn" title="开启新对话" @click="chatStore.startDraft()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="model-btn" :title="selectedLabel" @click.stop="openModelSelector">
          {{ selectedLabel }}
        </button>
        <div class="spacer"></div>
        <button v-if="isAuthenticated" class="sync-btn" :class="{ spinning: isSyncing }" :title="isSyncing ? '同步中...' : '立即同步'" @click="handleSync">
          <svg v-if="!isSyncing" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.5 19c2.485 0 4.5-2.015 4.5-4.5s-2.015-4.5-4.5-4.5c-.4 0-.77.08-1.12.23C15.6 7.4 13.5 5.5 11 5.5c-2.76 0-5 2.24-5 5 0 .2.02.4.05.6C3.58 11.55 1.5 13.55 1.5 16c0 2.485 2.015 4.5 4.5 4.5h11.5z"></path>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
        </button>
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
          <div v-if="!activeChat || activeChat.messages.length === 0" class="empty-container">
            <div class="empty-content">
              <h2>有什么可以帮忙的？</h2>
            </div>
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
                <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                  <ThinkingBlock 
                    v-if="parseMessageContent(m.content).reasoning"
                    :content="parseMessageContent(m.content).reasoning"
                    :is-thinking="parseMessageContent(m.content).isThinking"
                    :time="parseMessageContent(m.content).thinkTime"
                  />
                  <div 
                    class="text markdown" 
                    :class="{ 
                      'streaming-message': isGenerating && i === activeChat.messages.length - 1,
                      'preview-source-message': isPreviewOpen && m.content.includes(previewCodeContent) && previewCodeContent.length > 0
                    }"
                    v-html="renderMarkdown(parseMessageContent(m.content).content)"
                  ></div>
                </div>
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
                  <span class="token-info ai-token-info" v-if="messageTokenStats[i]" title="Input tokens / Output tokens">
                    {{ messageTokenStats[i].input }} input, {{ messageTokenStats[i].output }} output
                  </span>
                </div>
              </template>
            </div>
          </div>
      </div>
      </div>

      <!-- 回到底部按钮 -->
      <button 
        class="scroll-to-bottom-btn"
        :class="{ 'visible': showScrollToBottomBtn }"
        @click="scrollToBottom"
        title="回到底部"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 13L12 18L17 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 18V6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <footer 
        class="inputbar" 
        :class="{ 
          'centered': !activeChat || activeChat.messages.length === 0,
          'expanded-mode': isInputExpanded 
        }"
      >
        <textarea
          ref="inputRef"
          v-model="inputText"
          class="input"
          placeholder="输入消息..."
          rows="1"
          @keydown.enter.exact.prevent="!isGenerating && sendMessage()"
          :style="{ maxHeight: isInputExpanded ? '60vh' : '200px' }"
        ></textarea>
        
        <transition name="fade">
          <button 
            v-show="showExpandBtn"
            class="expand-btn" 
            @click="toggleInputExpand"
            :title="isInputExpanded ? '收起' : '展开'"
          >
            <svg v-if="!isInputExpanded" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
               <path d="M7 11L12 6L17 11M7 17L12 12L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 7L12 12L17 7M7 13L12 18L17 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </transition>

        <transition name="scale-fade">
          <button v-show="inputText.trim().length > 0 || isGenerating" class="send-btn" :disabled="isGenerating" @click="sendMessage">
            <svg v-if="!isGenerating" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div v-else class="loading-spinner"></div>
          </button>
        </transition>
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
            :disabled="isGenerating"
            :title="isGenerating ? '流式输出时禁用预览' : ''"
          >
            预览
          </button>
        </div>
        
        <!-- 手机/PC 切换按钮 (仅非响应式/桌面端显示) -->
        <div v-if="previewMode === 'preview' && !isMobile" class="preview-mode-toggle" style="margin-left: 12px">
           <button 
            class="mode-btn" 
            :class="{ active: !isMobilePreview }" 
            @click="isMobilePreview = false; previewWidth = 66"
            title="桌面视图"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </button>
          <button 
            class="mode-btn" 
            :class="{ active: isMobilePreview }" 
            @click="toggleMobilePreview"
            title="手机视图 (iPhone 16 Pro)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
              <line x1="12" y1="18" x2="12" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- 操作按钮组 -->
        <div class="preview-actions-group">
          <button 
            v-if="previewMode === 'preview'" 
            class="action-btn" 
            :class="{ active: showConsole }"
            @click="showConsole = !showConsole" 
            title="控制台"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="4" y="17" width="16" height="2" rx="1"></rect>
              <path d="M4 6l6 0M4 11l8 0" stroke-linecap="round"></path>
            </svg>
          </button>
          <button v-if="previewMode === 'preview'" class="action-btn" @click="refreshPreview" title="刷新">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6M1 20v-6h6" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="action-btn" @click="copy(previewCodeContent)" title="复制">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="action-btn" @click="downloadHtml" title="下载">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
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
        <div v-else class="preview-wrapper">
          <div class="preview-container" :class="{ 'mobile-mode': isMobilePreview }">
            <div class="iframe-wrapper">
              <!-- 灵动岛 (仅手机模式显示) -->
              <div v-if="isMobilePreview" class="dynamic-island">
                <div class="camera"></div>
              </div>
              
              <iframe 
                class="preview-iframe" 
                sandbox="allow-scripts" 
                :srcdoc="finalPreviewContent"
              ></iframe>
            </div>
          </div>

          <!-- 错误控制台 -->
          <transition name="slide-up">
            <div v-show="showConsole" class="console-panel">
              <div class="console-header">
                <span class="console-title">Console ({{ previewErrors.length }})</span>
                <div class="console-actions">
                  <button class="console-btn" @click="insertErrorToInput(previewErrors.join('\n'))" title="Insert Error to Input">
                    Fix
                  </button>
                  <button class="console-btn icon" @click="copy(previewErrors.join('\n'))" title="Copy Errors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                  <button class="console-btn icon" @click="showConsole = false" title="Close">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="console-content">
                <div v-if="previewErrors.length === 0" class="console-item info">No errors detected.</div>
                <div v-for="(err, index) in previewErrors" :key="index" class="console-item error">
                  {{ err }}
                </div>
              </div>
            </div>
          </transition>
        </div>
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
  background: transparent;
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
  background: transparent;
}

/* 顶部栏 - 悬浮玻璃态 */
.topbar {
  position: absolute; top: 0; left: 0; right: 0; z-index: 10;
  display: flex; align-items: center; gap: 12px;
  height: 64px; 
  padding: 0 24px; 
  color: var(--text);
  background: var(--bg-header);
  backdrop-filter: var(--blur-md);
  -webkit-backdrop-filter: var(--blur-md);
  border-bottom: 1px solid var(--border);
  animation: slideDown 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  animation-delay: 0.1s;
}

@keyframes slideDown {
  from { transform: translateY(-40px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
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

.menu-btn, .theme-btn, .sync-btn { 
  border: none; background: transparent; cursor: pointer; padding: 0; 
  border-radius: var(--radius-full); 
  width: 40px; height: 40px; 
  display: inline-flex; align-items: center; justify-content: center; 
  color: var(--muted); 
  transition: all 0.2s;
}
.menu-btn:hover, .theme-btn:hover, .sync-btn:not(.spinning):hover, .new-chat-btn:hover { background: var(--hover); color: var(--text); transform: rotate(15deg); }
.sync-btn.spinning { cursor: not-allowed; opacity: 0.8; }
.sync-btn.spinning svg { animation: spin 1s linear infinite; }

.new-chat-btn {
  border: none; background: transparent; cursor: pointer; padding: 0;
  border-radius: var(--radius-full);
  width: 40px; height: 40px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--muted);
  transition: all 0.2s;
}

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.spacer { flex: 1; }

/* 消息滚动区 */
.scroll { 
  flex: 1; overflow-y: auto; overflow-x: hidden; 
  padding-top: 80px; /* Topbar height + spacing */
  padding-bottom: 120px; /* Inputbar height + spacing */
  scroll-behavior: smooth;
}
.messages { padding: 0 24px; max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 32px; }



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
  background: var(--bubble-user-bg);
  color: var(--bubble-user-text);
  box-shadow: var(--shadow-md);
  text-align: left;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 15px;
  line-height: 1.7;
}

.msg.ai .text { 
  max-width: 100%; 
  padding: 0 12px;
  font-size: 16px;
  line-height: 1.85;
  color: var(--text);
}

/* 行内操作栏 */
.inline-actions { margin-top: 6px; display: flex; gap: 6px; opacity: 0; transition: all 0.2s; transform: translateY(-5px); }
.bubble-wrap:hover .inline-actions { opacity: 1; transform: translateY(0); }

.actions { 
  display: flex; 
  align-items: center; /* Ensure vertical alignment */
  gap: 8px; 
  margin-top: 8px; 
  opacity: 1; /* Always visible */
  transition: all 0.2s; 
  padding-left: 12px; 
}
/* Removed .msg.ai:hover .actions { opacity: 1; } since it is always visible now */

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
  /* Removed margins to let flex gap handle spacing */
  font-size: 11px; color: var(--muted);
  background: var(--panel); border: 1px solid var(--border);
  padding: 0 8px; /* Adjusted padding for height consistency */
  border-radius: var(--radius-sm);
  height: 22px;
  display: inline-flex;
  align-items: center;
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
  border-radius: 28px;
  box-shadow: var(--shadow-float);
  backdrop-filter: var(--blur-lg);
  -webkit-backdrop-filter: var(--blur-lg);
  transition: all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
  animation: slideUpNormal 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  animation-delay: 0.1s;
}

.inputbar.centered {
  bottom: 50%;
  transform: translate(-50%, 50%);
  width: min(640px, calc(100% - 48px));
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  border-color: var(--border);
  animation: slideUpCentered 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  animation-delay: 0.1s;
}

.inputbar.expanded-mode {
  max-width: 1200px; /* 扩展模式下更宽 */
}

@keyframes slideUpNormal {
  from { transform: translateX(-50%) translateY(40px); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}

@keyframes slideUpCentered {
  from { transform: translate(-50%, 100px); opacity: 0; }
  to { transform: translate(-50%, 50%); opacity: 1; }
}

.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.empty-content {
  width: min(640px, calc(100% - 48px));
  text-align: left;
  margin-bottom: 180px; /* Space for the centered input bar */
  padding-left: 20px;
  animation: fadeInScale 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  animation-delay: 0.2s;
}

@keyframes fadeInScale {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.empty-content h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  opacity: 0.8;
  letter-spacing: -0.02em;
}

.inputbar:not(.centered):focus-within {
  border-color: var(--primary);
  box-shadow: var(--shadow-xl);
  transform: translateX(-50%) translateY(-2px);
}

.input {
  flex: 1; padding: 10px 12px; border: none; 
  border-radius: 0; resize: none; 
  background: transparent; color: var(--text);
  font-size: 16px; line-height: 1.5;
  max-height: 200px; outline: none;
}
.input::placeholder { color: var(--muted); opacity: 0.7; }

.expand-btn {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
  margin-bottom: 5px; /* 微调以对齐单行输入框 */
}
.expand-btn:hover { background: var(--hover); color: var(--text); transform: scale(1.1); }

.send-btn { 
  width: 42px; height: 42px; 
  border-radius: 50%; 
  border: none; 
  background: var(--primary); 
  color: #fff; 
  cursor: pointer; 
  display: flex; align-items: center; justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  box-shadow: var(--shadow-md);
  padding: 0;
}
.send-btn:hover { transform: scale(1.1); box-shadow: var(--shadow-lg); }
.send-btn:disabled { opacity: 0.7; cursor: not-allowed; transform: none; box-shadow: none; background: var(--muted); }

.loading-spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.scale-fade-enter-active, .scale-fade-leave-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.scale-fade-enter-from, .scale-fade-leave-to { opacity: 0; transform: scale(0.5); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

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

@media (max-width: 768px) {
  .code-preview {
    position: fixed;
    top: 0;
    left: 0;
    width: 100% !important;
    height: 100%;
    z-index: 200;
  }
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
  padding: 2px 6px; border-radius: 4px;
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

.preview-actions-group {
  display: flex; gap: 4px; margin-left: auto;
}
.action-btn {
  padding: 6px; border: none; background: transparent;
  border-radius: 6px; color: var(--muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.action-btn:hover { background: var(--hover); color: var(--text); }

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

/* 预览区域内容容器 */
.preview-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  overflow: hidden;
}

/* iframe 包装器 */
.iframe-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

/* 手机模式下的样式 (模拟 iPhone 16 Pro) */
.preview-container.mobile-mode {
  padding: 40px;
  background: var(--panel); /* 稍深的背景以突出手机框 */
}

.preview-container.mobile-mode .iframe-wrapper {
  width: 402px; /* iPhone 16 Pro viewport width */
  height: 874px; /* iPhone 16 Pro viewport height */
  max-height: 90vh; /* 防止超出屏幕 */
  border: 12px solid #1f1f1f; /* 边框/黑边 */
  border-radius: 56px; /* 外圆角 */
  box-shadow: 
    0 0 0 2px #333, /* 外边框细节 */
    0 20px 40px rgba(0,0,0,0.4); /* 阴影 */
  overflow: hidden;
  background: #000;
  flex-shrink: 0;
}

/* 手机模式下的 iframe */
.preview-container.mobile-mode .preview-iframe {
  border-radius: 44px; /* 内圆角 */
  background: #fff;
  width: 100%;
  height: 100%;
}

/* 灵动岛 */
.dynamic-island {
  position: absolute;
  top: 11px;
  left: 50%;
  transform: translateX(-50%);
  width: 120px;
  height: 35px;
  background: #000;
  border-radius: 20px;
  z-index: 100;
  pointer-events: none;
  transition: all 0.3s;
}

/* 模态框通用 - 玻璃拟态重构 */
.modal-mask { 
  position: fixed; inset: 0; 
  background: var(--mask); 
  display: flex; align-items: center; justify-content: center; 
  z-index: 100;
  backdrop-filter: var(--blur-sm);
  -webkit-backdrop-filter: var(--blur-sm);
  animation: fadeIn 0.3s ease;
}

.modal { 
  width: min(90vw, 520px); 
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-xl); 
  box-shadow: var(--shadow-float);
  overflow: hidden; 
  display: flex; flex-direction: column;
  animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 80vh;
}
@keyframes modalPop {
  from { opacity: 0; transform: scale(0.9) translateY(20px); filter: blur(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
}

.modal-title { 
  font-weight: 600; font-size: 18px; 
  padding: 24px; 
  border-bottom: 1px solid var(--border); 
  color: var(--text); 
  background: transparent;
}
.modal-body { padding: 24px; overflow-y: auto; color: var(--text); background: transparent; }
.modal-actions { 
  display: flex; justify-content: flex-end; gap: 12px; 
  padding: 24px; 
  border-top: 1px solid var(--border); 
  background: rgba(0,0,0,0.02);
}

/* 回到底部按钮 */
.scroll-to-bottom-btn {
  position: absolute;
  bottom: 120px; /* 输入框上方一点点 */
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.8); /* 白色半透明 */
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  opacity: 0;
  visibility: hidden;
  z-index: 15;
  box-shadow: var(--shadow-md);
  backdrop-filter: var(--blur-sm);
  -webkit-backdrop-filter: var(--blur-sm);
}

.scroll-to-bottom-btn.visible {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}

.scroll-to-bottom-btn:hover {
  background: rgba(255, 255, 255, 0.9); /* 悬停时更不透明 */
  transform: translateX(-50%) translateY(-2px) scale(1.05);
  box-shadow: var(--shadow-lg);
}

/* 深色主题适配 */
[data-theme="dark"] .scroll-to-bottom-btn {
  background: rgba(30, 30, 30, 0.8);
  color: #fff;
}

[data-theme="dark"] .scroll-to-bottom-btn:hover {
  background: rgba(40, 40, 40, 0.9);
}

/* 按钮通用 */
.btn { 
  padding: 10px 20px; border-radius: var(--radius-lg); 
  border: 1px solid var(--border); background: var(--bg); 
  cursor: pointer; color: var(--text); font-weight: 500;
  transition: all 0.2s;
}
.btn:hover { background: var(--hover); border-color: var(--text-tertiary); transform: translateY(-1px); }
.btn:active { transform: translateY(0); }

.btn.primary { 
  background: var(--primary); color: #fff; border-color: transparent; 
  box-shadow: var(--shadow-md);
}
.btn.primary:hover { background: var(--primary-hover); box-shadow: var(--shadow-lg); }

/* 模型选择列表 */
.group-list { display: flex; flex-direction: column; gap: 20px; }
.group-title { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; margin-bottom: 10px; padding-left: 4px; letter-spacing: 0.05em; }
.model-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.model-item { 
  padding: 12px; border-radius: var(--radius-md); 
  border: 1px solid var(--border); background: var(--bg-input); 
  cursor: pointer; color: var(--text); text-align: center;
  transition: all 0.2s; font-size: 14px;
  position: relative; overflow: hidden;
}
.model-item:hover { border-color: var(--primary); background: var(--hover); }
.model-item.active { background: var(--primary); color: #fff; border-color: transparent; box-shadow: var(--shadow-md); }

/* 编辑框 */
.edit-input { 
  width: 100%; min-height: 140px; 
  padding: 16px; border: 1px solid var(--border); 
  border-radius: var(--radius-md); background: var(--bg-input); 
  color: var(--text); font-size: 15px; resize: vertical; outline: none;
  transition: all 0.2s;
}
.edit-input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); background: var(--bg); }

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

/* 预览打开时（不仅仅是流式输出），对应的代码块（折叠状态）禁止展开，且禁用展开按钮 */
/* 使用 .preview-source-message 标识当前预览内容来源的消息 */
.preview-source-message .code-block.collapsed .code-toggle-btn {
  pointer-events: none;
  display: none;
  cursor: not-allowed;
}

/* 预览模式切换按钮禁用状态 */
.mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 暗黑模式微调 - 已移除，使用全局变量控制 */

.token-info {
  font-size: 11px;
  color: var(--muted);
  opacity: 1; /* Match model-info opacity */
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  user-select: text; /* Allow text selection */
  /* Removed monospace to match model-info */
}

.user-token-info {
  justify-content: flex-end;
  margin-right: 4px;
  opacity: 0.6; /* Slightly lighter for user tokens */
}

.ai-token-info {
  /* Removed margin-left to rely on gap */
  background: var(--panel);
  padding: 0 8px; /* Consistent padding */
  border-radius: var(--radius-sm); 
  border: 1px solid var(--border);
  height: 22px;
  display: inline-flex;
  align-items: center; /* Ensure vertical centering */
  /* Match model-info style exactly */
  font-size: 11px;
  color: var(--muted);
}

.divider {
  opacity: 0.5;
}

@media (max-width: 768px) {
  .topbar {
    padding: 0 12px;
    gap: 8px;
    height: 56px;
  }
  
  .model-btn {
    padding: 6px 10px;
    font-size: 12px;
    max-width: 120px;
  }
  
  .menu-btn, .new-chat-btn, .theme-btn, .sync-btn {
    width: 32px; height: 32px;
  }
  
  .spacer {
    display: none; /* remove spacer to let justify-content work if needed, or keep it */
    /* actually flex layout handles it. keep spacer but maybe reduce gap */
  }
  
  .messages {
    padding: 0 16px;
  }
  
  .bubble-wrap {
    max-width: 95%;
  }
  
  .inputbar {
    width: calc(100% - 24px);
    bottom: 16px;
    padding: 8px 12px;
  }
  
  .inputbar.centered {
    width: calc(100% - 32px);
  }
  
  .send-btn {
    width: 36px; height: 36px;
  }
}

/* Preview Console */
.preview-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative; /* Ensure absolute positioning works relative to this */
}

.preview-wrapper .preview-container {
  flex: 1;
  height: 100%; /* Take full height */
  min-height: 0;
}

.console-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  max-width: 600px; /* Limit width to make it look "floating" in the corner */
  height: 240px; /* Increased height */
  background: var(--panel);
  border-top: 1px solid var(--border);
  border-right: 1px solid var(--border);
  border-top-right-radius: 12px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 50;
  box-shadow: 4px -4px 20px rgba(0,0,0,0.15);
  backdrop-filter: blur(10px);
}

/* Mobile adaptation */
@media (max-width: 640px) {
  .console-panel {
    width: 100%;
    max-width: 100%;
    border-top-right-radius: 0;
    border-right: none;
  }
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
}

.console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}

.console-title {
  font-weight: 600;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
}
.console-title::before {
  content: '';
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}

.console-actions {
  display: flex;
  gap: 6px;
}

.console-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}
.console-btn.icon { padding: 4px; }
.console-btn:hover { background: var(--hover); color: var(--text); border-color: var(--muted); }

.console-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  color: #ef4444;
  background: var(--bg);
}

.console-item {
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
  word-break: break-all;
  line-height: 1.5;
}
.console-item.info { color: var(--muted); border-bottom: none; }
.console-item:last-child { border-bottom: none; }
</style>