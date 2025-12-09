# Smart Avatar Interaction Demo

This is a smart virtual human interaction demo application built with `Vue 3 + TypeScript +  Vite`. It integrates speech recognition, large language models, and a virtual human SDK to provide a complete voice interaction experience. This project is based on mofaxingyun avatar [https://xingyun3d.com].

## 📋 Features and functionalities

- **🎭 Virtual Human Rendering**: 3D virtual human rendering based on the XmovAvatar SDK
- **🎤 Speech recognition**: Using the local SenseVoice model for real-time speech-to-text conversion.
- **🤖 AI Chating**: Supports Aliyun large language models (Qwen3) / Doubao for intelligent conversations.
- **💬 Subtitles are displayed**: Displays speech recognition results and AI responses in real time.
- **🎙️ Voice input**: It supports two interaction methods: voice input and text input.
- **⚙️ Configuration Management**: Flexible configuration interface, supporting various API configurations.

## 🏗️ Project Structure

```shell
src/
├── App.vue                   # Application main component
├── main.ts                   # Application Entry Point
├── .env (env)                # enviroment varaibles
├── style.css                 # Global styles
├── vite-env.d.ts             # Vite environment type declarations
├── components/               # Vue components
│   ├── AvatarRender.vue      # Virtual human rendering component
│   └── ConfigPanel.vue       # Configure panel components
├── stores/                   # State Management
│   ├── app.ts                # Application state and business logic
│   └── sdk-test.html         # SDK Test Page
├── services/                 # Service layer
│   ├── avatar.ts             # Virtual Human SDK Service
│   └── llm.ts                # Large Language Model Services
├── composables/              # Vue Composition API
│   └── useAsr.ts             # Audio Recognition Hook
├── types/                    # TypeScript type definitions
│   └── index.ts              # Unified type export
├── constants/                # Constant Definitions
│   └── index.ts              # Application Constants
├── utils/                    # Utility functions
│   ├── index.ts              # General utility functions
│   └── sdk-loader.ts         # SDK Loader
├── lib/                      # Third-party library encapsulation (not used but if using tx)
│   └── asr.ts                # Speech recognition underlying services
├── backend/                  # backend
│   └── sensevoice_api.py     # local sensevoice model and api
│   └── requirements.txt      # dependence
└── assets/                   # Static resources
    ├── siri.png              # Speech recognition animation icon
    └── vue.svg               # Vue Logo
```

## 🚀 Quick Start

### Environment Requirment

#### Frontend

- Node.js >= 16
- pnpm (Recommend)

#### Backend

- See requirements.txt

### Install dependencies

```bash
pnpm install  # frontend
```

```bash
pip install -r requirements.txt  # backend
```

### Development environment running

```bash
pnpm run dev
```

```bash
python sensevoice_api.py
```

### Build a production version

```bash
pnpm run build
```

### Preview build results

```bash
pnpm run preview
```

## ⚙️ Configuration Instructions

Before using this application, the following parameters need to be configured :

### 0. Modify environment files

- Rename the `env` file to `.env` and fill in all the parameters within it.

### 1. Virtual Human SDK Configuration

- **VITE_AVATAR_APP_ID**: XmovAvatar SDK Application ID
- **VITE_AVATAR_APP_SECRET**: XmovAvatar SDK application key

### 2. Speech Recognition Configuration (example: tencent cloud ASR)

- **if you use local backend sensevoice you don't need to do below**
- **ASR App ID**: Tencent Cloud Speech Recognition Application ID
- **ASR Secret ID**: Tencent Cloud Access Key ID
- **ASR Secret Key**: Tencent Cloud Access Key
- **if you want to use any ASR Api you need to modify relevant files**

### 3. LLM

- **VITE_MODEL**: Currently supported model: `qwen3-max`
- **VITE_API_KEY**: The access key for the corresponding API
- **VITE_BASE_URL**: The base url for the corresoponding API
- **VITE_SYSTEM_PROMPT**: Prompt
- **VITE_BACKGROUND**: Background, detailed desc, methods for implementing a simple knowledge base

## 🎯 User Guide

1. **Configuration parameters**: Fill in the required API configuration information in the `.env` file.
2. **Establish a connection**: The connection will be established automatically when you access the webpage, or you can click the "Connect" button.
3. **Text interaction**: Enter your message in the text box and click "Send" to start the conversation.
4. **Voice interaction**: Now listening automatically.
5. **View replies**: The virtual character will read out the AI's response while simultaneously displaying subtitles.

## 🔧 技术栈

- **Frontend Framework**: Vue 3 (Composition API)
- **Backend Framework**: Fastapi
- **Development Language**: TypeScript + Python
- **Build Tools**: Vite
- **Virtual Human SDK**: XmovAvatar
- **Speech Recognition**: Local Sensevoice ASR
- **LLM**: Aliyun API (`qwen3-max` or any model on 百炼大模型广场)

## 📦 Core Dependencies

```json
{
  "vue": "3.5.18",
  "openai": "5.12.2",
  "typescript": "~5.8.3",
  "vite": "7.1.2",
  "@vitejs/plugin-vue": "6.0.1",
  "vue-tsc": "3.0.5"
}
```

## 🎨 界面说明

### 主界面布局
- **左侧**: 虚拟人渲染区域，显示3D虚拟人和字幕
- **右侧**: 配置和控制面板

### 交互元素
- **字幕区域**: 显示语音识别结果和AI回复
- **语音动画**: 语音输入时显示Siri风格动画
- **加载状态**: 连接建立前显示加载提示

## 🔥 核心功能实现

### 虚拟人渲染
```typescript
// 连接虚拟人SDK
const avatar = await avatarService.connect(appId, appSecret, subtitleCallback, closeCallback)
```

### 语音识别
```typescript
// 使用语音识别Hook
const { start, stop, asrText } = useAsr(config, vadTime)
```

### AI对话
```typescript
// 发送消息到大语言模型
const answer = await llmService.send(model, text)
```

## 🔑 关键组件介绍

### Store (状态管理)
`src/stores/app.ts` - 全局状态管理中心
- **功能**: 管理应用状态、SDK连接、配置信息
- **核心方法**:
  - `connect()`: 建立虚拟人SDK连接
  - `destroy()`: 断开连接并清理资源
  - `sendToLLM()`: 发送消息到大语言模型
- **状态属性**: appId、appSecret、llmKey、connected等

### AvatarRender (虚拟人渲染组件)
`src/components/AvatarRender.vue` - 虚拟人展示组件
- **功能**: 渲染3D虚拟人、显示字幕、语音动画
- **特性**:
  - 动态容器ID生成
  - 字幕实时显示
  - 语音输入状态指示
  - 连接状态管理

### ConfigPanel (配置面板组件)
`src/components/ConfigPanel.vue` - 配置和控制面板
- **功能**: API配置、连接控制、文本输入、语音输入
- **配置项**:
  - 虚拟人SDK配置 (appId、appSecret)
  - ASR配置 (腾讯云相关参数)
  - 大模型配置 (模型选择、API密钥)
- **操作按钮**: 连接/断开、语音输入、发送消息

### AvatarService (虚拟人SDK服务)
`src/services/avatar.ts` - XmovAvatar SDK封装
- **功能**: 
  - SDK初始化和连接管理
  - 事件回调处理 (字幕、状态变化)
  - 错误处理和重连机制
- **核心特性**:
  - 随机容器ID生成
  - 状态监听 (speak、think等)
  - 字幕事件处理

### LLM服务 (大语言模型)
`src/services/llm.ts` - 大语言模型服务封装
- **功能**: 
  - OpenAI兼容API调用
  - 支持流式和非流式响应
  - 豆包API集成
- **配置**: 
  - 基础URL: `https://ark.cn-beijing.volces.com/api/v3`
  - 支持模型: `doubao-1-5-pro-32k-250115`

### ASR Hook (语音识别)
`src/composables/useAsr.ts` - 语音识别复用逻辑
- **功能**:
  - 腾讯云ASR集成
  - 语音识别生命周期管理
  - VAD (语音活动检测) 配置
- **事件处理**:
  - 识别开始/结束
  - 实时识别结果
  - 错误处理

### 工具函数
- `src/utils/index.ts`: 通用工具函数集合
- `src/utils/sdk-loader.ts`: SDK动态加载器
- `src/lib/asr.ts`: 腾讯云ASR签名和配置

## 📝 注意事项

1. **API配置**: 确保所有API配置信息正确填写
2. **网络连接**: 需要稳定的网络连接以确保SDK和API正常工作
3. **浏览器兼容**: 建议使用现代浏览器以获得最佳体验
4. **麦克风权限**: 语音功能需要浏览器麦克风权限

## 🌐 相关项目

### Web Director (网页导办)
`apps/web-director/` - 网页导办演示项目
- **功能**: 提供网页导办服务的交互界面
- **特性**:
  - 响应式设计，适配不同屏幕尺寸
  - 支持麦克风权限的 iframe 嵌入
  - 一键展开/收起交互体验
- **技术**: 纯 HTML + CSS + JavaScript
- **访问**: 通过 HTTP 服务器访问 `http://192.168.1.141:8000/demo.html`

## 📄 许可证

本项目仅供学习和演示使用。