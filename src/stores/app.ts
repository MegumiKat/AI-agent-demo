import { reactive, ref } from 'vue'
import type {
  AppState,
  AvatarConfig,
  AsrConfig,
  LlmConfig,
  AsrCallbacks,
  AvatarState,
  InteractionMode,
} from '../types'
import { LLM_CONFIG, APP_CONFIG, ASR_CONFIG } from '../constants'
import { validateConfig, delay, generateSSML } from '../utils'
import { avatarService } from '../services/avatar'
import { llmService } from '../services/llm'
import { getAsr } from '../composables/asrRegistry'

const {
  VITE_AVATAR_APP_ID,
  VITE_AVATAR_APP_SECRET,
} = import.meta.env

// ====== 日志开关（优化点 #12）======
// 你也可以改成 import.meta.env.VITE_VERBOSE_LOG === 'true'
const VERBOSE_LOG = import.meta.env.DEV
function logDebug(...args: any[]) {
  if (VERBOSE_LOG) console.log(...args)
}

// ====== SSML 安全转义（优化点 #11）======
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
function safeGenerateSSML(text: string): string {
  // 假设 generateSSML 不保证 escape；如你确认内部已 escape，可改为直接 generateSSML(text)
  return generateSSML(escapeXml(text))
}

// 应用状态
export const appState = reactive<AppState>({
  avatar: {
    appId: VITE_AVATAR_APP_ID,
    appSecret: VITE_AVATAR_APP_SECRET,
    connected: false,
    instance: null
  },
  asr: {
    provider: 'sensevoice',
    sensevoiceUrl: '',
    isListening: false
  },
  llm: {
    model: LLM_CONFIG.DEFAULT_MODEL,
    apiKey: LLM_CONFIG.API_KEY
  },
  ui: {
    text: '',
    subTitleText: ''
  },
  interaction: {
    mode: 'online',          // online / standby / offline
    lastUserVoiceAt: 0,
    wakeWord: '唤醒助手'
  }
})

const MIN_SPLIT_LENGTH = 2 // 最小切分长度
const MAX_SPLIT_LENGTH = 20 // 最大切分长度
function splitSentence(text: string): string[] {
  if (!text) return []

  // 定义中文标点（不需要空格）
  const chinesePunctuations = new Set(['、', '，', '：', '；', '。', '？', '！', '…', '\n'])
  // 定义英文标点（需要后跟空格）
  const englishPunctuations = new Set([',', ':', ';', '.', '?', '!'])

  let count = 0
  let firstValidPunctAfterMin = -1 // 最小长度后第一个有效标点位置
  let forceBreakIndex = -1 // 强制切分位置
  let i = 0
  const n = text.length

  // 扫描文本直到达到最大长度或文本结束
  while (i < n && count < MAX_SPLIT_LENGTH) {
    const char = text[i]

    // 处理汉字
    if (char >= '\u4e00' && char <= '\u9fff') {
      count++
      if (count === MAX_SPLIT_LENGTH) {
        forceBreakIndex = i + 1
      }
      i++
    }
    // 数字
    else if (char >= '0' && char <= '9') {
      count++
      if (count === MAX_SPLIT_LENGTH) {
        forceBreakIndex = i + 1
      }
      i++
    }
    // 英文单词
    else if ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')) {
      i++
      while (i < n && ((text[i] >= 'a' && text[i] <= 'z') || (text[i] >= 'A' && text[i] <= 'Z'))) {
        i++
      }
      count++
      if (count === MAX_SPLIT_LENGTH) {
        forceBreakIndex = i
      }
    }
    // 标点
    else {
      if (chinesePunctuations.has(char)) {
        if (count >= MIN_SPLIT_LENGTH && firstValidPunctAfterMin === -1) {
          firstValidPunctAfterMin = i
        }
        i++
      } else if (englishPunctuations.has(char)) {
        if (i + 1 >= n || text[i + 1] === ' ') {
          if (count >= MIN_SPLIT_LENGTH && firstValidPunctAfterMin === -1) {
            firstValidPunctAfterMin = i
          }
        }
        i++
      } else {
        i++
      }
    }
  }

  let splitIndex = -1
  if (firstValidPunctAfterMin !== -1) {
    splitIndex = firstValidPunctAfterMin + 1
  } else if (forceBreakIndex !== -1) {
    splitIndex = forceBreakIndex
  }

  if (splitIndex > 0 && splitIndex < text.length) {
    return [text.substring(0, splitIndex), text.substring(splitIndex)]
  }

  return [text]
}

// ====== 虚拟人状态（优化点 #9）======
// 原来是 ref<AvatarState>('')，改成 null 语义更明确
export const avatarState = ref<AvatarState | null>(null)

// Store类 - 业务逻辑处理
export class AppStore {
  private silenceTimer: number | null = null
  private asrLoopStopped = false

  // ======（前 5 点：防串线）======
  private asrSession = 0

  // ======（前 5 点：本地 speaking 锁）======
  private isTtsSpeaking = false

  // ======（优化点 #6）连续监听显式标记，不再用 silenceTimer 当 guard ======
  private isContinuousListening = false

