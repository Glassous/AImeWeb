import { ref } from 'vue'

export interface UserProfile {
  nickname?: string
  city?: string
  preferredLanguage?: string
  age?: number | null
  email?: string
  phone?: string
  gender?: string
  birthday?: string
  occupation?: string
  company?: string
  timezone?: string
  website?: string
  address?: string
  hobbies?: string
  bio?: string
  avatarUrl?: string
  customFields?: Record<string, string> | null
}

const LS_KEY = 'aime.user_profile'

function sanitizeString(x: any): string | undefined {
  if (x === undefined || x === null) return undefined
  return typeof x === 'string' ? x : String(x)
}
function sanitizeNumber(x: any): number | null | undefined {
  if (x === undefined) return undefined
  if (x === null) return null
  const n = Number(x)
  return Number.isFinite(n) ? n : undefined
}
function sanitizeMap(x: any): Record<string, string> | null | undefined {
  if (x === undefined) return undefined
  if (x === null) return null
  const out: Record<string, string> = {}
  if (x && typeof x === 'object') {
    for (const k of Object.keys(x)) {
      const v = (x as any)[k]
      if (v !== undefined && v !== null) out[k] = String(v)
    }
  }
  return out
}

function load(): UserProfile {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const obj = JSON.parse(raw)
      return normalize(obj)
    }
  } catch {}
  return {}
}

export const userProfile = ref<UserProfile>(load())

export function saveUserProfile() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(userProfile.value)) } catch {}
}

export function setUserProfile(p: UserProfile) {
  userProfile.value = normalize(p)
  saveUserProfile()
}

export function clearUserProfile() {
  userProfile.value = {}
  saveUserProfile()
}

export function exportProfile(): UserProfile {
  return JSON.parse(JSON.stringify(userProfile.value)) as UserProfile
}

export function replaceProfile(input: any): { ok: boolean; error?: string } {
  try {
    const p = normalize(input)
    userProfile.value = p
    saveUserProfile()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function normalize(input: any): UserProfile {
  const p: UserProfile = {}
  if (!input || typeof input !== 'object') return p
  p.nickname = sanitizeString(input.nickname)
  p.city = sanitizeString(input.city)
  p.preferredLanguage = sanitizeString(input.preferredLanguage)
  p.age = sanitizeNumber(input.age) ?? undefined
  p.email = sanitizeString(input.email)
  p.phone = sanitizeString(input.phone)
  p.gender = sanitizeString(input.gender)
  p.birthday = sanitizeString(input.birthday)
  p.occupation = sanitizeString(input.occupation)
  p.company = sanitizeString(input.company)
  p.timezone = sanitizeString(input.timezone)
  p.website = sanitizeString(input.website)
  p.address = sanitizeString(input.address)
  p.hobbies = sanitizeString(input.hobbies)
  p.bio = sanitizeString(input.bio)
  p.avatarUrl = sanitizeString(input.avatarUrl)
  p.customFields = sanitizeMap(input.customFields) ?? undefined
  return p
}

export function buildUserProfileSystemMessage(): string {
  const p = userProfile.value
  const entries: string[] = []
  function push(label: string, val?: string | number | null) {
    if (val !== undefined && val !== null && String(val).trim().length) entries.push(`${label}: ${val}`)
  }
  push('昵称', p.nickname)
  push('城市', p.city)
  push('语言偏好', p.preferredLanguage)
  push('年龄', p.age ?? undefined)
  push('性别', p.gender)
  push('生日', p.birthday)
  push('职业', p.occupation)
  push('公司', p.company)
  push('时区', p.timezone)
  push('网站', p.website)
  push('地址', p.address)
  push('兴趣', p.hobbies)
  push('简介', p.bio)
  push('邮箱', p.email)
  push('电话', p.phone)
  push('头像', p.avatarUrl)
  if (p.customFields && Object.keys(p.customFields).length) {
    entries.push('自定义字段: ' + Object.entries(p.customFields).map(([k, v]) => `${k}=${v}`).join('; '))
  }
  if (!entries.length) return ''
  return `以下是用户的背景资料（非必要信息，若与当前任务无关请忽略）：\n` + entries.join('; ')
}