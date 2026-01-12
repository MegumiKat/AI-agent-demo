// 应用常量
export const APP_CONFIG = {
  CONTAINER_PREFIX: 'CONTAINER_',
  AVATAR_INIT_TIMEOUT: 3000,
  SPEAK_INTERRUPT_DELAY: 2000
} as const


const {
  VITE_BASE_URL,
  VITE_MODEL,
  VITE_API_KEY,
  VITE_SYSTEM_PROMPT,
  VITE_BACKGROUND,
} = import.meta.env


export const LOOP_CONFIG = {
  NEXT_LOOP_DELAY_MS: 500,           // 一轮结束到下一轮的间隔，建议 100~200ms
  CHECK_SPEAKING_INTERVAL_MS: 200,
} as const

// ASR 统一配置（SenseVoice / 连续聆听 都用这个）
export const ASR_CONFIG = {
  // 前端默认的 ASR 接口地址（通过 Vite 代理到本地后端）
  DEFAULT_URL: '/api/asr',
  // 每轮录音最大时长（毫秒）
  MAX_UTTERANCE_MS: 15000,
  // 静音检测：持续多久没有明显声音就认为“说完了”（毫秒）
  SILENCE_HOLD_MS: 800,
  // 静音阈值（0~1 的能量），越小越敏感
  SILENCE_THRESHOLD: 0.01,
  // 连续监听时，检查“是否长时间没人说话”的间隔（毫秒）
  CHECK_INTERVAL_MS: 500,
  // 无人说话多久切到 standby（待机互动）
  STANDBY_AFTER_MS: 3000,
  // 无人说话多久切到 offline（先留给唤醒词 Phase2 用）
  OFFLINE_AFTER_MS: 10000,

} as const

// LLM配置
export const LLM_CONFIG = {
  BASE_URL: VITE_BASE_URL || 'https://api.openai.com/v1',
  DEFAULT_MODEL: VITE_MODEL || 'gpt-3.5-turbo',
  SYSTEM_PROMPT: VITE_SYSTEM_PROMPT,
  API_KEY: VITE_API_KEY,
  BACKGROUND: VITE_BACKGROUND,
} as const

// 腾讯 ASR 引擎配置（如果后面用到腾讯流式 ASR，就用这个）
export const TX_ASR_CONFIG = {
  ENGINE_MODEL_TYPE: '16k_zh',
  VOICE_FORMAT: 1,
  FILTER_DIRTY: 1,
  FILTER_MODAL: 1,
  FILTER_PUNC: 1,
  CONVERT_NUM_MODE: 1,
  WORD_INFO: 2,
  NEEDVAD: 1,
} as const

// SenseVoice / HTTP ASR 配置
export const SENSEVOICE_CONFIG = {
  DEFAULT_URL: ASR_CONFIG.DEFAULT_URL,
  // 这里可以先用 MAX_UTTERANCE_MS，当成“默认最长录音时长/静音时间兜底”
  DEFAULT_VAD_SILENCE_TIME: ASR_CONFIG.MAX_UTTERANCE_MS,
} as const

// SDK配置
export const SDK_CONFIG = {
  GATEWAY_URL: 'https://nebula-agent.xingyun3d.com/user/v1/ttsa/session',
  DATA_SOURCE: '2',
  CUSTOM_ID: 'demo'
} as const

// 支持的LLM模型列表
export const SUPPORTED_LLM_MODELS = [
  'gpt-3.5-turbo',
  'gpt-4',
  'gpt-4-turbo',
  // 可以从环境变量中添加其他模型
  ...(VITE_MODEL && !['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'].includes(VITE_MODEL) ? [VITE_MODEL] : [])
] as const

// 支持的ASR提供商
export const SUPPORTED_ASR_PROVIDERS = [
  { value: 'sensevoice', label: 'SenseVoice' },
  { value: 'tx', label: '腾讯' }
] as const
