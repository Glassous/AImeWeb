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
      <!-- 用户认证区域 -->
      <section class="section">
        <h2 class="section-title">账户</h2>
        <div v-if="!isAuthenticated" class="auth-card">
          <div class="auth-main">
            <div class="auth-title">登录/注册</div>
            <div class="auth-desc">登录后可启用云端同步功能</div>
          </div>
          <div class="auth-actions">
            <button class="accent-btn" @click="openAuthModal('login')">登录</button>
            <button class="success-btn" @click="openAuthModal('register')">注册</button>
          </div>
        </div>
        <div v-else class="auth-card">
          <div class="auth-main">
            <div class="auth-title">已登录</div>
            <div class="auth-desc">{{ userEmail }}</div>
          </div>
          <div class="auth-actions">
            <button class="ghost-btn" @click="logoutHandler">退出登录</button>
          </div>
        </div>
      </section>

      <!-- 常规设置 -->
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

      <!-- 本地同步 -->
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

      <!-- 云端同步 -->
      <section v-if="isAuthenticated" class="section">
        <h2 class="section-title">云端同步</h2>
        <div class="cloud-sync-card">
          <div class="cloud-sync-main">
            <div class="cloud-sync-title">同步状态</div>
            <div class="cloud-sync-desc">
              <span v-if="syncStatus === 'idle'">就绪</span>
              <span v-else-if="syncStatus === 'syncing'">同步中...</span>
              <span v-else-if="syncStatus === 'success'">同步成功</span>
              <span v-else-if="syncStatus === 'failed'" class="sync-error">同步失败</span>
              <span v-if="lastSynced">，上次同步：{{ formatLastSynced(lastSynced) }}</span>
            </div>
          </div>
          <div class="cloud-sync-actions">
            <button 
              class="success-btn" 
              @click="syncNow" 
              :disabled="syncStatus === 'syncing'"
            >
              {{ syncStatus === 'syncing' ? '同步中...' : '立即同步' }}
            </button>
          </div>
        </div>
        
        <!-- 同步进度条 -->
        <div v-if="syncStatus === 'syncing'" class="progress-wrap">
          <div class="progress-top">
            <span>同步进度</span>
            <span>{{ syncProgress }}%</span>
          </div>
          <div class="progress">
            <div class="progress-bar" :style="{ width: `${syncProgress}%` }"></div>
          </div>
        </div>
        
        <!-- 同步错误信息 -->
        <div v-if="syncError" class="sync-error-message">
          <span class="error-icon">⚠️</span>
          <span>{{ syncError }}</span>
        </div>
      </section>
    </div>

    <!-- 认证模态框 -->
    <div v-if="showAuthModal" class="modal-mask">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">{{ authModalType === 'login' ? '登录' : authModalType === 'register' ? '注册' : '重置密码' }}</div>
          <button class="icon-btn" @click="closeAuthModal" aria-label="关闭">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label for="email">邮箱</label>
            <input 
              id="email" 
              v-model="authForm.email" 
              type="email" 
              placeholder="请输入邮箱" 
              :disabled="isAuthLoading"
            />
          </div>
          
          <!-- 登录表单 -->
          <template v-if="authModalType === 'login'">
            <div class="form-row">
              <label for="password">密码</label>
              <input 
                id="password" 
                v-model="authForm.password" 
                type="password" 
                placeholder="请输入密码" 
                :disabled="isAuthLoading"
              />
            </div>
          </template>
          
          <!-- 注册表单 -->
          <template v-else-if="authModalType === 'register'">
            <div class="form-row">
              <label for="password">密码</label>
              <input 
                id="password" 
                v-model="authForm.password" 
                type="password" 
                placeholder="请输入密码（只能包含英文大小写、数字和符号）" 
                :disabled="isAuthLoading"
                @input="validatePasswordInput"
              />
              <div v-if="passwordError" class="error-message">{{ passwordError }}</div>
            </div>
            <div class="form-row">
              <label for="question">安全问题</label>
              <input 
                id="question" 
                v-model="authForm.question" 
                type="text" 
                placeholder="请输入安全问题" 
                :disabled="isAuthLoading"
              />
            </div>
            <div class="form-row">
              <label for="answer">安全答案</label>
              <input 
                id="answer" 
                v-model="authForm.answer" 
                type="text" 
                placeholder="请输入安全答案" 
                :disabled="isAuthLoading"
              />
            </div>
          </template>
          
          <!-- 密码重置（通过邮箱） -->
          <template v-else-if="authModalType === 'reset'">
            <div class="form-row">
              <p>我们将向您的邮箱发送密码重置链接</p>
            </div>
          </template>
          
          <!-- 密码重置（通过安全问题） -->
          <template v-else-if="authModalType === 'reset_with_answer'">
            <div class="form-row">
              <label for="answer">安全答案</label>
              <input 
                id="answer" 
                v-model="authForm.answer" 
                type="text" 
                placeholder="请输入安全答案" 
                :disabled="isAuthLoading"
              />
            </div>
            <div class="form-row">
              <label for="newPassword">新密码</label>
              <input 
                id="newPassword" 
                v-model="authForm.newPassword" 
                type="password" 
                placeholder="请输入新密码（只能包含英文大小写、数字和符号）" 
                :disabled="isAuthLoading"
                @input="validateNewPasswordInput"
              />
              <div v-if="passwordError" class="error-message">{{ passwordError }}</div>
            </div>
          </template>
          
          <div v-if="authError" class="error-message">{{ authError }}</div>
        </div>
        <div class="modal-footer">
          <button 
            class="accent-btn" 
            @click="submitAuthForm" 
            :disabled="isAuthLoading"
          >
            {{ isAuthLoading ? '处理中...' : 
               (authModalType === 'login' ? '登录' : 
                authModalType === 'register' ? '注册' : 
                authModalType === 'reset' ? '发送重置邮件' : 
                '重置密码') }}
          </button>
          
          <div class="auth-links">
            <template v-if="authModalType === 'login'">
              <span>没有账号？</span>
              <button class="link-btn" @click="switchAuthType('register')">立即注册</button>
              <span class="divider">|</span>
              <button class="link-btn" @click="switchAuthType('reset')">忘记密码？</button>
            </template>
            <template v-else-if="authModalType === 'register'">
              <span>已有账号？</span>
              <button class="link-btn" @click="switchAuthType('login')">立即登录</button>
            </template>
            <template v-else-if="authModalType === 'reset'">
              <span>返回</span>
              <button class="link-btn" @click="switchAuthType('login')">登录</button>
              <span class="divider">|</span>
              <button class="link-btn" @click="switchAuthType('reset_with_answer')">通过安全问题重置</button>
            </template>
            <template v-else-if="authModalType === 'reset_with_answer'">
              <span>返回</span>
              <button class="link-btn" @click="switchAuthType('login')">登录</button>
              <span class="divider">|</span>
              <button class="link-btn" @click="switchAuthType('reset')">通过邮箱重置</button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, computed } from 'vue'
