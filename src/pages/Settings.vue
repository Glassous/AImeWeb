<template>
  <div class="page-wrap">
    <div class="topbar">
      <button class="icon-btn" @click="goBack" aria-label="返回">
        <!-- left arrow -->
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div class="title">设置</div>
    </div>

    <div class="content">
      <section class="section">
        <h2 class="section-title">常规</h2>
        <div class="card-list">
          <button class="card" @click="toModelConfig" aria-label="模型配置">
            <div class="card-main">
              <div class="card-title">模型配置</div>
              <div class="card-desc">管理模型组、模型及默认选择</div>
            </div>
            <div class="card-right">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </button>
          <button class="card" @click="toUserSettings" aria-label="用户设置">
            <div class="card-main">
              <div class="card-title">用户设置</div>
              <div class="card-desc">编辑个人资料，支持云端轻量同步</div>
            </div>
            <div class="card-right">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </button>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">本地同步（全局）</h2>
        <div class="sync-card">
          <div class="sync-main">
            <div class="sync-title">导入 / 导出 全局数据</div>
            <div class="sync-desc">包含「历史记录」与「模型配置」，JSON 格式备份与恢复</div>
          </div>
          <div class="sync-actions">
            <button class="accent-btn" @click="exportJSON">导出 JSON</button>
            <button class="success-btn" @click="triggerImport">导入 JSON</button>
            <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="handleImport" />
          </div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">云端同步（阿里云 OSS）</h2>
        <div class="sync-card">
          <div class="sync-main">
            <div class="sync-title">配置与同步</div>
            <div class="sync-desc">地域与 endpoint 绑定，选择地域自动填充 endpoint；支持增量上传/下载并回退</div>
            <div class="sync-desc">
              <label class="switch">
                <input type="checkbox" v-model="autoSyncEnabled" @change="onToggleAutoSync" />
                <span>自动同步</span>
              </label>
            </div>
          </div>
          <div class="sync-actions">
            <button class="ghost-btn" @click="openOssModal" aria-label="配置 OSS" :disabled="cloud.loading">配置</button>
            <button class="accent-btn" @click="exportToCloud" :disabled="cloud.loading">导出至云端</button>
            <button class="success-btn" @click="importFromCloud" :disabled="cloud.loading">从云端导入</button>
          </div>
        </div>
      </section>

      <!-- 配置弹窗 -->
      <div v-if="showOssModal" class="modal-mask" @click.self="closeOssModal">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">OSS 配置</div>
            <button class="icon-btn" @click="closeOssModal" aria-label="关闭">×</button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <label>地域</label>
              <select v-model="form.region" @change="onRegionChange">
                <option v-for="r in REGIONS" :key="r.id" :value="r.id">{{ r.name }}（{{ r.id }}）</option>
              </select>
            </div>
            <div class="form-row">
              <label>Endpoint</label>
              <input type="text" v-model="form.endpoint" placeholder="自动填充，可手动修改" />
            </div>
            <div class="form-row">
              <label>Bucket 名称</label>
              <input type="text" v-model="form.bucket" placeholder="示例：examplebucket" />
            </div>
            <div class="form-row">
              <label>AccessKeyId</label>
              <input type="text" v-model="form.accessKeyId" />
            </div>
            <div class="form-row">
              <label>AccessKeySecret</label>
              <input type="password" v-model="form.accessKeySecret" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="accent-btn" @click="saveOss">保存</button>
            <button class="ghost-btn" @click="closeOssModal">取消</button>
          </div>
        </div>
      </div>

      <!-- 云端同步弹窗 -->
      <div v-if="cloudModal.open" class="modal-mask" @click.self="noop">
        <div class="modal cloud-modal">
          <div class="modal-header">
            <div class="modal-title">{{ cloudModal.title }}</div>
          </div>
          <div class="modal-body">
            <div class="progress-top">
              <span>{{ cloud.mode === 'upload' ? '正在上传至云端' : '正在从云端下载' }}</span>
              <span>{{ Math.round(cloud.percent) }}%</span>
            </div>
            <div class="progress">
              <div class="progress-bar" :style="{ width: cloud.percent + '%' }"></div>
            </div>
            <div class="progress-label">{{ cloud.label }}</div>
            <div v-if="cloudModal.status === 'done' || cloudModal.status === 'error'" class="result-row" role="status">
              <span :class="cloudModal.ok ? 'result-ok' : 'result-error'">{{ cloudModal.ok ? '完成' : '失败' }}</span>
              <span class="result-msg">{{ cloudModal.message }}</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="ghost-btn" :disabled="cloud.loading" @click="closeCloudModal">{{ cloud.loading ? '进行中…' : '关闭' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, reactive, onMounted } from 'vue'
import { exportGlobal, parseWithCompatibility, importGlobal } from '../store/sync'
import { ossConfig, saveOssConfig } from '../store/oss'
import { REGIONS, endpointForRegion, uploadIncremental, downloadAndImport, autoSyncEnabled, saveAutoSyncEnabled } from '../store/oss'
const router = useRouter()
function goBack() { router.back() }
function toModelConfig() { router.push('/settings/model') }
function toUserSettings() { router.push('/settings/user') }

const fileInput = ref<HTMLInputElement | null>(null)
function triggerImport() { fileInput.value?.click() }
function handleImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  file.text().then(text => {
    try {
      const parsed = parseWithCompatibility(text)
      if (!parsed.ok) {
        alert(parsed.error || 'JSON 解析失败')
      } else {
        const res = importGlobal(parsed.data)
        if (res.ok) {
          const what = res.applied.map(x => (x === 'modelConfig' ? '模型配置' : x === 'chatHistories' ? '历史记录' : x)).join('、')
          alert('导入成功（' + what + '）')
        } else {
          alert('导入失败：' + (res.error ?? '未知错误'))
        }
      }
    } finally {
      input.value = ''
    }
  })
}

