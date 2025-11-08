export interface MockOptions {
  provider?: string
  model?: string
}

export async function reply(message: string, options: MockOptions = {}): Promise<string> {
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms))
  await delay(600)
  const trimmed = message.trim()
  if (!trimmed) return '（模拟服务）请输入内容。'
  const p = options.provider || 'mock-provider'
  const m = options.model || 'mock-default'
  // 注入用户背景提示词（非必要信息）以加强回复
  try {
    const { buildUserProfileSystemMessage, userProfile } = await import('../store/userProfile')
    const sys = buildUserProfileSystemMessage()
    const hints: string[] = []
    const text = trimmed
    if (/天气|气温|空气质量|空气/i.test(text)) {
      hints.push('检测到天气相关意图，建议优先调用 city_weather（模拟）')
      if (userProfile.value.city) hints.push(`城市偏好：${userProfile.value.city}`)
    }
    if (/股票|股价|行情|证券/i.test(text)) {
      hints.push('检测到股票相关意图，建议优先调用 stock_query（模拟）')
    }
    const prefix = [sys, hints.join('；')].filter(Boolean).join('\n')
    const base = `（${p} / ${m}）→ 你说：${trimmed}`
    return prefix ? `${prefix}\n\n${base}` : base
  } catch {
    // 兜底：无用户资料模块时仍正常回复
    return `（${p} / ${m}）→ 你说：${trimmed}`
  }
}

// 兼容旧接口
export async function listModels(): Promise<string[]> {
  await new Promise(res => setTimeout(res, 200))
  return ['mock-default', 'mock-fast', 'mock-creative']
}

// 新增：模拟服务商与模型信息
export interface MockProvider { id: string; name: string }
export interface MockModel { id: string; name: string; providerId: string; modelName?: string }

export async function listProviders(): Promise<MockProvider[]> {
  await new Promise(res => setTimeout(res, 150))
  return [
    { id: 'mock', name: 'Mock AI' },
    { id: 'openai', name: 'OpenAI (Mock)' },
  ]
}

export async function listProviderModels(providerId: string): Promise<MockModel[]> {
  await new Promise(res => setTimeout(res, 180))
  const base: Record<string, MockModel[]> = {
    mock: [
      { id: 'mock-default', name: '默认', providerId: 'mock', modelName: 'mock-default' },
      { id: 'mock-fast', name: '快速', providerId: 'mock', modelName: 'mock-fast' },
      { id: 'mock-creative', name: '创意', providerId: 'mock', modelName: 'mock-creative' },
    ],
    openai: [
      { id: 'gpt-4o-mini', name: 'GPT‑4o mini', providerId: 'openai', modelName: 'gpt-4o-mini' },
      { id: 'gpt-4o', name: 'GPT‑4o', providerId: 'openai', modelName: 'gpt-4o' },
    ],
  }
  return base[providerId] || []
}