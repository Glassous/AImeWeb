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
    
    // 生成唯一代码块ID
    const codeBlockId = `code-block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // 获取语言类型
    const language = codeEl.className.replace('hljs', '').trim().replace('language-', '')
    
    // 包装为 code-block，并追加控制按钮
    const wrapper = document.createElement('div')
    // 仅 HTML/Vue/JSX 相关代码默认折叠
    const isHtml = ['html', 'vue', 'jsx', 'react'].includes((language || '').toLowerCase())
    wrapper.className = isHtml ? 'code-block collapsed' : 'code-block'
    wrapper.setAttribute('data-code-block-id', codeBlockId)
    
    preEl.parentNode?.insertBefore(wrapper, preEl)
    
    // 创建代码块头部（包含语言、折叠/展开按钮、查看按钮和复制按钮）
    const header = document.createElement('div')
    header.className = 'code-block-header'
    
    // 左侧：语言显示
    const leftGroup = document.createElement('div')
    leftGroup.className = 'header-left'
    
    // 语言图标或文字
    const langSpan = document.createElement('span')
    langSpan.className = 'code-language'
    langSpan.textContent = (language || 'TEXT').toUpperCase()
    leftGroup.appendChild(langSpan)
    
    header.appendChild(leftGroup)
    
    // 右侧：操作按钮组
    const rightGroup = document.createElement('div')
    rightGroup.className = 'header-right'

    // 预览按钮（仅对部分语言显示）
    const isPreviewable = ['html', 'vue', 'jsx', 'react'].includes((language || '').toLowerCase())
    if (isPreviewable) {
      const previewBtn = document.createElement('button')
      previewBtn.className = 'code-btn code-preview-btn'
      previewBtn.setAttribute('title', '在侧边栏预览')
      previewBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> 预览'
      rightGroup.appendChild(previewBtn)
    }

    // 折叠/展开按钮
    const toggleBtn = document.createElement('button')
    toggleBtn.className = 'code-btn code-toggle-btn'
    toggleBtn.setAttribute('title', '折叠/展开')
    toggleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>'
    rightGroup.appendChild(toggleBtn)

    // 复制按钮
    const copyBtn = document.createElement('button')
    copyBtn.className = 'code-btn code-copy-btn'
    copyBtn.setAttribute('title', '复制')
    copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
    rightGroup.appendChild(copyBtn)

    header.appendChild(rightGroup)
    wrapper.appendChild(header)
    
    // 创建代码内容区域
    const contentWrapper = document.createElement('div')
    contentWrapper.className = 'code-body'
    contentWrapper.appendChild(preEl)
    
    wrapper.appendChild(contentWrapper)
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