function exportJSON() {
  const data = exportGlobal()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date().toISOString().replace(/[:]/g, '-')
  a.href = url
  a.download = `aime_backup_global_${ts}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// 云端配置弹窗与同步操作
const showOssModal = ref(false)
function openOssModal() {
  // 初始填充当前配置
  form.region = ossConfig.value.region
  form.endpoint = ossConfig.value.endpoint
  form.bucket = ossConfig.value.bucket
  form.accessKeyId = ossConfig.value.accessKeyId
  form.accessKeySecret = ossConfig.value.accessKeySecret
  showOssModal.value = true
}
function closeOssModal() { showOssModal.value = false }

const form = reactive({
  region: ossConfig.value.region,
  endpoint: ossConfig.value.endpoint,
  bucket: ossConfig.value.bucket,
  accessKeyId: ossConfig.value.accessKeyId,
  accessKeySecret: ossConfig.value.accessKeySecret,
})
function onRegionChange() {
  form.endpoint = endpointForRegion(form.region)
}
function saveOss() {
  ossConfig.value = { ...form }
  saveOssConfig()
  alert('OSS 配置已保存')
  closeOssModal()
}

// 云端同步弹窗与状态
const cloud = reactive({ loading: false, mode: '' as 'upload' | 'download' | '', percent: 0, label: '' })
const cloudModal = reactive({ open: false, title: '云端同步', status: 'idle' as 'idle' | 'running' | 'done' | 'error', ok: false, message: '' })
function openCloudModal(mode: 'upload' | 'download') {
  cloudModal.open = true
  cloud.loading = true
  cloud.mode = mode
  cloud.percent = 0
  cloud.label = mode === 'upload' ? '准备增量上传…' : '准备增量下载…'
  cloudModal.title = mode === 'upload' ? '云端上传' : '云端下载'
  cloudModal.status = 'running'
  cloudModal.ok = false
  cloudModal.message = ''
}
function closeCloudModal() { cloudModal.open = false }
function noop() {}

function onToggleAutoSync() {
  // 模板会自动解包 ref；此处做一次兼容处理
  const enabled = (autoSyncEnabled as any).value !== undefined ? (autoSyncEnabled as any).value : autoSyncEnabled
  saveAutoSyncEnabled(!!enabled)
}
// 注意：自动下载仅在主页触发，设置页不触发

async function exportToCloud() {
  openCloudModal('upload')
  try {
    const res = await uploadIncremental(p => {
      cloud.percent = p.percent
      cloud.label = p.label
    })
    cloud.percent = 100
    cloud.label = '上传完成'
    cloudModal.status = res.ok ? 'done' : 'error'
    cloudModal.ok = !!res.ok
    cloudModal.message = res.message
  } finally {
    cloud.loading = false
    cloud.mode = ''
  }
}

async function importFromCloud() {
  openCloudModal('download')
  try {
    const res = await downloadAndImport(p => {
      cloud.percent = p.percent
      cloud.label = p.label
    })
    cloud.percent = 100
    cloud.label = '下载并导入完成'
    cloudModal.status = res.ok ? 'done' : 'error'
    cloudModal.ok = !!res.ok
    cloudModal.message = res.message
  } finally {
    cloud.loading = false
    cloud.mode = ''
  }
}
</script>

<style scoped>
.page-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  color: var(--text);
}
.topbar {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--btn-border);
  border-radius: 8px;
  background: var(--btn-bg);
  color: var(--text);
}
.icon-btn:hover { background: var(--hover); }
.title { font-weight: 600; font-size: 16px; }

.content { padding: 16px; overflow: auto; }
.section { margin-bottom: 24px; }
.section-title { font-size: 13px; color: var(--muted); margin-bottom: 8px; }

.card-list { display: grid; gap: 12px; }
.card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow);
}
.card:hover { background: var(--hover); }
.card-title { font-weight: 600; }
.card-desc { font-size: 12px; color: var(--muted); }
.card-main { display: grid; gap: 4px; text-align: left; }
.card-right { color: var(--muted); display: flex; align-items: center; }

.sync-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow);
}
.sync-card:hover { background: var(--hover); }
.sync-main { display: grid; gap: 4px; text-align: left; }
.sync-title { font-weight: 600; }
.sync-desc { font-size: 12px; color: var(--muted); }
.sync-actions { display: flex; gap: 8px; align-items: center; }
.accent-btn { height: 32px; padding: 0 12px; border-radius: 8px; background: var(--accent); color: #fff; border: 0; }
.accent-btn:hover { filter: brightness(1.05); }
.success-btn { height: 32px; padding: 0 12px; border-radius: 8px; background: var(--success); color: #fff; border: 0; }
.success-btn:hover { filter: brightness(1.05); }
.ghost-btn { height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
.ghost-btn:hover { background: var(--hover); }
.hidden { display: none; }

/* 进度条样式 */
.progress-wrap { margin-top: 10px; display: grid; gap: 6px; }
.progress-top { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted); }
.progress { height: 8px; border-radius: 999px; background: var(--btn-bg); border: 1px solid var(--btn-border); overflow: hidden; }
.progress-bar { height: 100%; background: var(--accent); transition: width 0.2s ease; }
.progress-label { font-size: 12px; color: var(--muted); }

/* 云端弹窗附加样式 */
.cloud-modal .modal-body { display: grid; gap: 8px; }
.result-row { display: flex; gap: 8px; align-items: center; font-size: 12px; }
.result-ok { color: var(--success); font-weight: 600; }
.result-error { color: var(--danger, #d23); font-weight: 600; }

/* 弹窗样式 */
.modal-mask { position: fixed; inset: 0; background: var(--mask); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal { width: 560px; max-width: calc(100% - 24px); background: var(--modal-bg); color: var(--text); border-radius: 12px; box-shadow: var(--shadow); border: 1px solid var(--border); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.modal-title { font-weight: 600; }
.modal-body { padding: 12px 16px; display: grid; gap: 10px; }
.form-row { display: grid; gap: 6px; }
.form-row label { font-size: 12px; color: var(--muted); }
.form-row input, .form-row select { height: 32px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); padding: 0 8px; }
.modal-footer { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 16px; border-top: 1px solid var(--border); }

/* 自动同步开关 */
.switch { display: inline-flex; align-items: center; gap: 6px; }
.switch input { width: 16px; height: 16px; }
</style>