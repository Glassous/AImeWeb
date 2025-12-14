<template>
  <div class="page-wrap">
    <div class="topbar">
      <button class="icon-btn" @click="goBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div class="title">模型配置</div>
      <div class="spacer" />
      <button class="icon-btn" @click="openDrawer()" aria-label="新增模型组" title="新增模型组">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>

    <div class="content">
      <div class="grid">
        <div 
          v-for="g in cfg.modelGroups" 
          :key="g.id" 
          class="group-card"
          @click="openDrawer(g)"
        >
          <div class="group-header">
            <div class="group-title">{{ g.name }}</div>
            <button class="icon danger" @click.stop="confirmRemoveGroup(g)" title="删除">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#e53e3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </button>
          </div>
          <div class="kv"><span>Base URL:</span><span class="truncate" :title="g.baseUrl">{{ g.baseUrl }}</span></div>
          <div class="kv"><span>模型数量:</span><span>{{ modelsOf(g.id).length }}</span></div>
        </div>
        
        <div class="group-card add-card" @click="openDrawer()">
           <div class="add-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
           </div>
           <div>添加模型组</div>
        </div>
      </div>
    </div>

    <div v-if="drawerVisible" class="drawer-mask" @click="closeDrawer"></div>
    
    <div class="drawer" :class="{ open: drawerVisible }">
      <div class="drawer-header">
        <div class="drawer-title">{{ isEditing ? '编辑模型组' : '新增模型组' }}</div>
        <button class="icon-btn" @click="closeDrawer">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
             <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div class="drawer-content">
        <div class="form-section">
          <h3>基本信息</h3>
          <div class="form">
            <label>名称<input v-model="groupForm.name" placeholder="例如: OpenAI" /></label>
            <label>Base URL<input v-model="groupForm.baseUrl" placeholder="https://api.openai.com/v1" /></label>
            <label>API Key<input v-model="groupForm.apiKey" type="password" placeholder="sk-..." /></label>
            <label>官网地址<input v-model="groupForm.providerUrl" placeholder="https://openai.com" /></label>
          </div>
          <div class="drawer-actions">
             <button class="primary-btn full-width" @click="submitGroup">保存基本信息</button>
          </div>
        </div>

        <div v-if="isEditing" class="models-section">
           <div class="models-header">
             <h3>模型列表 ({{ modelsOf(editingGroup!).length }})</h3>
             <button class="add-model-btn" @click="openModelModalForCurrentGroup">
               <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>
               添加
             </button>
           </div>
           
           <div class="model-list">
             <div v-for="m in modelsOf(editingGroup!)" :key="m.id" class="model-item">
               <div class="model-info">
                 <div class="model-name">{{ m.name }}</div>
                 <div class="model-id">{{ m.modelName }}</div>
               </div>
               <div class="model-actions">
                 <button class="icon ghost" @click="openModelModal(m)" title="编辑">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                 </button>
                 <button class="icon danger" @click="confirmRemoveModel(m)" title="删除">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                 </button>
               </div>
             </div>
           </div>
        </div>
      </div>
    </div>

    <div v-if="showModelModal" class="modal-mask" style="z-index: 2000;" @click.self="closeModelModal">
      <div class="modal">
        <div class="modal-title">{{ editingModel ? '编辑模型' : '新增模型' }}</div>
        <div class="form">
          <label>显示名称<input v-model="modelForm.name" placeholder="例如: GPT-4" /></label>
          <label>模型ID<input v-model="modelForm.modelName" placeholder="例如: gpt-4" /></label>
          <label>备注<input v-model="modelForm.remark" /></label>
        </div>
        <div class="modal-actions">
          <button class="ghost-btn" @click="closeModelModal">取消</button>
          <button class="primary-btn" @click="submitModel">确认</button>
        </div>
      </div>
    </div>

    <div v-if="showConfirm" class="modal-mask" style="z-index: 2100;" @click.self="closeConfirm">
      <div class="modal">
        <div class="modal-title">确认删除</div>
        <div class="modal-body">确定删除“{{ confirmName }}”？该操作不可恢复。</div>
        <div class="modal-actions">
          <button class="ghost-btn" @click="closeConfirm">取消</button>
          <button class="danger-btn" @click="doConfirmDelete">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { modelConfig, addGroup, updateGroup, removeGroup, addModel, updateModel, removeModel, getModelsByGroup, setSelectedModel } from '../store/modelConfig'
import { toastStore } from '../store/toast'


const router = useRouter()
const cfg = modelConfig.value

function goBack() { router.back() }

function modelsOf(groupId: string) { return getModelsByGroup(groupId) }

// Drawer & Group Logic
const drawerVisible = ref(false)
const editingGroup = ref<string | null>(null)
const groupForm = reactive({ name: '', baseUrl: '', apiKey: '', providerUrl: '' })

const isEditing = computed(() => !!editingGroup.value)

