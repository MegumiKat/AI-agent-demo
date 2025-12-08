// 虚拟人相关类型定义
export interface AvatarConfig {
  appId: string
  appSecret: string
}

export interface AvatarState {
  connected: boolean
  speaking: boolean
  thinking: boolean
}

// ASR相关类型定义
export interface AsrConfig {
  // provider: 'tx' // 想要连接相关API 例如腾讯
  provider: 'sensevoice'
  sensevoiceUrl: string
  // appId: string | number
  // secretId: string
  // secretKey: string
  vadSilenceTime?: number
}

export interface AsrCallbacks {
  onFinished: (text: string) => void
  onError: (error: any) => void
}

// LLM相关类型定义
export interface LlmConfig {
  provider: string
  model: string
  apiKey: string
  baseURL?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Store类型定义
export interface AppStore {
  connectAvatar(): Promise<void>
  disconnectAvatar(): void
  sendMessage(): Promise<string | undefined>
  startVoiceInput(callbacks: AsrCallbacks): void
  stopVoiceInput(): void

  startContinuousListening: () => void      // 开启“长期开麦+状态机”模式
  stopContinuousListening: () => void       // 停止连续监听
  updateLastUserVoice: () => void           // 每次检测到用户说话时调用
}


export type InteractionMode = 'online' | 'standby' | 'offline'

// Store状态类型定义
export interface AppState {
  // 虚拟人配置
  avatar: {
    appId: string
    appSecret: string
    connected: boolean
    instance: any
  }
  
  // ASR配置
  asr: {
    provider: string
    sensevoiceUrl:string
    // appId: string | number
    // secretId: string
    // secretKey: string
    isListening: boolean
  }
  
  // LLM配置
  llm: {
    model: string
    apiKey: string
  }
  
  // UI状态
  ui: {
    text: string
    subTitleText: string
  }

  interaction:{
    mode: InteractionMode
    lastUserVoiceAt: number
    wakeWord:string
  }
}

// SDK事件类型定义
export interface SdkEvent {
  type: 'subtitle_on' | 'subtitle_off' | string
  text?: string
  [key: string]: any
}

// 全局窗口类型扩展
declare global {
  interface Window {
    XmovAvatar: any
    // CryptoJSTest: any
    // CryptoJS: any
    // WebAudioSpeechRecognizer: any
  }
}
