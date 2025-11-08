<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { chatStore } from '../store/chat'

const props = defineProps<{ isMobile: boolean; isOpen: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const router = useRouter()

const histories = computed(() => chatStore.getHistories())
const activeId = computed(() => chatStore.getActiveId())

const menuOpenId = ref<number | null>(null)
const editingId = ref<number | null>(null)
const editingTitle = ref('')
const modal = ref<{ type: 'confirm' | 'edit' | null; id?: number }>({ type: null })

function newChat() {
  // 仅清空聊天区域，等待首条消息后再入库
  chatStore.startDraft()
}

function selectChat(id: number) {
  chatStore.setActiveChat(id)
}

function close() { emit('close') }

function toggleMenu(id: number) {
  menuOpenId.value = menuOpenId.value === id ? null : id
}

function openEdit(id: number) {
  const rec = histories.value.find(h => h.id === id)
  if (!rec) return
  editingId.value = id
  editingTitle.value = rec.title
  modal.value = { type: 'edit', id }
  menuOpenId.value = null
}

function confirmEdit() {
  if (editingId.value !== null) {
    chatStore.renameChat(editingId.value, editingTitle.value)
  }
  closeModal()
}

function openDelete(id: number) {
  modal.value = { type: 'confirm', id }
  menuOpenId.value = null
}

function confirmDelete() {
  if (modal.value.id != null) {
    chatStore.deleteChat(modal.value.id)
  }
  closeModal()
}

function closeModal() {
  modal.value = { type: null }
  editingId.value = null
  editingTitle.value = ''
}
</script>

<template>
  <aside class="sidebar" :class="{ open: props.isOpen }">
    <div class="sidebar-top">
      <div class="brand">AIme</div>
      <button v-if="props.isMobile" class="close-mobile" aria-label="关闭" title="关闭" @click="close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="sidebar-header">
      <button class="new-btn" @click="newChat">新增对话</button>
    </div>

    <div class="history-list">
      <div
        v-for="h in histories"
        :key="h.id"
        class="history-item"
        :class="{ active: h.id === activeId }"
        @click="selectChat(h.id)"
      >
        <div class="row">
          <div class="title">{{ h.title }}</div>
          <button class="more-btn" aria-label="更多" title="更多" @click.stop="toggleMenu(h.id)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="5" r="2" fill="currentColor"/>
              <circle cx="12" cy="12" r="2" fill="currentColor"/>
              <circle cx="12" cy="19" r="2" fill="currentColor"/>
            </svg>
          </button>
          <div v-if="menuOpenId === h.id" class="menu" @click.stop>
            <button @click="openEdit(h.id)">编辑</button>
            <button class="danger" @click="openDelete(h.id)">删除</button>
          </div>
        </div>
        <div class="time">{{ new Date(h.updatedAt).toLocaleString() }}</div>
      </div>
      <div v-if="histories.length === 0" class="empty">暂无历史记录</div>
    </div>

  <div class="sidebar-footer">
      <button class="settings-btn" title="设置" @click="router.push('/settings')">设置</button>
  </div>
    <!-- 模态框：编辑 / 删除确认 -->
    <div v-if="modal.type" class="modal-mask" @click.self="closeModal">
      <div class="modal">
        <div class="modal-title">
          {{ modal.type === 'edit' ? '编辑名称' : '确认删除' }}
        </div>
        <div class="modal-body">
          <template v-if="modal.type === 'edit'">
            <input v-model="editingTitle" class="modal-input" placeholder="请输入新的名称" />
          </template>
          <template v-else>
            <div class="confirm-text">确定删除此记录？该操作不可撤销。</div>
          </template>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="closeModal">取消</button>
          <button v-if="modal.type === 'edit'" class="btn primary" @click="confirmEdit">确认</button>
          <button v-else class="btn danger" @click="confirmDelete">删除</button>
        </div>
      </div>
    </div>
  </aside>
  
</template>

<style scoped>
.sidebar {
  width: 100%; /* 让 PC 模式下跟随网格列宽变化，从而在折叠时真正为 0 */
  background: var(--subtle);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: width .25s ease;
  overflow: hidden; /* 折叠为 0 宽时隐藏内容避免溢出 */
}
.sidebar-top { padding: 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; color: var(--text); }
.brand { font-weight: 600; font-size: 18px; }
.close-mobile { margin-left: auto; border: none; background: transparent; cursor: pointer; padding: 4px; border-radius: 6px; color: var(--text); }
.close-mobile:hover { background: var(--hover); }
.sidebar-header {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}
.new-btn {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--btn-border);
  background: var(--btn-bg);
  cursor: pointer;
}
.new-btn:hover { background: var(--hover); }

.history-list { flex: 1; overflow-y: auto; padding: 8px; }
.history-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
}
.history-item:hover { background: var(--hover); }
.history-item.active { background: var(--bubble-user-bg); }
.history-item .row { display: flex; align-items: center; }
.history-item .title { font-size: 14px; color: var(--text); flex: 1; }
.more-btn { border: none; background: transparent; cursor: pointer; padding: 4px; border-radius: 6px; color: var(--text); }
.more-btn:hover { background: var(--hover); }
.menu { position: absolute; right: 8px; top: 34px; background: var(--bg); border: 1px solid var(--btn-border); border-radius: 8px; box-shadow: var(--shadow); display: flex; flex-direction: column; min-width: 120px; z-index: 5; }
.menu button { padding: 8px 12px; border: none; background: transparent; text-align: left; cursor: pointer; color: var(--text); }
.menu button:hover { background: var(--hover); }
.menu .danger { color: #c33; }
.edit-input { display: none; }
.history-item .time { font-size: 12px; color: var(--muted); margin-top: 4px; }

.empty { color: #999; padding: 12px; text-align: center; }

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border);
}
.settings-btn {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--btn-border);
  background: var(--btn-bg);
  cursor: pointer;
}
.settings-btn:hover { background: var(--hover); }

/* 移动端覆盖样式 */
@media (max-width: 768px) {
  .sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; z-index: 10;
    width: min(82vw, 320px);
    transform: translateX(-100%);
    transition: transform .25s ease;
  }
  :host(.open) .sidebar,
  .sidebar.open {
    transform: translateX(0);
  }
}

/* 模态框样式 */
.modal-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.28); display: flex; align-items: center; justify-content: center; z-index: 20;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.modal {
  width: min(92vw, 420px); background: var(--bg); border: 1px solid var(--btn-border); border-radius: 12px; box-shadow: var(--shadow);
  overflow: hidden;
}
.modal-title { font-weight: 600; padding: 14px 16px; border-bottom: 1px solid var(--border); color: var(--text); }
.modal-body { padding: 16px; color: var(--text); }
.modal-input { width: 100%; max-width: 100%; padding: 10px 12px; border: 1px solid var(--btn-border); border-radius: 8px; background: var(--btn-bg); color: var(--text); }
.confirm-text { color: var(--text); }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 16px; border-top: 1px solid var(--border); }
.btn { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); cursor: pointer; color: var(--text); }
.btn:hover { background: var(--hover); }
.btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
.btn.primary:hover { background: #357ae8; }
.btn.danger { background: #e53e3e; border-color: #e53e3e; color: #fff; }
.btn.danger:hover { background: #d73737; }
</style>