  // ======（优化点 #10）空轮去抖计数 ======
  private emptyUtteranceCount = 0
  private readonly EMPTY_TO_STANDBY_THRESHOLD = 2

  /**
   * 连接虚拟人
   */
  async connectAvatar(): Promise<void> {
    const { appId, appSecret } = appState.avatar

    if (!validateConfig({ appId, appSecret }, ['appId', 'appSecret'])) {
      throw new Error('appId 或 appSecret 为空')
    }

    try {
      const avatar = await avatarService.connect(
        { appId, appSecret },
        {
          onSubtitleOn: (text: string) => {
            appState.ui.subTitleText = text
          },
          onSubtitleOff: () => {
            appState.ui.subTitleText = ''
          },
          onStateChange: (state: AvatarState) => {
            avatarState.value = state
          }
        }
      )

      appState.avatar.instance = avatar
      appState.avatar.connected = true

      // 初次连接，认为刚刚有“互动”
      this.updateLastUserVoice()

      avatarService.avatarGoOnline()
      avatarService.avatarToInteractiveIdle()

      this.startContinuousListening()
      console.log('[appStore] 已自动开启连续聆听')
    } catch (error) {
      appState.avatar.connected = false
      throw error
    }
  }

  /**
   * 断开虚拟人连接
   */
  disconnectAvatar(): void {
    this.stopContinuousListening()
    if (appState.avatar.instance) {
      avatarService.avatarGoOffline()
      avatarService.disconnect(appState.avatar.instance)
      appState.avatar.instance = null
      appState.avatar.connected = false
      avatarState.value = null
    }
  }

  /**
   * 发送消息到LLM并让虚拟人播报
   */
  async sendMessage(): Promise<string | undefined> {
    const { llm, ui, avatar } = appState

    if (!validateConfig(llm, ['apiKey']) || !ui.text || !avatar.instance) {
      return
    }

    try {
      const stream = await llmService.sendMessageWithStream(
        {
          provider: 'openai',
          model: llm.model,
          apiKey: llm.apiKey
        },
        ui.text
      )

      if (!stream) return

      await this.waitForAvatarReady()

      // （前 5 点 #1）完整文本累计
      let fullText = ''

      let buffer = ''
      let isFirstChunk = true

      // speak 入口：统一走 safeGenerateSSML（优化点 #11）
      const speakText = (text: string) => {
        const ssml = safeGenerateSSML(text || '')
        if (isFirstChunk) {
          avatar.instance!.speak(ssml, true, false)
          isFirstChunk = false
        } else {
          avatar.instance!.speak(ssml, false, false)
        }
      }

      // （前 5 点 #5）播报期间 speaking 锁
      this.isTtsSpeaking = true

      for await (const chunk of stream) {
        fullText += chunk
        buffer += chunk

        // （前 5 点 #2）while 连续切分
        while (true) {
          const arr = splitSentence(buffer)
          if (!arr || arr.length <= 1) break

          const part = (arr[0] || '').trim()
          if (part) speakText(part)

          buffer = arr[1] || ''
        }
      }

      // stream 结束后播掉残留
      if (buffer.trim().length > 0) {
        speakText(buffer)
      }

      // 结束标记
      const finalSsml = safeGenerateSSML('')
      avatar.instance.speak(finalSsml, false, true)

      await this.waitForAvatarSpeakDone(APP_CONFIG.SPEAK_INTERRUPT_DELAY + 30000)
      this.isTtsSpeaking = false

      return fullText
    } catch (error) {
      this.isTtsSpeaking = false
      console.error('发送消息失败:', error)
      throw error
    }
  }

  /**
   * 开始语音输入
   */
  startVoiceInput(callbacks: {
    onFinished: (text: string) => void
    onError: (error: any) => void
  }): void {
    appState.asr.isListening = true

    if (appState.interaction.mode === 'online') {
      avatarService.avatarToListen?.()
    }
  }

  /**
   * 停止语音输入
   */
  stopVoiceInput(): void {
    appState.asr.isListening = false
  }

  /**
   * 等待虚拟人准备就绪（不在说话状态）
   */
  private async waitForAvatarReady(): Promise<void> {
    if (avatarState.value === 'speak') {
      avatarService.avatarToThink()
      await delay(APP_CONFIG.SPEAK_INTERRUPT_DELAY)
    }
  }