function openDrawer(g?: typeof cfg.modelGroups[number]) {
  editingGroup.value = g?.id ?? null
  groupForm.name = g?.name ?? ''
  groupForm.baseUrl = g?.baseUrl ?? ''
  groupForm.apiKey = g?.apiKey ?? ''
  groupForm.providerUrl = g?.providerUrl ?? ''
  drawerVisible.value = true
}

function closeDrawer() { drawerVisible.value = false }

function submitGroup() {
  if (editingGroup.value) {
    updateGroup(editingGroup.value, { ...groupForm })
    toastStore.success('模型组已更新')
  } else {
    const newGroup = addGroup({ ...groupForm })
    toastStore.success('模型组已添加')
    // Switch to edit mode for the new group so we can add models
    editingGroup.value = newGroup.id
  }
}

// Model Modal Logic
const showModelModal = ref(false)
const editingModel = ref<string | null>(null)
const modelForm = reactive({ name: '', modelName: '', groupId: '', remark: '' })

function openModelModal(m?: typeof cfg.models[number]) {
  editingModel.value = m?.id ?? null
  modelForm.name = m?.name ?? ''
  modelForm.modelName = m?.modelName ?? ''
  modelForm.groupId = m?.groupId ?? (editingGroup.value || '')
  modelForm.remark = m?.remark ?? ''
  showModelModal.value = true
}

function openModelModalForCurrentGroup() {
  if (!editingGroup.value) return
  editingModel.value = null
  modelForm.name = ''
  modelForm.modelName = ''
  modelForm.groupId = editingGroup.value
  modelForm.remark = ''
  showModelModal.value = true
}

function closeModelModal() { showModelModal.value = false }

function submitModel() {
  if (!modelForm.groupId) return
  if (editingModel.value) {
    updateModel(editingModel.value, { ...modelForm })
    toastStore.success('模型已更新')
  } else {
    const created = addModel({ ...modelForm })
    if (!cfg.selectedModelId) setSelectedModel(created.id)
    toastStore.success('模型已添加')
  }
  showModelModal.value = false
}

// Delete Confirmation
const showConfirm = ref(false)
const confirmKind = ref<'group' | 'model' | null>(null)
const confirmId = ref<string>('')
const confirmName = ref<string>('')

function confirmRemoveGroup(g: any) {
  openConfirm('group', g.id, g.name)
}
function confirmRemoveModel(m: any) {
  openConfirm('model', m.id, m.name)
}

function openConfirm(kind: 'group' | 'model', id: string, name: string) {
  confirmKind.value = kind
  confirmId.value = id
  confirmName.value = name
  showConfirm.value = true
}

function closeConfirm() { showConfirm.value = false }

function doConfirmDelete() {
  if (confirmKind.value === 'group') {
    removeGroup(confirmId.value)
    toastStore.success('模型组已删除')
    if (editingGroup.value === confirmId.value) {
      closeDrawer()
    }
  } else if (confirmKind.value === 'model') {
    removeModel(confirmId.value)
    toastStore.success('模型已删除')
  }
  showConfirm.value = false
}
</script>

<style scoped>
.page-wrap { display: flex; flex-direction: column; height: 100%; background: transparent; color: var(--text); overflow: hidden; }
.topbar { 
  height: 64px; 
  display: flex; align-items: center; gap: 12px; padding: 0 24px; 
  background: transparent; 
  flex-shrink: 0;
}
.title { font-weight: 600; font-size: 18px; letter-spacing: -0.5px; }
.spacer { flex: 1; }

.icon-btn { 
  display: inline-flex; align-items: center; justify-content: center; 
  width: 36px; height: 36px; 
  border: 1px solid transparent; border-radius: var(--radius-md); 
  background: transparent; color: var(--text-secondary); 
  transition: all 0.2s ease;
  cursor: pointer;
}
.icon-btn:hover { background: var(--hover); color: var(--text); }

.content { 
  padding: 0 24px 40px; 
  overflow-y: auto; 
  /* max-width removed */
  width: 100%;
}

.grid { 
  display: grid; 
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); 
  gap: 16px; 
}

/* Group Card */
.group-card { 
  padding: 20px; 
  border: 1px solid var(--panel-border); 
  border-radius: var(--radius-lg); 
  background: var(--panel); 
  box-shadow: var(--shadow-sm); 
  display: flex; flex-direction: column; gap: 12px;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
  height: 140px; /* Fixed height for small cards */
}
.group-card:hover { 
  transform: translateY(-2px); 
  box-shadow: var(--shadow-md); 
  border-color: var(--border-hover); 
}

.group-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 4px; }
.group-title { font-weight: 600; font-size: 16px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.kv { display: flex; gap: 8px; font-size: 13px; color: var(--text-secondary); align-items: center; }
.kv span:first-child { color: var(--muted); min-width: 70px; }
.truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }

