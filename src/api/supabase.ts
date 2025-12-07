import { createClient } from '@supabase/supabase-js'

// 获取环境变量
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 初始化Supabase客户端
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 导出常用的类型
export type { Session, User } from '@supabase/supabase-js'
