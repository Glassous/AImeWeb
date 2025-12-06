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
              <div class="card-desc">管理模型组、模型</div>
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
        <h2 class="section-title">本地同步</h2>
        <div class="sync-card">
          <div class="sync-main">
            <div class="sync-title">导入/导出数据</div>
            <div class="sync-desc">包含全部格式备份与恢复</div>
          </div>
          <div class="sync-actions">
            <button class="accent-btn" @click="exportJSON">导出 JSON</button>
            <button class="success-btn" @click="triggerImport">导入 JSON</button>
            <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="handleImport" />
          </div>
        </div>
      </section>


    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import { exportGlobal, parseWithCompatibility, importGlobal } from '../store/sync'

const router = useRouter()
function goBack() { router.back() }
function toModelConfig() { router.push('/settings/model') }


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