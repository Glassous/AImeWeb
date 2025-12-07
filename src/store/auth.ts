import { ref } from 'vue'
import { supabase } from '../api/supabase'

// 定义用户信息接口
export interface UserInfo {
  id: string
  email: string
  created_at: string
  updated_at: string
}

// 定义认证状态
export interface AuthState {
  user: UserInfo | null
  isAuthenticated: boolean
  isLoading: boolean
  sessionToken: string | null
}

// 初始化认证状态
const state = ref<AuthState>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  sessionToken: null
})

// 从本地存储获取会话令牌
function getStoredSessionToken(): string | null {
  return localStorage.getItem('sessionToken')
}

// 存储会话令牌到本地
type StoreSessionOptions = {
  token: string
  user: UserInfo
}

function storeSession(options: StoreSessionOptions): void {
  localStorage.setItem('sessionToken', options.token)
  localStorage.setItem('userInfo', JSON.stringify(options.user))
}

// 清除本地存储的会话
function clearSession(): void {
  localStorage.removeItem('sessionToken')
  localStorage.removeItem('userInfo')
}

// 从本地存储恢复用户信息
function getStoredUserInfo(): UserInfo | null {
  const userInfoStr = localStorage.getItem('userInfo')
  if (userInfoStr) {
    try {
      return JSON.parse(userInfoStr)
    } catch {
      return null
    }
  }
  return null
}

// 密码强度验证函数
export function validatePassword(password: string): { valid: boolean; message?: string } {
  // 密码只能包含英文大小写、数字和符号
  const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]+$/
  
  if (!passwordRegex.test(password)) {
    return { 
      valid: false, 
      message: '密码只能包含英文大小写、数字和符号' 
    }
  }
  
  return { valid: true }
}

// 更新认证状态
function updateAuthState(user: UserInfo | null, token: string | null) {
  state.value.user = user
  state.value.sessionToken = token
  state.value.isAuthenticated = !!user && !!token
  state.value.isLoading = false
}

// 登录功能
export async function login(email: string, password: string) {
  try {
    // 使用自定义RPC函数登录
    const { data, error } = await supabase.rpc('accounts_login', {
      p_email: email,
      p_password: password
    })
    
    if (error) {
      throw error
    }
    
    if (data.ok && data.user_id && data.session_token) {
      // 构建用户信息
      const userInfo: UserInfo = {
        id: data.user_id,
        email: data.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      // 存储会话
      storeSession({ token: data.session_token, user: userInfo })
      
      // 更新认证状态
      updateAuthState(userInfo, data.session_token)
      
      return { success: true, error: null }
    } else {
      return { success: false, error: data.message || '登录失败' }
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// 注册功能
export async function register(email: string, password: string, question: string, answer: string) {
  try {
    // 验证密码强度
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.message }
    }
    
    // 使用自定义RPC函数注册
    const { data, error } = await supabase.rpc('accounts_register', {
      p_email: email,
      p_password: password,
      p_question: question,
      p_answer: answer
    })
    
    if (error) {
      throw error
    }
    
    if (data.ok && data.user_id && data.session_token) {
      // 构建用户信息
      const userInfo: UserInfo = {
        id: data.user_id,
        email: data.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      // 存储会话
      storeSession({ token: data.session_token, user: userInfo })
      
      // 更新认证状态
      updateAuthState(userInfo, data.session_token)
      
      return { success: true, error: null }
    } else {
      return { success: false, error: data.message || '注册失败' }
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// 密码重置功能（通过安全问题）
export async function resetPasswordWithAnswer(email: string, answer: string, newPassword: string) {
  try {
    // 验证新密码强度
    const passwordValidation = validatePassword(newPassword)
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.message }
    }
    
    // 使用自定义RPC函数重置密码
    const { data, error } = await supabase.rpc('accounts_reset_password_with_answer', {
      p_email: email,
      p_answer: answer,
      p_new_password: newPassword
    })
    
    if (error) {
      throw error
    }
    
    if (data.ok) {
      // 密码重置成功后，清除当前会话
      clearSession()
      updateAuthState(null, null)
      return { success: true, error: null }
    } else {
      return { success: false, error: data.message || '密码重置失败' }
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// 登出功能
export async function logout() {
  try {
    // 清除本地存储的会话
    clearSession()
    
    // 更新认证状态
    updateAuthState(null, null)
    
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// 初始化认证状态：直接执行，不依赖onMounted钩子
const token = getStoredSessionToken()
const userInfo = getStoredUserInfo()

if (token && userInfo) {
  updateAuthState(userInfo, token)
} else {
  updateAuthState(null, null)
}

// 导出认证状态和功能
export { state as authState }
