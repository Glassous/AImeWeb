# AIme

AIme 是一个基于 Vue 3、Vite、TypeScript、TailwindCSS 和 DaisyUI 构建的现代 Web 应用程序。它提供了一个交互式聊天界面，以及模型配置和用户设置等功能。

## 技术栈

- **前端框架**: Vue 3
- **构建工具**: Vite
- **语言**: TypeScript
- **路由**: Vue Router

## 主要功能

- **聊天界面**: 提供一个直观的聊天区域，用于用户交互。
- **设置页面**: 允许用户配置应用程序的各种设置。
- **模型配置**: 专门用于管理和配置 AI 模型参数的页面。
- **用户设置**: 管理用户个人信息的设置页面。
- **响应式布局**: 应用程序在不同设备上提供良好的用户体验，包括桌面和移动设备。

## 项目结构

```
.github/
public/
├── AIme-logo.png
src/
├── api/             # API 服务定义
├── assets/          # 静态资源
├── components/      # 可复用组件
│   ├── ChatArea.vue
│   └── Sidebar.vue
├── pages/           # 页面组件
│   ├── ModelConfig.vue
│   ├── Settings.vue
│   └── UserSettings.vue
├── router/          # 路由配置
├── store/           # 状态管理 (Vuex 或 Pinia)
├── App.vue          # 根组件
├── main.ts          # 应用入口文件
└── style.css        # 全局样式
index.html           # HTML 模板
package.json         # 项目依赖和脚本
tsconfig.json        # TypeScript 配置
vite.config.ts       # Vite 配置
```

## 快速开始

### 安装依赖

```bash
npm install
# 或者
yarn install
pnpm install
```

### 开发模式

```bash
npm run dev
# 或者
yarn dev
pnpm dev
```

这将在本地启动一个开发服务器，通常在 `http://localhost:5173`。

### 构建生产版本

```bash
npm run build
# 或者
yarn build
pnpm build
```

这会将应用程序构建到 `dist` 目录中，用于生产部署。

### 预览生产版本

```bash
npm run preview
# 或者
yarn preview
pnpm preview
```

## OpenAI 接入

项目已改为使用 OpenAI 真实 API。配置步骤：

- 在应用内打开 `设置 → 模型配置`。
- 新增一个模型组：
  - 名称：`OpenAI`
  - Base URL：`https://api.openai.com/v1`
  - API Key：你的 OpenAI 密钥（形如 `sk-...`）
  - 官网地址：`https://platform.openai.com/`
- 在该组下新增模型：
  - Model：例如 `gpt-4o-mini` 或 `gpt-4o`
  - 名称：自定义展示名
- 在聊天页顶部选择刚添加的模型后，即可调用。

实现细节与参考：

- 优先调用 `Responses API`，失败时回退到 `Chat Completions`，以兼容不同模型与版本。[参考：Responses API 文档](https://platform.openai.com/docs/api-reference/responses) [5]
- 需要实时输出或多段内容可参考官方流式响应指南。[参考：Streaming responses](https://platform.openai.com/docs/guides/streaming-responses) [2]
- 模型推荐：`GPT‑4o mini` 具备高性价比，适合聊天与通用任务。[参考：官方公告](https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/) [4]

用户资料注入：

- “用户设置”中的资料会以系统提示的形式（非强制，仅作上下文）注入到请求中，帮助模型更好地个性化回复。

安全提示：

- 当前为前端直连 OpenAI，API Key 会存在于浏览器环境，适合本地/个人使用。生产环境推荐通过后端代理转发以保护密钥。

## 许可证

本项目采用 Apache License, Version 2.0 许可证。详情请参阅 [LICENSE](LICENSE) 文件。