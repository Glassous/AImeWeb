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
  } else {
    addGroup({ ...groupForm })
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
  } else {
    const created = addModel({ ...modelForm })
    if (!cfg.selectedModelId) setSelectedModel(created.id)
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
  } else if (confirmKind.value === 'model') {
    removeModel(confirmId.value)
  }
  showConfirm.value = false
}


</script>

<style scoped>
.page-wrap { display: flex; flex-direction: column; height: 100%; background: var(--bg); color: var(--text); }
.topbar { height: 56px; display: flex; align-items: center; gap: 8px; padding: 0 16px; border-bottom: 1px solid var(--border); background: var(--panel); }
.title { font-weight: 600; font-size: 16px; }
.spacer { flex: 1; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 1px solid var(--btn-border); border-radius: 8px; background: var(--btn-bg); color: var(--text); }
.icon-btn:hover { background: var(--hover); }
.ghost-btn { height: 28px; padding: 0 10px; border-radius: 6px; background: var(--btn-bg); border: 1px solid var(--btn-border); color: var(--text); }
.ghost-btn:hover { background: var(--hover); }
.danger-btn { height: 28px; padding: 0 10px; border-radius: 6px; background: #e53e3e; color: white; border: 0; }

.content { padding: 16px; overflow: auto; }
.section { margin-bottom: 24px; }
.grid { display: grid; gap: 14px; }
.group-card { padding: 12px 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel); box-shadow: var(--shadow); display: grid; gap: 8px; }
.group-card:hover { background: var(--hover); }
.group-header { display: flex; align-items: center; justify-content: space-between; }
.group-title { font-weight: 600; font-size: 15px; }
.group-actions { display: flex; gap: 8px; align-items: center; }
.icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
.icon.ghost:hover { background: var(--hover); }
.icon.danger { border-color: #e53e3e33; }
.icon.danger:hover { background: #e53e3e1a; }
.kv { display: grid; grid-template-columns: 80px 1fr; gap: 6px; font-size: 12px; color: var(--muted); }
.kv .link { color: var(--muted); text-decoration: underline; }
.models { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); display: grid; gap: 8px; }
.models-header { display: flex; align-items: center; justify-content: space-between; }
.models-title { font-size: 13px; color: var(--muted); }
.add-model { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 6px; background: var(--btn-bg); border: 1px solid var(--btn-border); color: var(--text); }
.add-model:hover { background: var(--hover); }
.model-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--subtle); }
.model-name { font-size: 14px; }
.model-actions { display: flex; gap: 6px; }

.modal-mask { position: fixed; inset: 0; background: var(--mask); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { width: min(560px, 92vw); max-width: 560px; border-radius: 12px; background: var(--modal-bg); color: var(--text); box-shadow: var(--shadow); border: 1px solid var(--border); padding: 16px; overflow: hidden; }
.modal-title { font-weight: 600; margin-bottom: 10px; }
.modal-body { color: var(--text); }
.form { display: grid; gap: 10px; }
.form label { display: grid; gap: 6px; font-size: 12px; color: var(--muted); }
.form input, .form select { height: 36px; padding: 0 10px; border: 1px solid var(--btn-border); border-radius: 8px; background: var(--btn-bg); color: var(--text); max-width: 100%; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>