  /**
   * 等待虚拟人播报结束（用于 speaking 锁释放）
   */
  private async waitForAvatarSpeakDone(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (avatarState.value !== 'speak') return
      await delay(200)
    }
  }

  /**
   * 开始连续监听
   */
  startContinuousListening(): void {
    // （优化点 #6）显式 guard，不再依赖 silenceTimer
    if (this.isContinuousListening) {
      logDebug('[appStore] 连续监听已启动（guard）')
      return
    }
    this.isContinuousListening = true

    // （前 5 点 #3）刷新 session
    this.asrSession += 1
    const session = this.asrSession

    this.asrLoopStopped = false
    this.emptyUtteranceCount = 0
    appState.interaction.mode = 'online'
    appState.interaction.lastUserVoiceAt = Date.now()

    // 启动 ASR 循环
    this.startAsrLoop(session)

    // 预留：未来扩展 offline/唤醒词
    const CHECK_INTERVAL = ASR_CONFIG.CHECK_INTERVAL_MS
    if (this.silenceTimer === null) {
      this.silenceTimer = window.setInterval(() => {
        // Phase2 扩展点
      }, CHECK_INTERVAL)
    }

    console.log('[appStore] 连续监听已启动')
  }

  /**
   * 停止连续监听
   */
  stopContinuousListening(): void {
    this.asrLoopStopped = true
    this.isContinuousListening = false

    // （前 5 点 #3）停止时 bump session，旧回调立刻失效
    this.asrSession += 1

    // （优化点 #8）强制清 speaking 锁，避免残留
    this.isTtsSpeaking = false

    if (this.silenceTimer !== null) {
      window.clearInterval(this.silenceTimer)
      this.silenceTimer = null
    }

    this.stopVoiceInput()

    const asr = getAsr()
    if (asr) {
      asr.stop()
    }

    console.log('[appStore] 连续监听已停止')
  }

  /**
   * 有有效语音时更新“最后一次用户说话时间”，同时从 standby 拉回 online
   */
  updateLastUserVoice() {
    appState.interaction.lastUserVoiceAt = Date.now()
    logDebug('[appStore] lastUserVoiceAt 更新为', appState.interaction.lastUserVoiceAt)

    if (appState.interaction.mode === 'standby') {
      appState.interaction.mode = 'online'
      logDebug('[appStore] 从 standby 切回 online')
    }
  }

  /**
   * 内部使用：ASR 循环（带 session 防串线）
   */
  private async startAsrLoop(session: number) {
    const asr = getAsr()
    if (!asr) {
      console.warn('[appStore] ASR 未初始化，无法启动 ASR 循环')
      return
    }

    const loop = () => {
      if (this.asrLoopStopped) return
      if (session !== this.asrSession) return

      // speaking 锁 / speak 状态都阻止 ASR 重启
      if (this.isTtsSpeaking || avatarState.value === 'speak') {
        setTimeout(() => {
          if (!this.asrLoopStopped && session === this.asrSession) loop()
        }, 500)
        return
      }

      // offline 不终止 loop（前 5 点 #4）
      if (appState.interaction.mode === 'offline') {
        logDebug('[appStore] offline：轮询等待恢复')
        setTimeout(() => {
          if (!this.asrLoopStopped && session === this.asrSession) loop()
        }, 1000)
        return
      }

      const callbacks = {
        onFinished: async (text: string) => {
          if (this.asrLoopStopped) return
          if (session !== this.asrSession) return

          const trimmed = text.trim()
          const prevMode = appState.interaction.mode

          if (trimmed) {
            // （优化点 #10）有内容：清空空轮计数
            this.emptyUtteranceCount = 0

            this.updateLastUserVoice()
            logDebug('[ASR loop] 识别结果:', trimmed)

            if (prevMode === 'standby') {
              logDebug('[appStore] 从 standby 被唤醒，补一个 listen 动作')
              avatarService.avatarToListen?.()
            }

            if (appState.interaction.mode !== 'offline') {
              appState.ui.text = trimmed
              await this.sendMessage()
            }
          } else {
            // （优化点 #10）空轮去抖：累计到阈值才切 standby
            this.emptyUtteranceCount += 1
            logDebug('[appStore] 空轮计数 =', this.emptyUtteranceCount)

            if (
              this.emptyUtteranceCount >= this.EMPTY_TO_STANDBY_THRESHOLD &&
              appState.interaction.mode !== 'standby'
            ) {
              appState.interaction.mode = 'standby'
              logDebug('[appStore] 连续空轮达到阈值，切换到 standby')
              avatarService.avatarToInteractiveIdle()
            }
          }

          setTimeout(() => {
            if (this.asrLoopStopped) return
            if (session !== this.asrSession) return

            this.stopVoiceInput()
            loop()
          }, 500)
        },

        onError: (err: any) => {
          if (this.asrLoopStopped) return
          if (session !== this.asrSession) return

          // （优化点 #7）错误时确保 isListening 复位
          this.stopVoiceInput()

          console.error('[ASR loop] 出错:', err)
          setTimeout(() => {
            if (!this.asrLoopStopped && session === this.asrSession) loop()
          }, 1000)
        }
      }

      // 开启这一轮录音
      this.startVoiceInput(callbacks)

      void asr.start(callbacks, ASR_CONFIG.MAX_UTTERANCE_MS).catch((err: any) => {
        // （优化点 #7）start 失败也要复位 isListening，避免 UI 卡死
        this.stopVoiceInput()
        console.error('[ASR loop] start 出错:', err)

        // 维持 loop：稍后重试
        setTimeout(() => {
          if (!this.asrLoopStopped && session === this.asrSession) loop()
        }, 1000)
      })
    }

    loop()
  }
}

// 导出单例
export const appStore = new AppStore()