import { exportGlobal, parseWithCompatibility, importGlobal, syncState, syncWithCloud } from '../store/sync'
import { authState, login, register, resetPasswordWithAnswer, validatePassword, logout } from '../store/auth'

const router = useRouter()
function goBack() { router.back() }
function toModelConfig() { router.push('/settings/model') }

// 认证相关状态
const showAuthModal = ref(false)
const authModalType = ref<'login' | 'register' | 'reset' | 'reset_with_answer'>('login')
const authForm = ref({
  email: '',
  password: '',
  question: '',
  answer: '',
  newPassword: ''
})
const authError = ref('')
const isAuthLoading = ref(false)
const passwordError = ref('')

// 计算属性
const isAuthenticated = computed(() => authState.value.isAuthenticated)
const userEmail = computed(() => authState.value.user?.email || '')
const syncStatus = computed(() => syncState.value.status as string)
const syncProgress = computed(() => syncState.value.progress)
const syncError = computed(() => syncState.value.error)
const lastSynced = computed(() => syncState.value.lastSynced)

// 认证模态框控制
function openAuthModal(type: 'login' | 'register' | 'reset' | 'reset_with_answer') {
  authModalType.value = type
  showAuthModal.value = true
  authError.value = ''
  passwordError.value = ''
}

function closeAuthModal() {
  showAuthModal.value = false
  authForm.value = { email: '', password: '', question: '', answer: '', newPassword: '' }
  authError.value = ''
  passwordError.value = ''
}

function switchAuthType(type: 'login' | 'register' | 'reset' | 'reset_with_answer') {
  authModalType.value = type
  authError.value = ''
  passwordError.value = ''
}

// 密码验证
function validatePasswordInput() {
  const validation = validatePassword(authForm.value.password)
  passwordError.value = validation.message || ''
}

function validateNewPasswordInput() {
  const validation = validatePassword(authForm.value.newPassword)
  passwordError.value = validation.message || ''
}

