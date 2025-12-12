<script setup lang="ts">
defineProps<{
  loading: boolean
}>()
</script>

<template>
  <Transition name="fade">
    <div v-if="loading" class="page-loading">
      <div class="loading-content">
        <div class="logo-spinner">
          <div class="spinner-ring"></div>
          <div class="spinner-core"></div>
        </div>
        <div class="loading-text">AIme is thinking...</div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.page-loading {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.logo-spinner {
  position: relative;
  width: 64px;
  height: 64px;
}

.spinner-ring {
  position: absolute;
  inset: 0;
  border: 3px solid transparent;
  border-top-color: var(--primary);
  border-right-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.spinner-core {
  position: absolute;
  inset: 12px;
  background: var(--primary);
  border-radius: 50%;
  opacity: 0.2;
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite alternate;
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
  font-weight: 500;
  animation: fadeText 1.5s ease-in-out infinite alternate;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes pulse {
  0% { transform: scale(0.8); opacity: 0.2; }
  100% { transform: scale(1.1); opacity: 0.5; }
}

@keyframes fadeText {
  0% { opacity: 0.5; }
  100% { opacity: 1; }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
