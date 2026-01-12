<template>
  <div class="config-panel">
    <!-- 虚拟人配置 -->
    <section class="config-section">
      <h3 class="section-title">虚拟人 SDK 配置</h3>

      <div class="form-group">
        <label>应用 APP ID</label>
        <input v-model="appState.avatar.appId" type="text" placeholder="请输入 APP ID" />
      </div>

      <div class="form-group">
        <label>应用 APP Secret</label>
        <input v-model="appState.avatar.appSecret" type="text" placeholder="请输入 APP Secret" />
      </div>
    </section>

    <!-- ASR配置 -->
    <section class="config-section">
      <h3 class="section-title">语音识别配置</h3>

      <div class="form-group">
        <label>ASR 服务</label>
        <select v-model="appState.asr.provider">
          <option value="sensevoice">本地 SenseVoice</option>
          <!-- 以后如果要加腾讯，再补一个选项 -->
          <!-- <option value="tx">腾讯云</option> -->
        </select>
      </div>

      <div class="form-group">
        <label>SenseVoice 接口地址</label>
        <input
          v-model="appState.asr.sensevoiceUrl"
          type="text"
          placeholder="留空使用 /api/asr（通过代理转发到后端）"
        />
      </div>
    </section>

    <!-- LLM配置 -->
    <section class="config-section">
      <h3 class="section-title">大语言模型配置</h3>

      <div class="form-group">
        <label>目前模型</label>
        <select v-model="appState.llm.model">
          <option v-for="model in supportedModels" :key="model" :value="model">
            {{ model }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>API Key</label>
        <input v-model="appState.llm.apiKey" type="password" placeholder="请输入 API Key" />
      </div>
    </section>

    <!-- 控制按钮 -->
    <section class="control-section">
      <div class="button-group">
        <button
          @click="handleConnect"
          :disabled="isConnecting || appState.avatar.connected"
          class="btn btn-primary"
        >
          {{ isConnecting ? '连接中...' : appState.avatar.connected ? '已连接' : '连接' }}
        </button>

        <button
          @click="handleDisconnect"
          :disabled="!appState.avatar.connected"
          class="btn btn-secondary"
        >
          断开
        </button>
      </div>
    </section>

    <!-- 消息交互 -->
    <section class="message-section">
      <h3 class="section-title">消息交互</h3>

      <div class="form-group">
        <label>输入消息</label>
        <textarea v-model="appState.ui.text" rows="4" placeholder="请输入您的消息..." />
      </div>

      <div class="button-group">
        <!-- 语音按钮：只负责开/关连续聆听 -->
        <button
          @click="handleVoiceInput"
          :disabled="!appState.avatar.connected"
          class="btn btn-voice"
        >
          {{ appState.asr.isListening ? '停止聆听' : '开启聆听' }}
        </button>

        <button
          @click="handleSendMessage"
          :disabled="!appState.avatar.connected || !appState.ui.text.trim() || isSending"
          class="btn btn-primary"
        >
          {{ isSending ? '发送中...' : '发送' }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { inject, ref, computed } from 'vue'
import { useAsr } from '../composables/useAsr'
import { SUPPORTED_LLM_MODELS, SENSEVOICE_CONFIG } from '../constants'
import type { AppState, AppStore } from '../types'

// 注入全局状态和方法
const appState = inject<AppState>('appState')!
const appStore = inject<AppStore>('appStore')!

// 组件状态
const isConnecting = ref(false)
const isSending = ref(false)
const supportedModels = SUPPORTED_LLM_MODELS

// ASR 配置：留空时由 useAsr 使用默认 '/api/asr'
const asrConfig = computed(() => ({
  provider: 'sensevoice' as const,
  sensevoiceUrl: appState.asr.sensevoiceUrl || '',
  vadSilenceTime: SENSEVOICE_CONFIG.DEFAULT_VAD_SILENCE_TIME, // 可选：5 秒自动停止录音
}))

// 初始化 ASR：内部会注册全局 ASR（比如通过 asrRegistry / window.__asr）
// 这里不要再拿 start/stop 出来用
useAsr(asrConfig.value)

// 事件处理函数
async function handleConnect() {
  if (isConnecting.value) return

  isConnecting.value = true
  try {
    await appStore.connectAvatar()
  } catch (error) {
    console.error('连接失败:', error)
    alert('连接失败，请检查配置信息')
  } finally {
    isConnecting.value = false
  }
}

function handleDisconnect() {
  appStore.disconnectAvatar()
}

// 语音按钮：只控制 start/stopContinuousListening
function handleVoiceInput() {
  if (!appState.avatar.connected) return

  if (appState.asr.isListening) {
    console.log('[UI] 手动停止自动聆听')
    appStore.stopContinuousListening()
  } else {
    console.log('[UI] 手动开启自动聆听')
    appStore.startContinuousListening()
  }
}

async function handleSendMessage() {
  if (isSending.value || !appState.ui.text.trim()) return

  isSending.value = true
  try {
    await appStore.sendMessage()
  } catch (error) {
    console.error('发送消息失败:', error)
    alert('发送消息失败')
  } finally {
    isSending.value = false
  }
}
</script>

<style scoped>
.config-panel {
  width: 420px;
  max-height: 100vh;
  overflow-y: auto;
  padding: 24px;
  background: #ffffff;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.config-section,
.control-section,
.message-section {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 16px;
  background: #fafafa;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 8px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #555;
}

input,
select,
textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

input:focus,
select:focus,
textarea:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

textarea {
  resize: vertical;
  min-height: 80px;
}

.button-group {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 80px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #545b62;
}

.btn-voice {
  background: #28a745;
  color: white;
}

.btn-voice:hover:not(:disabled) {
  background: #1e7e34;
}

/* 滚动条美化 */
.config-panel::-webkit-scrollbar {
  width: 6px;
}

.config-panel::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.config-panel::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.config-panel::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>