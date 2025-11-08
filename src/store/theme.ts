import { ref } from 'vue'
type Mode = 'system' | 'light' | 'dark'

const media = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : { matches: false, addEventListener: () => {}, removeEventListener: () => {} } as any

const mode = ref<Mode>('system')

function effective(): 'light' | 'dark' {
  if (mode.value === 'system') return media.matches ? 'dark' : 'light'
  return mode.value
}

function applyTheme() {
  const eff = effective()
  const root = document.documentElement
  root.setAttribute('data-theme', eff)
  ;(root.style as any).colorScheme = eff
}

function setMode(next: Mode) {
  mode.value = next
  try { localStorage.setItem('theme-mode', next) } catch {}
  applyTheme()
}

function cycle(): Mode {
  const next: Mode = mode.value === 'system' ? 'light' : mode.value === 'light' ? 'dark' : 'system'
  setMode(next)
  return next
}

function init() {
  try {
    const saved = localStorage.getItem('theme-mode') as Mode | null
    if (saved === 'light' || saved === 'dark' || saved === 'system') mode.value = saved
  } catch {}
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', () => {
      if (mode.value === 'system') applyTheme()
    })
  }
  applyTheme()
}

export const themeStore = { mode, setMode, cycle, init }