// 认证表单提交
async function submitAuthForm() {
  isAuthLoading.value = true
  authError.value = ''
  passwordError.value = ''
  
  try {
    let result
    
    if (authModalType.value === 'login') {
      // 登录
      result = await login(authForm.value.email, authForm.value.password)
    } 
    else if (authModalType.value === 'register') {
      // 注册
      // 验证必填字段
      if (!authForm.value.question.trim()) {
        authError.value = '请输入安全问题'
        return
      }
      if (!authForm.value.answer.trim()) {
        authError.value = '请输入安全答案'
        return
      }
      
      result = await register(
        authForm.value.email,
        authForm.value.password,
        authForm.value.question,
        authForm.value.answer
      )
    } 
    else if (authModalType.value === 'reset') {
      // 通过邮箱重置密码已移除，只支持通过安全问题重置
      authError.value = '请使用安全问题重置密码'
      return
    } 
    else if (authModalType.value === 'reset_with_answer') {
      // 通过安全问题重置密码
      // 验证必填字段
      if (!authForm.value.answer.trim()) {
        authError.value = '请输入安全答案'
        return
      }
      if (!authForm.value.newPassword.trim()) {
        authError.value = '请输入新密码'
        return
      }
      
      result = await resetPasswordWithAnswer(
        authForm.value.email,
        authForm.value.answer,
        authForm.value.newPassword
      )
      
      if (result.success) {
        alert('密码重置成功，请重新登录')
        switchAuthType('login')
        return
      }
    }
    
    if (result && !result.success) {
      authError.value = result.error || '操作失败'
    } else {
      closeAuthModal()
    }
  } catch (error) {
    authError.value = (error as Error).message
  } finally {
    isAuthLoading.value = false
  }
}

// 退出登录
async function logoutHandler() {
  await logout()
}

// 立即同步
async function syncNow() {
  await syncWithCloud()
}

// 格式化上次同步时间
function formatLastSynced(timestamp: number) {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

// 本地同步功能
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

// 绑定logout函数
defineExpose({
  logout: logoutHandler
})
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

/* 认证样式 */
.auth-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow);
}
.auth-card:hover { background: var(--hover); }
.auth-main { display: grid; gap: 4px; text-align: left; }
.auth-title { font-weight: 600; }
.auth-desc { font-size: 12px; color: var(--muted); }
.auth-actions { display: flex; gap: 8px; align-items: center; }

/* 本地同步样式 */
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

/* 云端同步样式 */
.cloud-sync-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow);
}
.cloud-sync-card:hover { background: var(--hover); }
.cloud-sync-main { display: grid; gap: 4px; text-align: left; }
.cloud-sync-title { font-weight: 600; }
.cloud-sync-desc { font-size: 12px; color: var(--muted); }
.cloud-sync-actions { display: flex; gap: 8px; align-items: center; }
.sync-error {
  color: var(--danger, #d23);
}
.sync-error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-top: 8px;
  background: var(--error-bg, rgba(255, 0, 0, 0.1));
  border: 1px solid var(--error-border, rgba(255, 0, 0, 0.3));
  border-radius: 8px;
  color: var(--danger, #d23);
  font-size: 12px;
}
.error-icon {
  font-size: 14px;
}

/* 按钮样式 */
.accent-btn { height: 32px; padding: 0 12px; border-radius: 8px; background: var(--accent); color: #fff; border: 0; cursor: pointer; }
.accent-btn:hover { filter: brightness(1.05); }
.accent-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.success-btn { height: 32px; padding: 0 12px; border-radius: 8px; background: var(--success); color: #fff; border: 0; cursor: pointer; }
.success-btn:hover { filter: brightness(1.05); }
.success-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.ghost-btn { height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); cursor: pointer; }
.ghost-btn:hover { background: var(--hover); }
.link-btn { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font-size: 14px; }
.link-btn:hover { text-decoration: underline; }

/* 表单样式 */
.hidden { display: none; }
.auth-links {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
  font-size: 14px;
  color: var(--muted);
}
.divider {
  color: var(--border);
}
.error-message {
  color: var(--danger, #d23);
  font-size: 12px;
  margin-top: 4px;
}

/* 进度条样式 */
.progress-wrap { margin-top: 10px; display: grid; gap: 6px; }
.progress-top { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted); }
.progress { height: 8px; border-radius: 999px; background: var(--btn-bg); border: 1px solid var(--btn-border); overflow: hidden; }
.progress-bar { height: 100%; background: var(--accent); transition: width 0.2s ease; }
.progress-label { font-size: 12px; color: var(--muted); }

/* 弹窗样式 */
.modal-mask { position: fixed; inset: 0; background: var(--mask); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal { width: 560px; max-width: calc(100% - 24px); background: var(--modal-bg); color: var(--text); border-radius: 12px; box-shadow: var(--shadow); border: 1px solid var(--border); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.modal-title { font-weight: 600; }
.modal-body { padding: 12px 16px; display: grid; gap: 10px; }
.form-row { display: grid; gap: 6px; }
.form-row label { font-size: 12px; color: var(--muted); }
.form-row input, .form-row select { height: 32px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); padding: 0 8px; }
.modal-footer { display: flex; align-items: center; gap: 8px; justify-content: flex-end; padding: 12px 16px; border-top: 1px solid var(--border); }

/* 自动同步开关 */
.switch { display: inline-flex; align-items: center; gap: 6px; }
.switch input { width: 16px; height: 16px; }
</style>