
/**
 * 解析消息内容，分离深度思考（Reasoning）部分和正式回复部分
 */
export interface ParsedContent {
  reasoning: string
  content: string
  isThinking: boolean // 是否正在思考（即思考标签未闭合）
  thinkTime?: string // 解析出的思考时间（如 "4 seconds"）
}

export function parseMessageContent(text: string): ParsedContent {
  if (!text) return { reasoning: '', content: '', isThinking: false }

  // 1. 优先尝试解析 <think> 标签
  const thinkStart = text.indexOf('<think>')
  if (thinkStart !== -1) {
    const thinkEnd = text.indexOf('</think>', thinkStart)
    
    if (thinkEnd !== -1) {
      // 完整闭合的 think 标签
      const reasoning = text.substring(thinkStart + 7, thinkEnd).trim()
      const content = text.substring(0, thinkStart) + text.substring(thinkEnd + 8)
      // 尝试从 content 开头提取换行符，避免 formatting 问题
      return { 
        reasoning, 
        content: content.trimStart(), // 通常 think 标签后会有换行，去除它以免正文开头空行
        isThinking: false 
      }
    } else {
      // 未闭合，说明正在生成思考内容
      const reasoning = text.substring(thinkStart + 7)
      const content = text.substring(0, thinkStart)
      return { reasoning, content, isThinking: true }
    }
  }

  // 2. 尝试解析引用块格式的思考内容
  // 格式特征：以 > 开头，结尾可能有 > *Thought for X seconds*
  // 注意：流式输出时可能还没出现结尾
  // 这种格式比较模糊，我们主要匹配结尾特征，或者整个开头是引用块的情况
  
  // 简单的启发式：如果开头就是引用块
  if (text.trim().startsWith('>')) {
    // 寻找 "Thought for X seconds" 模式
    const timeMatch = text.match(/>\s*\*Thought for\s+(.*?)\*/i)
    if (timeMatch) {
      const timeStr = timeMatch[1] // e.g. "4 seconds"
      const matchIndex = timeMatch.index!
      const matchLength = timeMatch[0].length
      
      // 截取到这个标记为止作为思考内容
      // 注意：这里假设标记在思考内容的末尾
      const reasoningRaw = text.substring(0, matchIndex + matchLength)
      const content = text.substring(matchIndex + matchLength).trim()
      
      // 清理 reasoning 中的引用符号 >
      const reasoning = reasoningRaw.split('\n').map(line => line.replace(/^>\s?/, '')).join('\n').trim()
      
      return {
        reasoning,
        content,
        isThinking: false,
        thinkTime: timeStr
      }
    }
  }

  // 默认情况
  return { reasoning: '', content: text, isThinking: false }
}
