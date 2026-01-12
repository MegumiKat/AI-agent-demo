// 虚拟人相关类型定义
// 虚拟人相关类型定义
export interface AvatarConfig {
  appId: string
  appSecret: string
}

/**
 * 如果你以后还想用“多个布尔标记”这种结构，可以保留这个接口，
 * 只是改个名字避免和状态枚举冲突。
 */
export interface AvatarStatusFlags {
  connected: boolean
  speaking: boolean
  thinking: boolean
}

/**
 * 虚拟人“当前状态”类型：只允许这些字符串
 */
export type AvatarState =
  | ''        // 初始 / 未知
  | 'idle'    // 空闲
  | 'speak'   // 正在说话
  | 'listen'  // 正在倾听
  | 'think'   // 思考 / 过渡
  | 'unknown'

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
