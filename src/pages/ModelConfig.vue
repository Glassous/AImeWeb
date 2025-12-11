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
      <button class="icon-btn" @click="openGroupModal()" aria-label="新增模型组" title="新增模型组">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>

    <div class="content">
      <section class="section">
        <div class="grid">
          <div v-for="g in cfg.modelGroups" :key="g.id" class="group-card">
            <div class="group-header">
              <div class="group-title">{{ g.name }}</div>
              <div class="group-actions">
                <button class="icon ghost" @click="toggleExpand(g.id)" :title="isExpanded(g.id) ? '收起' : '展开'">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path v-if="isExpanded(g.id)" d="M6 15l6-6 6 6" />
                    <path v-else d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <button class="icon ghost" @click="openGroupModal(g)" title="编辑">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6b5bce" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
                <button class="icon danger" @click="confirmRemoveGroup(g)" title="删除">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#e53e3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="kv"><span>Base URL:</span><span>{{ g.baseUrl }}</span></div>
            <div class="kv"><span>官网:</span><span><a :href="g.providerUrl" target="_blank" rel="noreferrer" class="link">{{ g.providerUrl }}</a></span></div>
            <div class="kv"><span>模型数量:</span><span>{{ modelsOf(g.id).length }}</span></div>

            <div v-if="isExpanded(g.id)" class="models">
              <div class="models-header">
                <div class="models-title">模型列表</div>
                <button class="add-model" @click="openModelModalForGroup(g.id)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  添加模型
                </button>
              </div>
              <div class="model-item" v-for="m in modelsOf(g.id)" :key="m.id">
                <div class="model-name">{{ m.name }}</div>
                <div class="model-actions">
                  <button class="icon ghost" @click="openModelModal(m)" title="编辑">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6b5bce" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                  </button>
                  <button class="icon danger" @click="confirmRemoveModel(m)" title="删除">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#e53e3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="showGroupModal" class="modal-mask" @click.self="closeGroupModal">
      <div class="modal">
        <div class="modal-title">{{ editingGroup ? '编辑模型组' : '新增模型组' }}</div>
        <div class="form">
          <label>名称<input v-model="groupForm.name" /></label>
          <label>Base URL<input v-model="groupForm.baseUrl" /></label>
          <label>API Key<input v-model="groupForm.apiKey" /></label>
          <label>官网地址<input v-model="groupForm.providerUrl" /></label>
        </div>
        <div class="modal-actions">
          <button class="ghost-btn" @click="closeGroupModal">取消</button>
          <button class="primary-btn" @click="submitGroup">确认</button>
        </div>
      </div>
    </div>

    <div v-if="showModelModal" class="modal-mask" @click.self="closeModelModal">
      <div class="modal">
        <div class="modal-title">{{ editingModel ? '编辑模型' : '新增模型' }}</div>
        <div class="form">
          <label>名称<input v-model="modelForm.name" /></label>
          <label>Model<input v-model="modelForm.modelName" /></label>
          <label>备注<input v-model="modelForm.remark" /></label>
        </div>
        <div class="modal-actions">
          <button class="ghost-btn" @click="closeModelModal">取消</button>
          <button class="primary-btn" @click="submitModel">确认</button>
        </div>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <div v-if="showConfirm" class="modal-mask" @click.self="closeConfirm">
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
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { modelConfig, addGroup, updateGroup, removeGroup, addModel, updateModel, removeModel, getModelsByGroup, setSelectedModel } from '../store/modelConfig'
import { toastStore } from '../store/toast'


const router = useRouter()
const cfg = modelConfig.value

function goBack() { router.back() }

// 展开/折叠
const expanded = ref<Set<string>>(new Set())
function isExpanded(id: string) { return expanded.value.has(id) }
function toggleExpand(id: string) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  expanded.value = s
}
function modelsOf(groupId: string) { return getModelsByGroup(groupId) }

const showGroupModal = ref(false)
const editingGroup = ref<string | null>(null)
const groupForm = reactive({ name: '', baseUrl: '', apiKey: '', providerUrl: '' })
function openGroupModal(g?: typeof cfg.modelGroups[number]) {
  editingGroup.value = g?.id ?? null
  groupForm.name = g?.name ?? ''
  groupForm.baseUrl = g?.baseUrl ?? ''
  groupForm.apiKey = g?.apiKey ?? ''
  groupForm.providerUrl = g?.providerUrl ?? ''
  showGroupModal.value = true
}
function closeGroupModal() { showGroupModal.value = false }
function submitGroup() {
  if (editingGroup.value) {
    updateGroup(editingGroup.value, { ...groupForm })
    toastStore.success('模型组已更新')
  } else {
    addGroup({ ...groupForm })
    toastStore.success('模型组已添加')
  }
  showGroupModal.value = false
}

