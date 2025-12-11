<script setup lang="ts">
import { toastStore } from '../store/toast'
import Toast from './Toast.vue'
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast-list">
      <Toast 
        v-for="t in toastStore.toasts.value" 
        :key="t.id" 
        :show="true" 
        :message="t.message" 
        :type="t.type"
        @click="toastStore.remove(t.id)"
        style="cursor: pointer"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
  align-items: center;
}

.toast-list-enter-active,
.toast-list-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-list-enter-from,
.toast-list-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}
</style>
