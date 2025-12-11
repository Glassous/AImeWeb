<script setup lang="ts">
defineProps<{
  show: boolean
  message: string
  type?: 'success' | 'error' | 'info'
}>()
</script>

<template>
  <div class="toast" :class="type || 'info'">
    <div class="icon">
      <svg v-if="type === 'success'" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7.75 12L10.58 14.83L16.25 9.17004" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <svg v-else-if="type === 'error'" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M12 8V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M11.9945 16H12.0035" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M12 8V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M11.9945 16H12.0035" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <span class="message">{{ message }}</span>
  </div>
</template>

<style scoped>
.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: var(--panel);
  backdrop-filter: var(--blur-lg);
  -webkit-backdrop-filter: var(--blur-lg);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-float);
  color: var(--text);
  font-size: 14px;
  font-weight: 500;
  min-width: 200px;
  max-width: 90vw;
  justify-content: center;
  pointer-events: auto;
  transition: all 0.3s;
}

.toast.success { color: #10b981; border-color: rgba(16, 185, 129, 0.2); background: rgba(255, 255, 255, 0.95); }
.toast.error { color: #ef4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(255, 255, 255, 0.95); }
.toast.info { color: var(--text); background: rgba(255, 255, 255, 0.95); }

:root[data-theme='dark'] .toast.success { background: rgba(24, 24, 27, 0.9); }
:root[data-theme='dark'] .toast.error { background: rgba(24, 24, 27, 0.9); }
:root[data-theme='dark'] .toast.info { background: rgba(24, 24, 27, 0.9); }

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
