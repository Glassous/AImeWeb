<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { chatStore } from '../store/chat'

const props = defineProps<{ isMobile: boolean; isOpen: boolean; overlay?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const router = useRouter()

const histories = computed(() => chatStore.getHistories())
const activeId = computed(() => chatStore.getActiveId())

const menuOpenId = ref<number | null>(null)
const editingId = ref<number | null>(null)
const editingTitle = ref('')
const modal = ref<{ type: 'confirm' | 'edit' | null; id?: number }>({ type: null })

function newChat() {
  chatStore.startDraft()
  if (props.isMobile) emit('close')
}

function selectChat(id: number) {
  chatStore.setActiveChat(id)
  if (props.isMobile) emit('close')
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
  <aside class="sidebar" :class="[props.isOpen ? 'open' : '', props.overlay ? 'overlay' : '']">
    <div class="sidebar-top">
      <div class="brand">
        <div class="logo-box">AI</div>
        <span>AIme</span>
      </div>
      <button v-if="props.isMobile" class="icon-btn close-mobile" aria-label="关闭" @click="close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
    
    <div class="sidebar-action">
      <button class="new-btn" @click="newChat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>新对话</span>
      </button>
    </div>

    <div class="history-list">
      <div class="list-label">历史记录</div>
      <div
        v-for="h in histories"
        :key="h.id"
        class="history-item"
        :class="[h.id === activeId ? 'active' : '']"
        @click="selectChat(h.id)"
      >
        <div class="item-content">
          <div class="title">{{ h.title }}</div>
          <div class="time">{{ new Date(h.updatedAt).toLocaleDateString() }}</div>
        </div>
        
        <button class="more-btn" @click.stop="toggleMenu(h.id)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="19" cy="12" r="1"/>
            <circle cx="5" cy="12" r="1"/>
          </svg>
        </button>
        
        <div v-if="menuOpenId === h.id" class="menu" @click.stop>
          <button class="menu-item" @click="openEdit(h.id)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            编辑
          </button>
          <button class="menu-item danger" @click="openDelete(h.id)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            删除
          </button>
        </div>
      </div>
      
      <div v-if="histories.length === 0" class="empty">
        <div class="empty-icon">📝</div>
        暂无历史记录
      </div>
    </div>

    <div class="sidebar-footer">
      <button class="footer-btn" @click="router.push('/settings')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        设置
      </button>
    </div>

    <!-- Modal -->
    <div v-if="modal.type" class="modal-mask" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">{{ modal.type === 'edit' ? '重命名对话' : '删除确认' }}</div>
          <button class="icon-btn" @click="closeModal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <template v-if="modal.type === 'edit'">
            <input 
              v-model="editingTitle" 
              class="modal-input" 
              placeholder="输入新的对话标题" 
              @keyup.enter="confirmEdit"
              autoFocus
            />
          </template>
          <template v-else>
            <div class="confirm-text">
              您确定要删除此对话吗？此操作无法撤销。
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" @click="closeModal">取消</button>
          <button 
            class="btn" 
            :class="modal.type === 'edit' ? 'primary' : 'danger'" 
            @click="modal.type === 'edit' ? confirmEdit() : confirmDelete()"
          >
            {{ modal.type === 'edit' ? '保存' : '删除' }}
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 50;
  background: var(--bg-sidebar);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: transform .3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

/* Header */
.sidebar-top { 
  padding: 20px 16px; 
  display: flex; 
  align-items: center; 
  justify-content: space-between;
}

.brand { 
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700; 
  font-size: 18px; 
  color: var(--text);
  letter-spacing: -0.02em;
}

.logo-box {
  width: 32px;
  height: 32px;
  background: var(--primary);
  color: #fff;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
}

/* Actions */
.sidebar-action {
  padding: 0 16px 16px;
}

.new-btn {
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
}

.new-btn:hover { 
  background: var(--hover); 
  border-color: var(--border-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

/* List */
.history-list { 
  flex: 1; 
  overflow-y: auto; 
  padding: 0 12px; 
}

.list-label {
  padding: 0 8px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.history-item {
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: var(--radius-md);
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: space-between;
/* for hover states */
}

.history-item:hover { background: var(--hover); }
.history-item.active { background: var(--active); }

.item-content {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
}

.history-item .title { 
  font-size: 14px; 
  color: var(--text); 
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.history-item .time { 
  font-size: 11px; 
  color: var(--text-tertiary); 
  margin-top: 2px;
}

.more-btn { 
  opacity: 0;
  border: none; 
  background: transparent; 
  cursor: pointer; 
  padding: 4px; 
  border-radius: 4px; 
  color: var(--text-secondary); 
  transition: all 0.2s;
}

.history-item:hover .more-btn,
.history-item.active .more-btn,
.more-btn:focus {
  opacity: 1;
}

.more-btn:hover { background: var(--bg-input); color: var(--text); }

/* Menu */
.menu { 
  position: absolute; 
  right: 10px; 
  top: 40px; 
  background: var(--bg); 
  border: 1px solid var(--border); 
  border-radius: var(--radius-md); 
  box-shadow: var(--shadow-lg); 
  display: flex; 
  flex-direction: column; 
  min-width: 140px; 
  z-index: 20; 
  overflow: hidden;
  padding: 4px;
  animation: slideIn 0.1s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

.menu-item { 
  padding: 8px 12px; 
  border: none; 
  background: transparent; 
  text-align: left; 
  cursor: pointer; 
  color: var(--text); 
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: var(--radius-sm);
  transition: background 0.1s;
}

.menu-item:hover { background: var(--hover); }
.menu-item.danger { color: var(--error-text); }
.menu-item.danger:hover { background: var(--error-bg); }

/* Empty State */
.empty { 
  color: var(--text-tertiary); 
  padding: 40px 20px; 
  text-align: center; 
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.empty-icon { font-size: 24px; opacity: 0.5; }

/* Footer */
.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--border);
}

.footer-btn {
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  transition: all 0.2s;
}

.footer-btn:hover { background: var(--hover); color: var(--text); }

/* Icons */
.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.icon-btn:hover { background: var(--hover); color: var(--text); }

/* Modal */
.modal-mask {
  position: fixed; inset: 0; 
  background: var(--mask); 
  display: flex; align-items: center; justify-content: center; 
  z-index: 50;
  backdrop-filter: var(--blur-sm);
  -webkit-backdrop-filter: var(--blur-sm);
}

.modal {
  width: min(90vw, 400px); 
  background: var(--bg); 
  border: 1px solid var(--border); 
  border-radius: var(--radius-xl); 
  box-shadow: var(--shadow-float);
  overflow: hidden;
  animation: modalPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalPop {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title { font-weight: 600; font-size: 16px; }

.modal-body { padding: 20px; color: var(--text); }

.modal-input { 
  width: 100%; 
  padding: 12px 14px; 
  border: 1px solid var(--border); 
  border-radius: var(--radius-md); 
  background: var(--bg-input); 
  color: var(--text); 
  transition: all 0.2s;
}
.modal-input:focus { 
  background: var(--bg);
  border-color: var(--primary); 
  box-shadow: 0 0 0 3px var(--primary-light);
}

.confirm-text { color: var(--text-secondary); line-height: 1.5; }

.modal-footer { 
  display: flex; 
  gap: 12px; 
  justify-content: flex-end; 
  padding: 16px 20px; 
  background: var(--bg-sidebar);
  border-top: 1px solid var(--border); 
}

.btn { 
  padding: 8px 16px; 
  border-radius: var(--radius-md); 
  border: 1px solid var(--border); 
  background: var(--btn-bg); 
  cursor: pointer; 
  color: var(--text); 
  font-weight: 500;
  font-size: 14px;
  transition: all 0.2s;
}

.btn:hover { background: var(--hover); }

.btn.primary { 
  background: var(--primary); 
  border-color: var(--primary); 
  color: var(--on-primary); 
  box-shadow: var(--shadow-sm);
}
.btn.primary:hover { background: var(--primary-hover); }

.btn.danger { 
  background: var(--error-bg); 
  border-color: var(--error-border); 
  color: var(--error-text); 
}
.btn.danger:hover { background: #fee2e2; }
:root[data-theme='dark'] .btn.danger:hover { background: #7f1d1d; }

.btn.ghost { border-color: transparent; background: transparent; }
.btn.ghost:hover { background: var(--hover); }

.sidebar.overlay {
  position: fixed;
  left: 0; top: 0; bottom: 0;
  z-index: 100;
  width: 280px;
  transform: translateX(-100%);
  box-shadow: var(--shadow-xl);
}
.sidebar.overlay.open {
  transform: translateX(0);
}

/* Mobile */
@media (max-width: 768px) {
  .sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; z-index: 100;
    width: min(85vw, 320px);
    transform: translateX(-100%);
    box-shadow: var(--shadow-xl);
  }
  .sidebar.open {
    transform: translateX(0);
  }
}
</style>
