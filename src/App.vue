<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ToastContainer from './components/ToastContainer.vue'
import { RouterView, useRoute } from 'vue-router'

const isSidebarOpen = ref(false)
const isMobile = ref(window.innerWidth <= 768)

function handleResize() {
  isMobile.value = window.innerWidth <= 768
  // 在进入移动端时默认关闭侧边栏以使用覆盖模式时的显隐
  if (isMobile.value) {
    isSidebarOpen.value = false
  }
}

function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}

function closeSidebar() {
  isSidebarOpen.value = false
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  handleResize()
})
onBeforeUnmount(() => window.removeEventListener('resize', handleResize))

const route = useRoute()
const hideSidebar = () => route.meta.hideSidebar === true
</script>

<template>
  <div
    class="layout"
    :class="[(isMobile || hideSidebar()) ? 'mobile' : '']"
    :style="(!isMobile && !hideSidebar()) ? { '--sidebar-w': isSidebarOpen ? '280px' : '0px' } : {}"
  >
    <Sidebar v-if="!hideSidebar()" :class="[isSidebarOpen ? 'open' : '']" :is-mobile="isMobile" :is-open="isSidebarOpen" @close="closeSidebar" />
    <div class="main-col">
      <RouterView v-slot="{ Component }">
        <component :is="Component" :sidebar-open="isSidebarOpen" :toggle-sidebar="toggleSidebar" :is-mobile="isMobile" />
      </RouterView>
    </div>
    <div v-if="!hideSidebar() && isMobile && isSidebarOpen" class="overlay" @click="closeSidebar"></div>
  </div>
  <ToastContainer />
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: var(--sidebar-w, 280px) 1fr;
  transition: grid-template-columns 0.4s cubic-bezier(0.2, 0, 0, 1), background-color 0.3s ease;
  height: 100vh;
  background: var(--bg);
  color: var(--text);
  overflow: hidden; /* 防止整体滚动 */
}
.main-col {
  /* 关键：允许内部设置 overflow 的子元素滚动，而不是整体页面变长 */
  min-height: 0; /* 修正 grid 子项的默认 min-height:auto 导致溢出问题 */
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--bg-secondary); /* 稍微区分侧边栏和主区域 */
  transition: background-color 0.3s ease;
}
.layout.mobile {
  grid-template-columns: 1fr; /* 主区域占满，侧边栏改为覆盖 */
}
.overlay {
  position: fixed; inset: 0; background: var(--mask); z-index: 5;
  backdrop-filter: var(--blur-sm);
  -webkit-backdrop-filter: var(--blur-sm);
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>