const showModelModal = ref(false)
const editingModel = ref<string | null>(null)
const modelForm = reactive({ name: '', modelName: '', groupId: '', remark: '' })
function openModelModal(m?: typeof cfg.models[number]) {
  editingModel.value = m?.id ?? null
  modelForm.name = m?.name ?? ''
  modelForm.modelName = m?.modelName ?? ''
  modelForm.groupId = m?.groupId ?? (cfg.modelGroups[0]?.id ?? '')
  modelForm.remark = m?.remark ?? ''
  showModelModal.value = true
}
function openModelModalForGroup(groupId: string) {
  editingModel.value = null
  modelForm.name = ''
  modelForm.modelName = ''
  modelForm.groupId = groupId
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

function confirmRemoveGroup(g: any) {
  openConfirm('group', g.id, g.name)
}
function confirmRemoveModel(m: any) {
  openConfirm('model', m.id, m.name)
}

// 删除确认弹窗状态
const showConfirm = ref(false)
const confirmKind = ref<'group' | 'model' | null>(null)
const confirmId = ref<string>('')
const confirmName = ref<string>('')
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
  } else if (confirmKind.value === 'model') {
    removeModel(confirmId.value)
    toastStore.success('模型已删除')
  }
  showConfirm.value = false
}


</script>

<style scoped>
.page-wrap { display: flex; flex-direction: column; height: 100%; background: transparent; color: var(--text); }
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
}
.icon-btn:hover { background: var(--hover); color: var(--text); }

.content { 
  padding: 0 24px 40px; 
  overflow-y: auto; 
  max-width: 900px; 
  margin: 0 auto; 
  width: 100%;
}
.section { margin-bottom: 24px; animation: slideUp 0.4s ease backwards; }
.grid { display: grid; gap: 16px; }

/* Group Card */
.group-card { 
  padding: 20px 24px; 
  border: 1px solid var(--panel-border); 
  border-radius: var(--radius-lg); 
  background: var(--panel); 
  box-shadow: var(--shadow-sm); 
  display: flex; flex-direction: column; gap: 12px;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.group-card:hover { 
  transform: translateY(-2px); 
  box-shadow: var(--shadow-md); 
  border-color: var(--border-hover); 
}

.group-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 4px; }
.group-title { font-weight: 600; font-size: 16px; color: var(--text); }
.group-actions { display: flex; gap: 8px; align-items: center; }

.icon { 
  display: inline-flex; align-items: center; justify-content: center; 
  width: 32px; height: 32px; 
  border-radius: var(--radius-md); 
  border: 1px solid transparent; 
  background: transparent; 
  color: var(--text-secondary); 
  transition: all 0.2s;
  cursor: pointer;
}
.icon:hover { background: var(--hover); color: var(--text); }
.icon.danger:hover { background: var(--error-bg); color: var(--danger); }

.kv { display: grid; grid-template-columns: 90px 1fr; gap: 8px; font-size: 13px; color: var(--text-secondary); align-items: center; }
.kv span:first-child { color: var(--muted); }
.kv .link { color: var(--accent); text-decoration: none; transition: opacity 0.2s; }
.kv .link:hover { opacity: 0.8; text-decoration: underline; }

/* Models List */
.models { 
  margin-top: 12px; padding-top: 16px; 
  border-top: 1px dashed var(--border); 
  display: grid; gap: 10px; 
  animation: fadeIn 0.3s ease;
}
.models-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.models-title { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; }

.add-model { 
  display: inline-flex; align-items: center; gap: 6px; 
  height: 32px; padding: 0 12px; 
  border-radius: var(--radius-md); 
  background: var(--bg-secondary); 
  border: 1px solid var(--border); 
  color: var(--text); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
}
.add-model:hover { background: var(--hover); border-color: var(--border-hover); }

.model-item { 
  display: flex; align-items: center; justify-content: space-between; 
  padding: 10px 14px; 
  border: 1px solid var(--border); 
  border-radius: var(--radius-md); 
  background: var(--bg-input); 
  transition: all 0.2s;
}
.model-item:hover { border-color: var(--accent-glow); background: var(--panel); }
.model-name { font-size: 14px; font-weight: 500; }
.model-actions { display: flex; gap: 4px; }

/* Modal */
.modal-mask { 
  position: fixed; inset: 0; 
  background: var(--mask); 
  backdrop-filter: var(--blur-sm); 
  -webkit-backdrop-filter: var(--blur-sm);
  display: flex; align-items: center; justify-content: center; 
  z-index: 1000; 
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

.form { display: grid; gap: 16px; }
.form label { display: grid; gap: 8px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.form input, .form select { 
  height: 40px; padding: 0 12px; 
  border: 1px solid var(--border); 
  border-radius: var(--radius-md); 
  background: var(--bg-input); 
  color: var(--text); 
  font-size: 14px; 
  transition: all 0.2s;
}
.form input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }

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

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slideUpFade {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>