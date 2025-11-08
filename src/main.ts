import { createApp } from 'vue'
import './style.css'
import { themeStore } from './store/theme'
import App from './App.vue'
import { router } from './router'

themeStore.init()
createApp(App).use(router).mount('#app')
