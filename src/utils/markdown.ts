import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'

// 基础配置：启用 GFM 与换行
marked.setOptions({
  gfm: true,
  breaks: true,
  highlight(code: string, lang?: string) {
    try {
      const l = (lang || '').trim().toLowerCase()
      if (l && hljs.getLanguage(l)) {
        return hljs.highlight(code, { language: l }).value
      }
      return hljs.highlightAuto(code).value
    } catch (_) {
      return code
    }
  },
} as any)

// 包装代码块以便显示复制按钮，并给 <code> 添加 hljs 类
function enhanceCodeBlocks(html: string): string {
  const container = document.createElement('div')
  container.innerHTML = html
  // 链接统一新开标签页
  const links = container.querySelectorAll('a[href]')
  links.forEach(a => {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  })
  const codes = container.querySelectorAll('pre > code')
  codes.forEach(codeEl => {
    const preEl = codeEl.parentElement
    if (!preEl) return
    // 添加 hljs 类以兼容高亮样式文件
    codeEl.classList.add('hljs')
    // 包装为 code-block，并追加复制按钮
    const wrapper = document.createElement('div')
    wrapper.className = 'code-block'
    preEl.parentNode?.insertBefore(wrapper, preEl)
    wrapper.appendChild(preEl)
    const copyBtn = document.createElement('span')
    copyBtn.className = 'code-copy-btn'
    copyBtn.setAttribute('title', '复制')
    copyBtn.textContent = '复制'
    wrapper.appendChild(copyBtn)
  })
  return container.innerHTML
}

// 将纯文本 Markdown 转为安全的 HTML
export function renderMarkdown(input: string): string {
  try {
    const md = typeof input === 'string' ? input : ''
    const rawHtml = marked.parse(md) as string
    // 先进行清理，移除潜在风险，再增强代码块结构
    const safeHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true, svg: false, mathMl: false } })
    return enhanceCodeBlocks(safeHtml)
  } catch (_) {
    // 兜底：当解析失败时，按纯文本输出（不允许任何标签）
    return DOMPurify.sanitize(String(input || ''), { ALLOWED_TAGS: [] })
  }
}