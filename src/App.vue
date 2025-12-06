<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Sidebar from './components/Sidebar.vue'
import { RouterView, useRoute } from 'vue-router'

const isSidebarOpen = ref(true)
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
    :class="{ mobile: isMobile || hideSidebar() }"
    :style="(!isMobile && !hideSidebar()) ? { '--sidebar-w': isSidebarOpen ? '280px' : '0px' } : {}"
  >
    <Sidebar v-if="!hideSidebar()" :class="{ open: isSidebarOpen }" :is-mobile="isMobile" :is-open="isSidebarOpen" @close="closeSidebar" />
    <div class="main-col">
      <RouterView v-slot="{ Component }">
        <component :is="Component" :sidebar-open="isSidebarOpen" :toggle-sidebar="toggleSidebar" :is-mobile="isMobile" />
      </RouterView>
    </div>
    <div v-if="!hideSidebar() && isMobile && isSidebarOpen" class="overlay" @click="closeSidebar"></div>
  </div>
  
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: var(--sidebar-w, 280px) 1fr;
  transition: grid-template-columns .25s ease;
  height: 100vh;
  background: var(--bg);
  color: var(--text);
}
.main-col {
  /* 关键：允许内部设置 overflow 的子元素滚动，而不是整体页面变长 */
  min-height: 0; /* 修正 grid 子项的默认 min-height:auto 导致溢出问题 */
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.layout.mobile {
  grid-template-columns: 1fr; /* 主区域占满，侧边栏改为覆盖 */
}
.overlay {
  position: fixed; inset: 0; background: var(--mask); z-index: 5;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
</style>
