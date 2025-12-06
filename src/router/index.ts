import { createRouter, createWebHistory } from 'vue-router'

const ChatArea = () => import('../components/ChatArea.vue')
const Settings = () => import('../pages/Settings.vue')
const ModelConfig = () => import('../pages/ModelConfig.vue')


export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: ChatArea },
    { path: '/settings', name: 'settings', component: Settings, meta: { hideSidebar: true } },
    { path: '/settings/model', name: 'model-config', component: ModelConfig, meta: { hideSidebar: true } },

  ],
})