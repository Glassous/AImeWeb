export interface OpenAIReplyOptions {
  model?: string
  groupId?: string
}

function stripTrailingSlashes(url: string): string {
  return (url || '').replace(/\/+$/, '')
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
  const { buildUserProfileSystemMessage } = await import('../store/userProfile')

  const modelName = options.model || ''
  const groupId = options.groupId || (modelConfig.value?.models.find(m => m.id === modelConfig.value?.selectedModelId)?.groupId || '')
  const group = groupId ? getGroupById(groupId) : undefined
  const baseUrl = stripTrailingSlashes(group?.baseUrl || 'https://api.openai.com/v1')
  const apiKey = group?.apiKey || ''
  if (!apiKey) throw new Error('未配置 API Key，请在“模型配置”中填写。')
  const model = modelName || (modelConfig.value?.models.find(m => m.id === modelConfig.value?.selectedModelId)?.modelName || '')
  if (!model) throw new Error('未选择模型或模型名为空。')

  const sys = buildUserProfileSystemMessage()
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
  const resp2 = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(chatBody),
  })
  if (!resp2.ok) throw new Error(await readError(resp2))
  const json2 = await resp2.json()
  const text2 = extractTextFromResponse(json2)
  if (text2 && text2.trim()) return text2
  // Final fallback: stringify minimal structure
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
  const { buildUserProfileSystemMessage } = await import('../store/userProfile')
  const groupId = options.groupId || (modelConfig.value?.models.find(m => m.id === modelConfig.value?.selectedModelId)?.groupId || '')
  const group = groupId ? getGroupById(groupId) : undefined
  const baseUrl = stripTrailingSlashes(group?.baseUrl || 'https://api.openai.com/v1')
  const apiKey = group?.apiKey || ''
  if (!apiKey) throw new Error('未配置 API Key，请在“模型配置”中填写。')
  const model = options.model || (modelConfig.value?.models.find(m => m.id === modelConfig.value?.selectedModelId)?.modelName || '')
  if (!model) throw new Error('未选择模型或模型名为空。')
  const sys = buildUserProfileSystemMessage()

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
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model, messages, stream: true })
    })
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