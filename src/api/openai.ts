export interface OpenAIReplyOptions {
  model?: string
  groupId?: string
}

function stripTrailingSlashes(url: string): string {
  return (url || '').replace(/\/+$/, '')
}

// 检测并修复base url中"/chat/completions"端点的辅助函数
async function checkAndFixChatCompletionsEndpoint(baseUrl: string): Promise<string> {
  // 先尝试原始base url
  const originalUrl = `${baseUrl}/chat/completions`
  
  // 如果base url已经包含"/chat/completions"，尝试移除它
  if (baseUrl.includes('/chat/completions')) {
    const fixedUrl = `${baseUrl.replace('/chat/completions', '')}/chat/completions`
    return fixedUrl
  }
  
  // 检查是否需要添加"/v1"前缀
  if (!baseUrl.includes('/v1')) {
    const v1Url = `${baseUrl}/v1/chat/completions`
    return v1Url
  }
  
  return originalUrl
}

async function readError(resp: Response): Promise<string> {
  try {
    const text = await resp.text()
    try {
      const json = JSON.parse(text)
      return json.error?.message || json.message || text || `HTTP ${resp.status}`
    } catch {
      return text || `HTTP ${resp.status}`
    }
  } catch {
    return `HTTP ${resp.status}`
  }
}

function extractTextFromResponse(json: any): string {
  if (json && typeof json.output_text === 'string') return json.output_text
  const cm = json?.choices?.[0]?.message?.content
  if (typeof cm === 'string') return cm
  // Responses API output array
  if (Array.isArray(json?.output)) {
    const pieces: string[] = []
    for (const item of json.output) {
      const content = item?.content
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === 'string') pieces.push(c.text)
        }
      }
    }
    if (pieces.length) return pieces.join('\n')
  }
  // Fallbacks
  if (typeof json?.message?.content === 'string') return json.message.content
  return ''
}

export async function reply(message: string, options: OpenAIReplyOptions = {}): Promise<string> {
  const trimmed = (message || '').trim()
  if (!trimmed) throw new Error('请输入内容。')

  // Lazy import stores to avoid circular deps
  const { getGroupById, modelConfig } = await import('../store/modelConfig')

  const modelName = options.model || ''
  const groupId = options.groupId || (modelConfig.value?.models.find(m => m.id === modelConfig.value?.selectedModelId)?.groupId || '')
  const group = groupId ? getGroupById(groupId) : undefined
  const baseUrl = stripTrailingSlashes(group?.baseUrl || 'https://api.openai.com/v1')
  const apiKey = group?.apiKey || ''
  if (!apiKey) throw new Error('未配置 API Key，请在“模型配置”中填写。')
  const model = modelName || (modelConfig.value?.models.find(m => m.id === modelConfig.value?.selectedModelId)?.modelName || '')
  if (!model) throw new Error('未选择模型或模型名为空。')

  const sys = ''
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }

  // Prefer Responses API when available; fall back to Chat Completions
  const responsesBody = {
    model,
    input: [
      ...(sys ? [{ role: 'system', content: [{ type: 'input_text', text: sys }] }] : []),
      { role: 'user', content: [{ type: 'input_text', text: trimmed }] },
    ],
  }

  // Try Responses API
  try {
    const resp = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify(responsesBody),
    })
    if (!resp.ok) throw new Error(await readError(resp))
    const json = await resp.json()
    const text = extractTextFromResponse(json)
    if (text && text.trim()) return text
    // If empty, fall back to chat completions
  } catch (e) {
    // Continue to fallback
  }

  // Fallback: Chat Completions
  const messages: any[] = []
  if (sys) messages.push({ role: 'system', content: sys })
  messages.push({ role: 'user', content: trimmed })
  const chatBody = { model, messages }
  
  // 先尝试原始URL
  let resp2 = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(chatBody),
  })
  
  // 如果失败，尝试修复URL并重新请求
  if (!resp2.ok) {
    const fixedUrl = await checkAndFixChatCompletionsEndpoint(baseUrl)
    resp2 = await fetch(fixedUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(chatBody),
    })
    if (!resp2.ok) throw new Error(await readError(resp2))
  }
  
  const json2 = await resp2.json()
  const text2 = extractTextFromResponse(json2)
  if (text2 && text2.trim()) return text2
  // Final fallback: stringify minimal structure
  return typeof json2?.choices?.[0]?.message?.content === 'string' ? json2.choices[0].message.content : JSON.stringify(json2)
}

// 非流式：基于整段上下文的重试（优先 Responses，失败回退 Chat Completions）
export async function replyConversation(
  conversation: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: OpenAIReplyOptions = {},
): Promise<string> {
  const { getGroupById, modelConfig } = await import('../store/modelConfig')
  const groupId = options.groupId || (modelConfig.value?.models.find(m => m.id === modelConfig.value?.selectedModelId)?.groupId || '')
  const group = groupId ? getGroupById(groupId) : undefined
  const baseUrl = stripTrailingSlashes(group?.baseUrl || 'https://api.openai.com/v1')
  const apiKey = group?.apiKey || ''
  if (!apiKey) throw new Error('未配置 API Key，请在“模型配置”中填写。')
  const model = options.model || (modelConfig.value?.models.find(m => m.id === modelConfig.value?.selectedModelId)?.modelName || '')
  if (!model) throw new Error('未选择模型或模型名为空。')

  const sys = ''
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }

  // 1) 先尝试 Responses 非流式
  try {
    const input = [] as any[]
    if (sys) input.push({ role: 'system', content: [{ type: 'input_text', text: sys }] })
    for (const m of conversation) {
      input.push({ role: m.role, content: [{ type: 'input_text', text: m.content }] })
    }
    const body = { model, input }
    const resp = await fetch(`${baseUrl}/responses`, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!resp.ok) throw new Error(await readError(resp))
    const json = await resp.json()
    const text = extractTextFromResponse(json)
    if (text && text.trim()) return text
    throw new Error('Responses 返回内容为空')
  } catch (_) {
    // 继续回退到 Chat Completions
  }

  // 2) Chat Completions 非流式
  const messages: any[] = []
  if (sys) messages.push({ role: 'system', content: sys })
  for (const m of conversation) messages.push({ role: m.role === 'system' ? 'system' : (m.role === 'assistant' ? 'assistant' : 'user'), content: m.content })
  
  // 先尝试原始URL
  let resp2 = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify({ model, messages })
  })
  
  // 如果失败，尝试修复URL并重新请求
  if (!resp2.ok) {
    const fixedUrl = await checkAndFixChatCompletionsEndpoint(baseUrl)
    resp2 = await fetch(fixedUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages })
    })
    if (!resp2.ok) throw new Error(await readError(resp2))
  }
  
  const json2 = await resp2.json()
  const text2 = extractTextFromResponse(json2)
  if (text2 && text2.trim()) return text2
  return typeof json2?.choices?.[0]?.message?.content === 'string' ? json2.choices[0].message.content : JSON.stringify(json2)
}