.add-card {
  align-items: center; justify-content: center;
  border-style: dashed;
  color: var(--text-secondary);
}
.add-card:hover { color: var(--accent); border-color: var(--accent); }
.add-icon { 
  width: 40px; height: 40px; 
  border-radius: 50%; background: var(--bg-secondary); 
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}

.icon { 
  display: inline-flex; align-items: center; justify-content: center; 
  width: 28px; height: 28px; 
  border-radius: var(--radius-md); 
  border: 1px solid transparent; 
  background: transparent; 
  color: var(--text-secondary); 
  transition: all 0.2s;
  cursor: pointer;
}
.icon:hover { background: var(--hover); color: var(--text); }
.icon.danger:hover { background: var(--error-bg); color: var(--danger); }

/* Drawer */
.drawer-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 900;
  backdrop-filter: blur(2px);
  animation: fadeIn 0.2s ease;
}
.drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 500px; max-width: 90vw;
  background: var(--panel);
  box-shadow: -4px 0 20px rgba(0,0,0,0.1);
  z-index: 1000;
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1);
  display: flex; flex-direction: column;
  border-left: 1px solid var(--border);
}
.drawer.open { transform: translateX(0); }

.drawer-header {
  height: 60px; padding: 0 24px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.drawer-title { font-weight: 600; font-size: 18px; }

.drawer-content {
  flex: 1; overflow-y: auto;
  padding: 24px;
  display: flex; flex-direction: column; gap: 32px;
}

.form-section h3, .models-section h3 {
  font-size: 14px; font-weight: 600; color: var(--muted); text-transform: uppercase;
  margin: 0 0 16px 0;
}

.form { display: grid; gap: 16px; }
.form label { display: grid; gap: 8px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.form input { 
  height: 40px; padding: 0 12px; 
  border: 1px solid var(--border); 
  border-radius: var(--radius-md); 
  background: var(--bg-input); 
  color: var(--text); 
  font-size: 14px; 
  transition: all 0.2s;
}
.form input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }

.drawer-actions { margin-top: 16px; }
.full-width { width: 100%; }

/* Models List in Drawer */
.models-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.add-model-btn {
  display: inline-flex; align-items: center; gap: 6px; 
  height: 28px; padding: 0 10px; 
  border-radius: var(--radius-md); 
  background: var(--bg-secondary); 
  border: 1px solid var(--border); 
  color: var(--text); font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
}
.add-model-btn:hover { background: var(--hover); border-color: var(--border-hover); }

.model-list { display: grid; gap: 10px; }
.model-item { 
  display: flex; align-items: center; justify-content: space-between; 
  padding: 12px 16px; 
  border: 1px solid var(--border); 
  border-radius: var(--radius-md); 
  background: var(--bg-input); 
  transition: all 0.2s;
}
.model-item:hover { border-color: var(--accent-glow); background: var(--panel); }
.model-info { display: flex; flex-direction: column; gap: 2px; }
.model-name { font-size: 14px; font-weight: 500; }
.model-id { font-size: 12px; color: var(--muted); }
.model-actions { display: flex; gap: 4px; }

/* Modal */
.modal-mask { 
  position: fixed; inset: 0; 
  background: var(--mask); 
  backdrop-filter: var(--blur-sm); 
  -webkit-backdrop-filter: var(--blur-sm);
  display: flex; align-items: center; justify-content: center; 
  z-index: 2000; 
  animation: fadeIn 0.2s ease;
}
.modal { 
  width: min(500px, 92vw); 
  border-radius: var(--radius-xl); 
  background: var(--panel); 
  color: var(--text); 
  box-shadow: var(--shadow-float); 
  border: 1px solid var(--panel-border); 
  padding: 24px; 
  overflow: hidden; 
  animation: slideUpFade 0.3s cubic-bezier(0.2, 0, 0, 1);
  display: flex; flex-direction: column; gap: 20px;
}
.modal-title { font-weight: 600; font-size: 18px; margin-bottom: 0; }
.modal-body { color: var(--text-secondary); font-size: 14px; line-height: 1.5; }
.modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px; }

/* Buttons */
.ghost-btn { 
  height: 36px; padding: 0 16px; 
  border-radius: var(--radius-md); 
  background: transparent; 
  border: 1px solid var(--border); 
  color: var(--text); font-size: 14px; cursor: pointer;
  transition: all 0.2s;
}
.ghost-btn:hover { background: var(--hover); }

.primary-btn { 
  height: 36px; padding: 0 16px; 
  border-radius: var(--radius-md); 
  background: var(--accent); 
  border: 0; 
  color: #fff; font-size: 14px; font-weight: 500; cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s;
}
.primary-btn:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: var(--shadow-md); }

.danger-btn { 
  height: 36px; padding: 0 16px; 
  border-radius: var(--radius-md); 
  background: var(--danger); 
  border: 0; 
  color: #fff; font-size: 14px; font-weight: 500; cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s;
}
.danger-btn:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: var(--shadow-md); }

@keyframes slideUpFade {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
