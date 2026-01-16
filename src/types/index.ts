// =========================
// Avatar / Virtual Human
// =========================
export interface AvatarConfig {
  appId: string
  appSecret: string
}

/**
 * 虚拟人“当前状态”类型：只允许这些字符串
 * - 建议不要用 ''，用 'unknown' 表达更明确
 */
export type AvatarState =
  | 'idle'     // 空闲
  | 'speak'    // 正在说话
  | 'listen'   // 正在倾听
  | 'think'    // 思考 / 过渡
  | 'unknown'  // 初始 / 未知

/**
 * 如果你以后还想保留“多个布尔标记”的结构，可继续使用。
 * 注意：不建议同时用 AvatarState + flags 表达同一事实，后期可以择一。
 */
export interface AvatarStatusFlags {
  connected: boolean
  speaking: boolean
  thinking: boolean
}

// =========================
// ASR
// =========================
export type AsrProvider = 'sensevoice' // 未来可扩展：| 'tencent' | 'aliyun' | ...

export interface AsrConfig {
  provider: AsrProvider
  sensevoiceUrl: string
  vadSilenceTime?: number
}

/**
 * 一轮 ASR 的回调
 * - 可选加一个 onStart：未来做“打断/插话”会用到
 * - 现在不实现也没关系，调用方可不传
 */
export interface AsrCallbacks {
  onFinished: (text: string) => void
  onError: (error: any) => void
  onStart?: () => void
}

// =========================
// LLM
// =========================
export type LlmProvider = 'openai' | string

export interface LlmConfig {
  provider: LlmProvider
  model: string
  apiKey: string
  baseURL?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// =========================
// Interaction / State Machine
// =========================
export type InteractionMode = 'online' | 'standby' | 'offline'

/**
 * （可选但推荐）把“状态机的事件”也类型化，后期加打断会更清晰。
 * 你现在可以不用它，但留着不影响。
 */
export type InteractionEvent =
  | { type: 'WAKE'; source: 'voice' | 'button' }
  | { type: 'TURN_START' }
  | { type: 'TURN_END' }
  | { type: 'IDLE_TIMEOUT' }
  | { type: 'DISCONNECT' }
  | { type: 'CONNECT' }

// =========================
// Store Interface
// =========================
export interface AppStore {
  connectAvatar(): Promise<void>
  disconnectAvatar(): void
  sendMessage(): Promise<string | undefined>

  startVoiceInput(callbacks: AsrCallbacks): void
  stopVoiceInput(): void

  /**
   * 你现在要的不是“continuous listening”，而是：
   * - standby 下的唤醒监听（可选）
   * - online 下的一次对话 turn
   *
   * 为了不破坏你现有代码，可以先保留旧接口（deprecated），后面在 store 实现里逐步替换。
   */
  startContinuousListening: () => void
  stopContinuousListening: () => void
  updateLastUserVoice: () => void

  /**
   * 新的推荐接口（现在先定义类型，下一步再实现）
   */
  wake?: (source?: 'voice' | 'button') => void
  enterStandby?: () => void
}

// =========================
// App Reactive State
// =========================
export interface AppState {
  avatar: {
    appId: string
    appSecret: string
    connected: boolean
    instance: any
  }

  asr: {
    provider: AsrProvider
    sensevoiceUrl: string
    isListening: boolean
  }

  llm: {
    model: string
    apiKey: string
  }

  ui: {
    text: string
    subTitleText: string
  }

  interaction: {
    mode: InteractionMode
    lastUserVoiceAt: number
    wakeWord: string
  }
}

// =========================
// SDK Event + Window
// =========================
export interface SdkEvent {
  type: 'subtitle_on' | 'subtitle_off' | string
  text?: string
  [key: string]: any
}

declare global {
  interface Window {
    XmovAvatar: any
  }
}