export type ConversationMessage = { role: 'user' | 'assistant' | 'system'; content: string }

function toChatCompletionMessages(conv: ConversationMessage[], sys: string | null): any[] {
  const msgs: any[] = []
  if (sys && sys.trim()) msgs.push({ role: 'system', content: sys })
  for (const m of conv) {
    const role = m.role === 'system' ? 'system' : (m.role === 'assistant' ? 'assistant' : 'user')
    msgs.push({ role, content: m.content })
  }
  return msgs
}

function toResponsesInput(conv: ConversationMessage[], sys: string | null): any[] {
  const items: any[] = []
  if (sys && sys.trim()) items.push({ role: 'system', content: [{ type: 'input_text', text: sys }] })
  for (const m of conv) {
    items.push({ role: m.role, content: [{ type: 'input_text', text: m.content }] })
  }
  return items
}

export async function replyStream(conversation: ConversationMessage[], options: OpenAIReplyOptions = {}, onDelta: (delta: string) => void): Promise<string> {
  const { getGroupById, modelConfig } = await import('../store/modelConfig')
  const groupId = options.groupId || (modelConfig.value?.models.find(m => m.id === modelConfig.value?.selectedModelId)?.groupId || '')
  const group = groupId ? getGroupById(groupId) : undefined
  const baseUrl = stripTrailingSlashes(group?.baseUrl || 'https://api.openai.com/v1')
  const apiKey = group?.apiKey || ''
  if (!apiKey) throw new Error('未配置 API Key，请在“模型配置”中填写。')
  const model = options.model || (modelConfig.value?.models.find(m => m.id === modelConfig.value?.selectedModelId)?.modelName || '')
  if (!model) throw new Error('未选择模型或模型名为空。')
  const sys = ''

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'text/event-stream',
  }

  const decoder = new TextDecoder()

  // Helper to read SSE stream and emit deltas
  async function readSSE(resp: Response, pickDelta: (obj: any) => string | null): Promise<string> {
    if (!resp.ok) throw new Error(await readError(resp))
    const reader = resp.body?.getReader()
    if (!reader) throw new Error('流式连接失败：无数据流')
    let buffer = ''
    let full = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      // 保留最后一行（可能不完整）
      buffer = lines.pop() || ''
      for (const line of lines) {
        const t = line.trim()
        if (!t.length) continue
        if (t.startsWith('data:')) {
          const payload = t.slice(5).trim()
          if (payload === '[DONE]') {
            buffer = ''
            break
          }
          try {
            const obj = JSON.parse(payload)
            const delta = pickDelta(obj)
            if (delta && delta.length) {
              onDelta(delta)
              full += delta
            }
          } catch (_) {
            // 忽略不可解析片段
          }
        }
      }
    }
    return full
  }

  // 1) 尝试 Chat Completions 流式
  try {
    const messages = toChatCompletionMessages(conversation, sys)
    
    // 先尝试原始URL
    let resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model, messages, stream: true })
    })
    
    // 如果失败，尝试修复URL并重新请求
    if (!resp.ok) {
      const fixedUrl = await checkAndFixChatCompletionsEndpoint(baseUrl)
      resp = await fetch(fixedUrl, {
        method: 'POST', headers,
        body: JSON.stringify({ model, messages, stream: true })
      })
      if (!resp.ok) throw new Error(await readError(resp))
    }
    
    const full = await readSSE(resp, (obj) => {
      const d = obj?.choices?.[0]?.delta?.content
      return typeof d === 'string' ? d : null
    })
    if (full && full.trim()) return full
    // 若无内容，继续尝试 Responses
  } catch (_) {
    // 继续尝试 Responses
  }

  // 2) 尝试 Responses API 流式
  const input = toResponsesInput(conversation, sys)
  const resp2 = await fetch(`${baseUrl}/responses`, {
    method: 'POST', headers,
    body: JSON.stringify({ model, input, stream: true })
  })
  const full2 = await readSSE(resp2, (obj) => {
    // 兼容多种 responses 流式片段结构
    // 优先 output_text.delta
    if (typeof obj?.output_text === 'string') return obj.output_text
    if (typeof obj?.delta?.text === 'string') return obj.delta.text
    // 有时片段在 content[] 里面
    if (Array.isArray(obj?.content)) {
      const texts: string[] = []
      for (const c of obj.content) {
        if (typeof c?.text === 'string') texts.push(c.text)
      }
      if (texts.length) return texts.join('')
    }
    return null
  })
  return full2
}