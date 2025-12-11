<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ToastContainer from './components/ToastContainer.vue'
import StarBackground from './components/StarBackground.vue'
import { RouterView, useRoute } from 'vue-router'
import { themeStore } from './store/theme'

const isSidebarOpen = ref(false)
const isMobile = ref(window.innerWidth <= 768)

const isSidebarHovering = ref(false)
const isEdgeHovering = ref(false)
let sidebarTimer: ReturnType<typeof setTimeout> | null = null
let edgeTimer: ReturnType<typeof setTimeout> | null = null

const isTempOpen = computed(() => !isMobile.value && !isSidebarOpen.value && (isEdgeHovering.value || isSidebarHovering.value))
const realSidebarOpen = computed(() => isSidebarOpen.value || isTempOpen.value)
const isOverlay = computed(() => false) // 桌面端临时展开也改为挤压模式，不再使用悬浮覆盖

function handleResize() {
  isMobile.value = window.innerWidth <= 768
  // 在进入移动端时默认关闭侧边栏以使用覆盖模式时的显隐
  if (isMobile.value) {
    isSidebarOpen.value = false
    isSidebarHovering.value = false
    isEdgeHovering.value = false
  }
}

function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}

function closeSidebar() {
  isSidebarOpen.value = false
  isSidebarHovering.value = false
  isEdgeHovering.value = false
}

function handleEdgeHover(v: boolean) {
  if (isMobile.value) return
  if (v) {
    if (edgeTimer) clearTimeout(edgeTimer)
    isEdgeHovering.value = true
  } else {
    edgeTimer = setTimeout(() => {
      isEdgeHovering.value = false
    }, 200)
  }
}

watch(isSidebarHovering, (val) => {
  if (val) {
    isEdgeHovering.value = false
    if (edgeTimer) clearTimeout(edgeTimer)
  }
})

function handleSidebarHover(v: boolean) {
  if (isMobile.value) return
  if (v) {
    if (sidebarTimer) clearTimeout(sidebarTimer)
    isSidebarHovering.value = true
  } else {
    sidebarTimer = setTimeout(() => {
      isSidebarHovering.value = false
    }, 100)
  }
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
    :style="(!isMobile && !hideSidebar()) ? { '--sidebar-w': realSidebarOpen ? '280px' : '0px' } : {}"
  >
    <StarBackground v-if="themeStore.activeTheme.value === 'dark'" />
    <Sidebar 
      v-if="!hideSidebar()" 
      :class="[realSidebarOpen ? 'open' : '']" 
      :is-mobile="isMobile" 
      :is-open="realSidebarOpen" 
      :overlay="isOverlay"
      @close="closeSidebar"
      @mouseenter="handleSidebarHover(true)"
      @mouseleave="handleSidebarHover(false)"
    />
    <div class="main-col">
      <RouterView v-slot="{ Component }">
        <component 
          :is="Component" 
          :sidebar-open="realSidebarOpen" 
          :toggle-sidebar="toggleSidebar" 
          :is-mobile="isMobile" 
        />
      </RouterView>
    </div>
    <div v-if="!hideSidebar() && isMobile && isSidebarOpen" class="overlay" @click="closeSidebar"></div>
    <div v-if="!isMobile && !hideSidebar()" class="edge-trigger" @mouseenter="handleEdgeHover(true)" @mouseleave="handleEdgeHover(false)"></div>
  </div>
  <ToastContainer />
</template>

<style scoped>
.edge-trigger {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 16px;
  z-index: 40;
}
.layout {
  display: grid;
  grid-template-columns: var(--sidebar-w, 280px) 1fr;
  transition: grid-template-columns 0.4s cubic-bezier(0.2, 0, 0, 1), background-color 0.3s ease;
  height: 100vh;
  background: transparent; /* Changed from var(--bg) to show body background */
  color: var(--text);
  overflow: hidden; /* 防止整体滚动 */
}
.main-col {
  /* 关键：允许内部设置 overflow 的子元素滚动，而不是整体页面变长 */
  min-height: 0; /* 修正 grid 子项的默认 min-height:auto 导致溢出问题 */
  min-width: 0;
  height: 100%;
  grid-column: 2; /* 明确指定占据第二列，防止 Sidebar fixed 时自动填补到第一列 */
  display: flex;
  flex-direction: column;
  position: relative;
  background: transparent; /* Removed undefined var(--bg-secondary) */
  transition: background-color 0.3s ease;
}
.layout.mobile {
  grid-template-columns: 1fr; /* 主区域占满，侧边栏改为覆盖 */
}
.layout.mobile .main-col {
  grid-column: 1; /* 移动端或隐藏侧边栏模式下恢复为第一列 */
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