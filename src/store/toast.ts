import { ref } from 'vue'

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  duration?: number
}

const toasts = ref<ToastItem[]>([])

export const toastStore = {
  toasts,
  add(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) {
    const id = Date.now().toString() + Math.random().toString().slice(2)
    toasts.value.push({ id, message, type, duration })
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration)
    }
  },
  remove(id: string) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  },
  success(msg: string, duration = 3000) { this.add(msg, 'success', duration) },
  error(msg: string, duration = 4000) { this.add(msg, 'error', duration) },
  info(msg: string, duration = 3000) { this.add(msg, 'info', duration) }
}
