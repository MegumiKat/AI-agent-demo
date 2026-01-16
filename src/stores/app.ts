import { reactive, ref } from 'vue'
import type {
  AppState,
  AvatarState,
} from '../types'
import { LLM_CONFIG, APP_CONFIG, ASR_CONFIG, INTERACTION_CONFIG } from '../constants'
import { validateConfig, delay, generateSSML } from '../utils'
import { avatarService } from '../services/avatar'
import { llmService } from '../services/llm'
import { getAsr } from '../composables/asrRegistry'

const {
  VITE_AVATAR_APP_ID,
  VITE_AVATAR_APP_SECRET,
} = import.meta.env

// ====== 日志开关 ======
const VERBOSE_LOG = import.meta.env.DEV
function logDebug(...args: any[]) {
  if (VERBOSE_LOG) console.log(...args)
}

// ====== SSML 安全转义 ======
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
function safeGenerateSSML(text: string): string {
  return generateSSML(escapeXml(text))
}

// ====== 语音指令匹配：normalize + match ======
function normalizeCmd(text: string): string {
  if (!text) return ''
  let t = text.trim().toLowerCase()
  // 去空格
  t = t.replace(/\s+/g, '')
  // 去常见中英标点
  t = t.replace(/[，,。.!！？?、；;：:"'“”‘’（）()\[\]【】]/g, '')
  return t
}

function matchPhrase(
  text: string,
  phrases: readonly string[],
  mode: 'contains' | 'equals'
): boolean {
  const norm = normalizeCmd(text)
  if (!norm) return false
  const list = phrases.map(p => normalizeCmd(p)).filter(Boolean)
  if (list.length === 0) return false
  if (mode === 'equals') return list.includes(norm)
  return list.some(p => norm.includes(p))
}

// 应用状态
export const appState = reactive<AppState>({
  avatar: {
    appId: VITE_AVATAR_APP_ID,
    appSecret: VITE_AVATAR_APP_SECRET,
    connected: false,
    instance: null,
  },
  asr: {
    provider: 'sensevoice',
    sensevoiceUrl: '',
    isListening: false,
  },
  llm: {
    model: LLM_CONFIG.DEFAULT_MODEL,
    apiKey: LLM_CONFIG.API_KEY,
  },
  ui: {
    text: '',
    subTitleText: '',
  },
  interaction: {
    mode: 'standby', // 默认待机
    lastUserVoiceAt: 0,
    wakeWord: '唤醒助手', // 兼容字段：实际以 INTERACTION_CONFIG.WAKE_PHRASES 为准
  },
})

// ====== 分句（保留你原实现）======
const MIN_SPLIT_LENGTH = 2
const MAX_SPLIT_LENGTH = 20
function splitSentence(text: string): string[] {
  if (!text) return []
  const chinesePunctuations = new Set(['、', '，', '：', '；', '。', '？', '！', '…', '\n'])
  const englishPunctuations = new Set([',', ':', ';', '.', '?', '!'])

  let count = 0
  let firstValidPunctAfterMin = -1
  let forceBreakIndex = -1
  let i = 0
  const n = text.length

  while (i < n && count < MAX_SPLIT_LENGTH) {
    const char = text[i]

    if (char >= '\u4e00' && char <= '\u9fff') {
      count++
      if (count === MAX_SPLIT_LENGTH) forceBreakIndex = i + 1
      i++
    } else if (char >= '0' && char <= '9') {
      count++
      if (count === MAX_SPLIT_LENGTH) forceBreakIndex = i + 1
      i++
    } else if ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')) {
      i++
      while (i < n && ((text[i] >= 'a' && text[i] <= 'z') || (text[i] >= 'A' && text[i] <= 'Z'))) {
        i++
      }
      count++
      if (count === MAX_SPLIT_LENGTH) forceBreakIndex = i
    } else {
      if (chinesePunctuations.has(char)) {
        if (count >= MIN_SPLIT_LENGTH && firstValidPunctAfterMin === -1) firstValidPunctAfterMin = i
        i++
      } else if (englishPunctuations.has(char)) {
        if (i + 1 >= n || text[i + 1] === ' ') {
          if (count >= MIN_SPLIT_LENGTH && firstValidPunctAfterMin === -1) firstValidPunctAfterMin = i
        }
        i++
      } else {
        i++
      }
    }
  }

  let splitIndex = -1
  if (firstValidPunctAfterMin !== -1) splitIndex = firstValidPunctAfterMin + 1
  else if (forceBreakIndex !== -1) splitIndex = forceBreakIndex

  if (splitIndex > 0 && splitIndex < text.length) {
    return [text.substring(0, splitIndex), text.substring(splitIndex)]
  }
  return [text]
}

// 虚拟人状态
export const avatarState = ref<AvatarState | null>(null)

// Store类
export class AppStore {
  private asrLoopStopped = false
  private asrSession = 0
  private isTtsSpeaking = false
  private isContinuousListening = false

  // 防抖：避免唤醒/关闭连续触发
  private wakeCooldownUntil = 0
  private stopCooldownUntil = 0

  // ========== 对外：按钮唤醒/按钮关闭（可选但推荐）==========
  public wake(source: 'voice' | 'button' = 'button') {
    const now = Date.now()
    if (now < this.wakeCooldownUntil) return
    this.wakeCooldownUntil = now + INTERACTION_CONFIG.WAKE_COOLDOWN_MS

    appState.interaction.mode = 'online'
    this.updateLastUserVoice()
    avatarService.avatarToListen?.()
    console.log(`[appStore] wake(${source}) -> online`)
  }

  public enterStandby() {
    const now = Date.now()
    if (now < this.stopCooldownUntil) return
    this.stopCooldownUntil = now + INTERACTION_CONFIG.STOP_COOLDOWN_MS

    appState.interaction.mode = 'standby'
    avatarService.avatarToInteractiveIdle()
    console.log('[appStore] enterStandby -> standby')
  }

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
          },
        }
      )

      appState.avatar.instance = avatar
      appState.avatar.connected = true

      // 连接后默认待机
      appState.interaction.mode = 'standby'
      appState.interaction.lastUserVoiceAt = Date.now()

      avatarService.avatarGoOnline()
      avatarService.avatarToInteractiveIdle()

      // 启动 ASR 总循环（一直跑，但 standby 不会回复）
      this.startContinuousListening()
      console.log('[appStore] 已启动监听循环（standby 模式：仅等待唤醒）')
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
          apiKey: llm.apiKey,
        },
        ui.text
      )

      if (!stream) return

      await this.waitForAvatarReady()

      let fullText = ''
      let buffer = ''
      let isFirstChunk = true

      const speakText = (text: string) => {
        const inst = appState.avatar.instance
        if (!inst) throw new Error('avatar instance missing (disconnected)')
        const ssml = safeGenerateSSML(text || '')
        if (isFirstChunk) {
          inst.speak(ssml, true, false)
          isFirstChunk = false
        } else {
          inst.speak(ssml, false, false)
        }
      }

      this.isTtsSpeaking = true

      for await (const chunk of stream) {
        fullText += chunk
        buffer += chunk

        while (true) {
          const arr = splitSentence(buffer)
          if (!arr || arr.length <= 1) break
          const part = (arr[0] || '').trim()
          if (part) speakText(part)
          buffer = arr[1] || ''
        }
      }

      if (buffer.trim().length > 0) {
        speakText(buffer)
      }

      // 结束标记
      const inst = appState.avatar.instance
      if (inst) {
        const finalSsml = safeGenerateSSML('')
        inst.speak(finalSsml, false, true)
      }

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
  startVoiceInput(callbacks: { onFinished: (text: string) => void; onError: (error: any) => void }): void {
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
   * 等待虚拟人播报结束
   */
  private async waitForAvatarSpeakDone(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (avatarState.value !== 'speak') return
      await delay(200)
    }
  }

  /**
   * 开始连续监听（总循环）
   * - 注意：不再强制把 mode 改为 online
   */
  startContinuousListening(): void {
    if (this.isContinuousListening) {
      logDebug('[appStore] 连续监听已启动（guard）')
      return
    }
    this.isContinuousListening = true

    this.asrSession += 1
    const session = this.asrSession

    this.asrLoopStopped = false

    // 启动 ASR 循环
    this.startAsrLoop(session)

    console.log('[appStore] 连续监听循环已启动')
  }

  /**
   * 停止连续监听
   */
  stopContinuousListening(): void {
    this.asrLoopStopped = true
    this.isContinuousListening = false

    // 停止时 bump session，旧回调立刻失效
    this.asrSession += 1
    this.isTtsSpeaking = false

    this.stopVoiceInput()

    const asr = getAsr()
    if (asr) {
      asr.stop()
    }

    console.log('[appStore] 连续监听已停止')
  }

  /**
   * 更新“最后一次用户说话时间”
   * - 注意：不再在这里把 standby 强行切 online
   * - 是否唤醒由唤醒词决定（见 ASR loop）
   */
  updateLastUserVoice() {
    appState.interaction.lastUserVoiceAt = Date.now()
    logDebug('[appStore] lastUserVoiceAt 更新为', appState.interaction.lastUserVoiceAt)
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

      // speaking 锁 / speak 状态都阻止开启新一轮录音
      if (this.isTtsSpeaking || avatarState.value === 'speak') {
        setTimeout(() => {
          if (!this.asrLoopStopped && session === this.asrSession) loop()
        }, 500)
        return
      }

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

          // 防回授：如果录音期间开始播报了，丢弃本轮结果
          if (this.isTtsSpeaking || avatarState.value === 'speak') {
            this.stopVoiceInput()
            setTimeout(() => {
              if (!this.asrLoopStopped && session === this.asrSession) loop()
            }, 500)
            return
          }

          const trimmed = (text || '').trim()
          const mode = appState.interaction.mode
          const now = Date.now()

          // ===== standby：只检测唤醒词，不走 LLM =====
          if (mode === 'standby') {
            const isWake =
              now >= this.wakeCooldownUntil &&
              matchPhrase(trimmed, INTERACTION_CONFIG.WAKE_PHRASES, INTERACTION_CONFIG.WAKE_MATCH_MODE)

            if (isWake) {
              this.wakeCooldownUntil = now + INTERACTION_CONFIG.WAKE_COOLDOWN_MS
              appState.interaction.mode = 'online'
              this.updateLastUserVoice()
              avatarService.avatarToListen?.()
              console.log('[appStore] voice wake -> online')
            }

            setTimeout(() => {
              if (this.asrLoopStopped) return
              if (session !== this.asrSession) return
              this.stopVoiceInput()
              loop()
            }, INTERACTION_CONFIG.WAKE_LOOP_RETRY_MS)
            return
          }

          // ===== online：先检测关闭词 =====
          const isStop =
            now >= this.stopCooldownUntil &&
            matchPhrase(trimmed, INTERACTION_CONFIG.STOP_PHRASES, INTERACTION_CONFIG.STOP_MATCH_MODE)

          if (isStop) {
            this.stopCooldownUntil = now + INTERACTION_CONFIG.STOP_COOLDOWN_MS
            appState.interaction.mode = 'standby'
            avatarService.avatarToInteractiveIdle()
            console.log('[appStore] voice stop -> standby')

            setTimeout(() => {
              if (this.asrLoopStopped) return
              if (session !== this.asrSession) return
              this.stopVoiceInput()
              loop()
            }, INTERACTION_CONFIG.WAKE_LOOP_RETRY_MS)
            return
          }

          // ===== online：正常对话 =====
          if (trimmed) {
            this.updateLastUserVoice()
            logDebug('[ASR loop] 识别结果:', trimmed)

            if (appState.interaction.mode !== 'offline') {
              appState.ui.text = trimmed
              await this.sendMessage()
            }
          }

          setTimeout(() => {
            if (this.asrLoopStopped) return
            if (session !== this.asrSession) return
            this.stopVoiceInput()
            loop()
          }, INTERACTION_CONFIG.NEXT_TURN_DELAY_MS)
        },

        onError: (err: any) => {
          if (this.asrLoopStopped) return
          if (session !== this.asrSession) return

          this.stopVoiceInput()
          console.error('[ASR loop] 出错:', err)

          setTimeout(() => {
            if (!this.asrLoopStopped && session === this.asrSession) loop()
          }, 1000)
        },
      }

      // 开启这一轮录音
      this.startVoiceInput(callbacks)

      // 根据模式决定本轮录音窗口
      const dur =
        appState.interaction.mode === 'standby'
          ? INTERACTION_CONFIG.WAKE_UTTERANCE_MS
          : INTERACTION_CONFIG.TURN_UTTERANCE_MS

      void asr.start(callbacks, dur).catch((err: any) => {
        this.stopVoiceInput()
        console.error('[ASR loop] start 出错:', err)

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