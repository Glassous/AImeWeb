<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { renderMarkdown } from '../utils/markdown'

const props = defineProps<{
  content: string
  isThinking: boolean
  time?: string
}>()

const isExpanded = ref(props.isThinking)
const userInteracted = ref(false)
const contentRef = ref<HTMLDivElement | null>(null)
const contentHeight = ref('0px')

// 监听思考状态变化
watch(() => props.isThinking, (newVal) => {
  if (newVal) {
    // 开始思考，自动展开
    isExpanded.value = true
  } else {
    // 思考结束（转为正式回复），如果用户没有手动干预过，则自动折叠
    if (!userInteracted.value) {
      isExpanded.value = false
    }
  }
})

// 监听内容变化，如果是展开状态，更新高度（如果使用 max-height 动画方案的话，这里其实不需要频繁计算，grid 方案更好）
// 这里采用 grid-template-rows 动画方案，纯 CSS 即可

function toggle() {
  isExpanded.value = !isExpanded.value
  userInteracted.value = true
}

const displayHtml = computed(() => renderMarkdown(props.content))

const headerText = computed(() => {
  if (props.time) return `深度思考 (${props.time})`
  if (props.isThinking) return '深度思考中...'
  return '深度思考'
})
</script>

<template>
  <div class="thinking-block">
    <div class="think-header" @click="toggle" :class="{ 'is-thinking': isThinking }">
      <div class="icon-wrap">
        <svg v-if="isThinking" class="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="30 60"/>
        </svg>
        <svg v-else class="brain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
        </svg>
      </div>
      <span class="title">{{ headerText }}</span>
      <svg class="arrow" :class="{ rotated: isExpanded }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
    
    <div class="think-body-wrapper" :class="{ expanded: isExpanded }">
      <div class="think-body">
        <div class="markdown-body markdown" v-html="displayHtml"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thinking-block {
  margin-bottom: 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.think-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: var(--muted);
  transition: background 0.2s;
}

.think-header:hover {
  background: rgba(0, 0, 0, 0.05);
}

.think-header.is-thinking {
  color: var(--primary);
}

.icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.spinner {
  animation: spin 1s linear infinite;
  width: 16px; height: 16px;
}

.brain-icon {
  width: 16px; height: 16px;
}

.title {
  flex: 1;
  font-weight: 500;
}

.arrow {
  transition: transform 0.3s ease;
  opacity: 0.6;
}

.arrow.rotated {
  transform: rotate(180deg);
}

/* Grid animation technique */
.think-body-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.think-body-wrapper.expanded {
  grid-template-rows: 1fr;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.think-body {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.markdown-body {
  padding: 14px;
  opacity: 0.9;
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  .thinking-block {
    background: rgba(255, 255, 255, 0.03);
    border-color: rgba(255, 255, 255, 0.05);
  }
  .think-header:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .think-body-wrapper.expanded {
    border-top-color: rgba(255, 255, 255, 0.05);
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
