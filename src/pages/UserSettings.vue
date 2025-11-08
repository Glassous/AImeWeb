<template>
  <div class="page-wrap">
    <div class="topbar">
      <button class="ghost-btn" @click="goBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div class="title">用户设置</div>
      <div class="spacer"></div>
      <button class="ghost-btn" @click="clear">清空</button>
      <button class="success-btn" @click="uploadProfile">上传用户资料</button>
    </div>

    <div class="content">
      <div class="form-grid">
        <div class="form-row"><label>昵称</label><input v-model="form.nickname" /></div>
        <div class="form-row"><label>城市</label><input v-model="form.city" /></div>
        <div class="form-row"><label>语言偏好</label><input v-model="form.preferredLanguage" placeholder="例：zh-CN" /></div>
        <div class="form-row"><label>年龄</label><input v-model.number="form.age" type="number" min="0" /></div>
        <div class="form-row"><label>邮箱</label><input v-model="form.email" /></div>
        <div class="form-row"><label>电话</label><input v-model="form.phone" /></div>
        <div class="form-row"><label>性别</label><input v-model="form.gender" /></div>
        <div class="form-row"><label>生日</label><input v-model="form.birthday" placeholder="1997-05-12" /></div>
        <div class="form-row"><label>职业</label><input v-model="form.occupation" /></div>
        <div class="form-row"><label>公司</label><input v-model="form.company" /></div>
        <div class="form-row"><label>时区</label><input v-model="form.timezone" placeholder="例：Asia/Shanghai" /></div>
        <div class="form-row"><label>网站</label><input v-model="form.website" /></div>
        <div class="form-row"><label>地址</label><input v-model="form.address" /></div>
        <div class="form-row"><label>兴趣</label><input v-model="form.hobbies" /></div>
        <div class="form-row"><label>个性签名/简介</label><input v-model="form.bio" /></div>
        <div class="form-row"><label>头像 URL</label><input v-model="form.avatarUrl" /></div>

        <div class="form-row full">
          <label>自定义字段</label>
          <div class="custom-list">
            <div class="kv-row" v-for="(item, i) in customList" :key="i">
              <input v-model="item.key" placeholder="键" />
              <span class="sep">=</span>
              <input v-model="item.value" placeholder="值" />
              <button class="ghost-btn small" @click="removeCustom(i)">删除</button>
            </div>
            <button class="ghost-btn" @click="addCustom">新增字段</button>
            <div class="hint">键留空的条目会被忽略；编辑即自动保存</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { userProfile, setUserProfile, clearUserProfile } from '../store/userProfile'
import { uploadUserProfileOnly, autoSyncEnabled } from '../store/oss'

const router = useRouter()
function goBack() { router.back() }

const form = reactive({
  nickname: userProfile.value.nickname || '',
  city: userProfile.value.city || '',
  preferredLanguage: userProfile.value.preferredLanguage || '',
  age: userProfile.value.age ?? null,
  email: userProfile.value.email || '',
  phone: userProfile.value.phone || '',
  gender: userProfile.value.gender || '',
  birthday: userProfile.value.birthday || '',
  occupation: userProfile.value.occupation || '',
  company: userProfile.value.company || '',
  timezone: userProfile.value.timezone || '',
  website: userProfile.value.website || '',
  address: userProfile.value.address || '',
  hobbies: userProfile.value.hobbies || '',
  bio: userProfile.value.bio || '',
  avatarUrl: userProfile.value.avatarUrl || '',
})

// 图形化自定义字段与热保存
type KV = { key: string; value: string }
const customList = reactive<KV[]>(
  userProfile.value.customFields
    ? Object.entries(userProfile.value.customFields).map(([k, v]) => ({ key: String(k), value: String(v) }))
    : []
)

function toCustomMap(): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const { key, value } of customList) {
    const k = String(key || '').trim()
    if (!k) continue
    out[k] = String(value ?? '')
  }
  return Object.keys(out).length ? out : undefined
}

let saveTimer: number | null = null
function queueSave() {
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(doSave, 250)
}

function doSave() {
  setUserProfile({
    nickname: form.nickname || undefined,
    city: form.city || undefined,
    preferredLanguage: form.preferredLanguage || undefined,
    age: form.age ?? undefined,
    email: form.email || undefined,
    phone: form.phone || undefined,
    gender: form.gender || undefined,
    birthday: form.birthday || undefined,
    occupation: form.occupation || undefined,
    company: form.company || undefined,
    timezone: form.timezone || undefined,
    website: form.website || undefined,
    address: form.address || undefined,
    hobbies: form.hobbies || undefined,
    bio: form.bio || undefined,
    avatarUrl: form.avatarUrl || undefined,
    customFields: toCustomMap(),
  })
  // 自动同步：编辑完成一段时间后上传用户资料
  try {
    const enabled = (autoSyncEnabled as any).value !== undefined ? (autoSyncEnabled as any).value : autoSyncEnabled
    if (enabled) {
      if ((doSave as any)._uploadTimer) window.clearTimeout((doSave as any)._uploadTimer)
      ;(doSave as any)._uploadTimer = window.setTimeout(async () => {
        try { await uploadUserProfileOnly() } catch (_) {}
      }, 1000)
    }
  } catch (_) {}
}

// 热保存：表单与自定义字段变更时自动保存（节流）
watch(form, queueSave, { deep: true })
watch(customList, queueSave, { deep: true })

function clear() {
  clearUserProfile()
  Object.assign(form, {
    nickname: '', city: '', preferredLanguage: '', age: null, email: '', phone: '', gender: '', birthday: '',
    occupation: '', company: '', timezone: '', website: '', address: '', hobbies: '', bio: '', avatarUrl: ''
  })
  customList.splice(0, customList.length)
  alert('已清空')
}

async function uploadProfile() {
  const res = await uploadUserProfileOnly()
  alert(res.message)
}

function addCustom() { customList.push({ key: '', value: '' }) }
function removeCustom(i: number) { customList.splice(i, 1) }
</script>

<style scoped>
.page-wrap { display: flex; flex-direction: column; height: 100%; background: var(--bg); color: var(--text); }
.topbar { height: 56px; display: flex; align-items: center; gap: 8px; padding: 0 16px; border-bottom: 1px solid var(--border); background: var(--panel); }
.title { font-weight: 600; font-size: 16px; }
.spacer { flex: 1; }

.content { padding: 16px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 12px; }
.form-row { display: grid; gap: 6px; }
.form-row.full { grid-column: 1 / -1; }
.form-row label { font-size: 12px; color: var(--muted); }
.form-row input, .form-row textarea { height: 32px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); padding: 0 8px; }
.form-row textarea { min-height: 96px; height: auto; padding: 8px; }
.hint { font-size: 12px; color: var(--muted); }

.ghost-btn { height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
.ghost-btn.small { height: 28px; padding: 0 8px; }
.ghost-btn:hover { background: var(--hover); }
.accent-btn { height: 32px; padding: 0 12px; border-radius: 8px; background: var(--accent); color: #fff; border: 0; }
.accent-btn:hover { filter: brightness(1.05); }
.success-btn { height: 32px; padding: 0 12px; border-radius: 8px; background: var(--success); color: #fff; border: 0; }
.success-btn:hover { filter: brightness(1.05); }

.custom-list { display: grid; gap: 8px; }
.kv-row { display: flex; align-items: center; gap: 8px; }
.kv-row .sep { color: var(--muted); }
</style>