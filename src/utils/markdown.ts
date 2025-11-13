import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import MarkdownIt from 'markdown-it'
import { katex as mdKatex } from '@mdit/plugin-katex'
import 'katex/dist/katex.min.css'

const mdIt = new MarkdownIt({
  html: true,
  linkify: true,
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
})

mdIt.use(mdKatex, {
  delimiters: 'all',
  throwOnError: false,
  strict: 'ignore',
})

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

// markdown-it + KaTeX 插件负责 LaTeX 渲染

// 将纯文本 Markdown 转为安全的 HTML
export function renderMarkdown(input: string): string {
  try {
    const src = typeof input === 'string' ? input : ''
    const lines: string[] = src.split(/\r?\n/)
    const out: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const ln = String(lines[i] ?? '')
      if (ln.trim() === '[') {
        let buf: string[] = []
        let j = i + 1
        while (j < lines.length && String(lines[j] ?? '').trim() !== ']') { buf.push(String(lines[j] ?? '')); j++ }
        if (j < lines.length && String(lines[j] ?? '').trim() === ']') {
          out.push('$$')
          out.push(...buf)
          out.push('$$')
          i = j
          continue
        }
      }
      out.push(ln)
    }
    const normalized = out.join('\n')
    const rawHtml = mdIt.render(normalized)
    const safeHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true, svg: false, mathMl: false } })
    return enhanceCodeBlocks(safeHtml)
  } catch (_) {
    return DOMPurify.sanitize(String(input || ''), { ALLOWED_TAGS: [] })
  }
}