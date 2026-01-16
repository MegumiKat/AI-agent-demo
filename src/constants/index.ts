// 应用常量
export const APP_CONFIG = {
  CONTAINER_PREFIX: 'CONTAINER_',
  AVATAR_INIT_TIMEOUT: 3000,
  SPEAK_INTERRUPT_DELAY: 2000,
} as const

const {
  VITE_BASE_URL,
  VITE_MODEL,
  VITE_API_KEY,
  VITE_SYSTEM_PROMPT,
  VITE_BACKGROUND,
} = import.meta.env

// ASR：引擎/识别层参数（不要放“待机/离线”策略）
export const ASR_CONFIG = {
  DEFAULT_URL: '/api/asr',

  // 一轮录音最大时长（上层会传入不同值：唤醒窗口/对话窗口）
  MAX_UTTERANCE_MS: 15000,

  // 静音判定（如果你的 ASR/VAD 实现用得到）
  SILENCE_HOLD_MS: 800,
  SILENCE_THRESHOLD: 0.01,
} as const

// 交互策略：唤醒 + 单轮问答 + 静默待机
export const INTERACTION_CONFIG = {
  // ====== 语音指令（口令）======
  WAKE_PHRASES: ['你好助手', '你好 助手'] as const,  // 你可只保留一种写法，下面 normalize 会处理空格
  STOP_PHRASES: ['关闭'] as const,

  WAKE_REPLY_TEXT: '我在',
  STOP_REPLY_TEXT: '有需要请唤醒我',

  // 匹配策略：
  // - 'contains' 更宽松：ASR 结果里包含即可触发（推荐用于 wake）
  // - 'equals' 更严格：必须完全等于（推荐用于 stop，防误触）
  WAKE_MATCH_MODE: 'contains' as const,
  STOP_MATCH_MODE: 'equals' as const,

  FIXED_REPLY_TIMEOUT_MS: 8000,

  // 归一化：去空格、去常见标点、转小写（中文不受影响）
  NORMALIZE_TEXT: true,

  // 防抖：避免连续触发
  WAKE_COOLDOWN_MS: 1500,
  STOP_COOLDOWN_MS: 800,

  // ====== standby 下唤醒监听（短窗口循环）======
  WAKE_UTTERANCE_MS: 3000,
  WAKE_LOOP_RETRY_MS: 250,

  // ====== online 下持续对话循环（长窗口循环）======
  // 每轮用户问题最大录音时长
  TURN_UTTERANCE_MS: 15000,
  // 一轮结束到下一轮重启的间隔
  NEXT_TURN_DELAY_MS: 500,

  // ====== 静默自动待机（你现在不需要，先关掉）======
  IDLE_TO_STANDBY_MS: 0,

  // 未来扩展：离线策略（可先不用）
  OFFLINE_AFTER_MS: 60000,

  // 未来扩展：播报中打断（现在先关）
  BARGE_IN_ENABLED: false,
} as const

// LLM配置
export const LLM_CONFIG = {
  BASE_URL: VITE_BASE_URL || 'https://api.openai.com/v1',
  DEFAULT_MODEL: VITE_MODEL || 'gpt-3.5-turbo',
  SYSTEM_PROMPT: VITE_SYSTEM_PROMPT,
  API_KEY: VITE_API_KEY,
  BACKGROUND: VITE_BACKGROUND,
} as const

// SenseVoice / HTTP ASR 配置
export const SENSEVOICE_CONFIG = {
  DEFAULT_URL: ASR_CONFIG.DEFAULT_URL,
  DEFAULT_VAD_SILENCE_TIME: ASR_CONFIG.MAX_UTTERANCE_MS,
} as const

// SDK配置
export const SDK_CONFIG = {
  GATEWAY_URL: 'https://nebula-agent.xingyun3d.com/user/v1/ttsa/session',
  DATA_SOURCE: '2',
  CUSTOM_ID: 'demo',
} as const

export const SUPPORTED_LLM_MODELS = [
  'gpt-3.5-turbo',
  'gpt-4',
  'gpt-4-turbo',
  ...(VITE_MODEL && !['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'].includes(VITE_MODEL)
    ? [VITE_MODEL]
    : []),
] as const

// 你 types 里 AsrProvider 目前只有 'sensevoice'，这里也收敛掉 tx，避免类型不一致
export const SUPPORTED_ASR_PROVIDERS = [
  { value: 'sensevoice', label: 'SenseVoice' },
] as const