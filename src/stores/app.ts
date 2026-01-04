import { reactive, ref } from 'vue'
import type { AppState, AvatarConfig, AsrConfig, LlmConfig, AsrCallbacks } from '../types'
import { LLM_CONFIG, APP_CONFIG } from '../constants'
import { validateConfig, delay, generateSSML } from '../utils'
import { avatarService } from '../services/avatar'
import { llmService } from '../services/llm'

const {
  VITE_AVATAR_APP_ID,
  VITE_AVATAR_APP_SECRET,
} = import.meta.env

// 应用状态
export const appState = reactive<AppState>({
  avatar: {
    appId: VITE_AVATAR_APP_ID,
    appSecret: VITE_AVATAR_APP_SECRET,
    connected: false,
    instance: null
  },
  asr: {
    // provider: 'tx',
    provider: 'sensevoice',
    sensevoiceUrl: 'api/asr',
    // appId: '',
    // secretId: '',
    // secretKey: '',
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
    mode: 'online',
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
      // 记录达到最大长度时的位置
      if (count === MAX_SPLIT_LENGTH) {
        forceBreakIndex = i + 1 // 在汉字后切分
      }
      i++
    }
    // 处理数字序列
    else if (char >= '0' && char <= '9') {
      count++
      if (count === MAX_SPLIT_LENGTH) {
        forceBreakIndex = i + 1
      }
      i++
    }
    // 处理英文字母序列（单词）
    else if ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')) {
      // 扫描整个英文单词
      const start = i
      i++
      while (i < n && ((text[i] >= 'a' && text[i] <= 'z') || (text[i] >= 'A' && text[i] <= 'Z'))) {
        i++
      }
      count++
      if (count === MAX_SPLIT_LENGTH) {
        forceBreakIndex = i // 在单词后切分
      }
    }
    // 处理标点符号
    else {
      if (chinesePunctuations.has(char)) {
        // 达到最小长度后记录第一个有效中文标点
        if (count >= MIN_SPLIT_LENGTH && firstValidPunctAfterMin === -1) {
          firstValidPunctAfterMin = i
        }
        i++
      } else if (englishPunctuations.has(char)) {
        // 英文标点：检查后跟空格或结束
        if (i + 1 >= n || text[i + 1] === ' ') {
          // 达到最小长度后记录第一个有效英文标点
          if (count >= MIN_SPLIT_LENGTH && firstValidPunctAfterMin === -1) {
            firstValidPunctAfterMin = i
          }
        }
        i++
      } else {
        // 其他字符（如空格、符号等），跳过
        i++
      }
    }
  }

  // 确定切分位置
  let splitIndex = -1
  if (firstValidPunctAfterMin !== -1) {
    splitIndex = firstValidPunctAfterMin + 1
  } else if (forceBreakIndex !== -1) {
    splitIndex = forceBreakIndex
  }

  // 返回切分结果
  if (splitIndex > 0 && splitIndex < text.length) {
    return [text.substring(0, splitIndex), text.substring(splitIndex)]
  }

  return [text]
}

// 虚拟人状态
export const avatarState = ref('')

// Store类 - 业务逻辑处理
export class AppStore {
  private silenceTimer: number | null = null
  private asrLoopStopped = false
  /**
   * 连接虚拟人
   * @returns {Promise<void>} - 返回连接结果的Promise
   * @throws {Error} - 当appId或appSecret为空或连接失败时抛出错误
   */
  async connectAvatar(): Promise<void> {
    const { appId, appSecret } = appState.avatar

    if (!validateConfig({ appId, appSecret }, ['appId', 'appSecret'])) {
      throw new Error('appId 或 appSecret 为空')
    }

    try {
      const avatar = await avatarService.connect({
        appId,
        appSecret
      }, {
        onSubtitleOn: (text: string) => {
          appState.ui.subTitleText = text
        },
        onSubtitleOff: () => {
          appState.ui.subTitleText = ''
        },
        onStateChange: (state: string) => {
          avatarState.value = state
        }
      })

      appState.avatar.instance = avatar
      appState.avatar.connected = true

      avatarService.avatarGoOnline()
      avatarService.avatarToInteractiveIdle()

      this.startContinuousListening()
    } catch (error) {
      appState.avatar.connected = false
      throw error
    }
  }

  /**
   * 断开虚拟人连接
   * @returns {void}
   */
  disconnectAvatar(): void {
    this.stopContinuousListening()
    if (appState.avatar.instance) {
      avatarService.avatarGoOffline()
      avatarService.disconnect(appState.avatar.instance)
      appState.avatar.instance = null
      appState.avatar.connected = false
      avatarState.value = ''
    }
  }

  /**
   * 发送消息到LLM并让虚拟人播报
   * @returns {Promise<string | undefined>} - 返回大语言模型的回复内容，失败时返回undefined
   * @throws {Error} - 当发送消息失败时抛出错误
   */
  async sendMessage(): Promise<string | undefined> {
    const { llm, ui, avatar } = appState

    if (!validateConfig(llm, ['apiKey']) || !ui.text || !avatar.instance) {
      return
    }

    try {
      // 发送到LLM获取回复
      const stream = await llmService.sendMessageWithStream({
        provider: 'openai',
        model: llm.model,
        apiKey: llm.apiKey
      }, ui.text)

      if (!stream) return

      // 等待虚拟人停止说话
      await this.waitForAvatarReady()

      // avatarService.avatarToThink()

      // 流式播报响应内容
      let buffer = ''
      let isFirstChunk = true

      for await (const chunk of stream) {
        buffer += chunk
        const arr = splitSentence(buffer)

        if (arr.length > 1) {
          const ssml = generateSSML(arr[0] || '')
          if (isFirstChunk) {
            // 第一句话：ssml true false
            avatar.instance.speak(ssml, true, false)
            isFirstChunk = false
          } else {
            // 中间的话：ssml false false
            avatar.instance.speak(ssml, false, false)
          }

          buffer = arr[1] || ''
        }
      }

      // 处理剩余的字符
      if (buffer.length > 0) {
        const ssml = generateSSML(buffer)

        if (isFirstChunk) {
          // 第一句话：ssml true false
          avatar.instance.speak(ssml, true, false)
        } else {
          // 中间的话：ssml false false
          avatar.instance.speak(ssml, false, false)
        }
      }

      // 最后一句话：ssml false true
      const finalSsml = generateSSML('')
      avatar.instance.speak(finalSsml, false, true)

      // avatarService.avatarToInteractiveIdle()

      return buffer
    } catch (error) {
      console.error('发送消息失败:', error)
      throw error
    }
  }

  /**
   * 开始语音输入
   * @param callbacks - 回调函数集合
   * @param callbacks.onFinished - 语音识别完成回调
   * @param callbacks.onError - 语音识别错误回调
   * @returns {void}
   */
  startVoiceInput(callbacks: {
    onFinished: (text: string) => void
    onError: (error: any) => void
  }): void {
    appState.asr.isListening = true
    // ASR逻辑由组件处理
    avatarService.avatarToListen?.()
  }

  /**
   * 停止语音输入
   * @returns {void}
   */
  stopVoiceInput(): void {
    appState.asr.isListening = false
  }

  /**
   * 等待虚拟人准备就绪（不在说话状态）
   * @returns {Promise<void>} - 返回等待完成的Promise
   */
  private async waitForAvatarReady(): Promise<void> {
    if (avatarState.value === 'speak') {
      avatarService.avatarToThink()
      await delay(APP_CONFIG.SPEAK_INTERRUPT_DELAY)
    }
  }


  /**
    * 开始监听
    * @returns {void}
    */
  startContinuousListening(): void {
    if (this.silenceTimer !== null) {
      console.log('[appStore] 连续监听已启动')
      return
    }

    this.asrLoopStopped = false
    // appState.interaction.lastUserVoiceAt = Date.now()
    appState.interaction.mode = 'online'

    // 1. 启动 ASR 循环
    this.startAsrLoop()

    // 2. 启动静音检测定时器
    const CHECK_INTERVAL = 500  // 每 500ms 检查一次
    this.silenceTimer = window.setInterval(() => {
      const now = Date.now()
      const last = appState.interaction.lastUserVoiceAt

      if (!last) return

      const diff = now - last

      if (avatarState.value === 'speak') {
        return
      }
      // console.log('[timer]', diff, avatarState.value, appState.interaction.mode)

      // 已经离线就不再切状态，这里后面加唤醒词逻辑
      if (appState.interaction.mode === 'offline') {
        return
      }

      // 3 秒无人说话 → 待机互动
      if (diff >= 3000 && diff < 5000 && appState.interaction.mode !== 'standby') {
        appState.interaction.mode = 'standby'
        avatarService.avatarToInteractiveIdle()
      }

      // 5 秒无人说话 → offline
      // if (diff >= 10000) {
      //   appState.interaction.mode = 'offline'
      //   avatarService.avatarGoOffline()
      // }
    }, CHECK_INTERVAL)

    console.log('[appStore] 连续监听已启动')
  }

  /**
   * 停止监听
   * @returns {void}
   */
  stopContinuousListening(): void {
    this.asrLoopStopped = true

    if (this.silenceTimer !== null) {
      window.clearInterval(this.silenceTimer)
      this.silenceTimer = null
    }

    // 停止按钮那条逻辑保持不变
    this.stopVoiceInput()

    const asr = (window as any).__asr
    if (asr && typeof asr.stop === 'function') {
      asr.stop()
    }

    console.log('[appStore] 连续监听已停止')
  }


  updateLastUserVoice() {
    appState.interaction.lastUserVoiceAt = Date.now()
    console.log('[appStore] lastUserVoiceAt 更新为', appState.interaction.lastUserVoiceAt)

    if (appState.interaction.mode === 'standby') {
      appState.interaction.mode = 'online'
    }
    // 如果之前因为静音切到了 standby/offline，后面我们会在这里拉回 online
    // 现在先不动，下一步加“离线唤醒词”的时候再细化
  }



  /**
   * 内部使用：ASR 循环
   * 假设你在某个地方已经 useAsr(...) 并把 start/stop 注入到了 appStore，
   * 否则这里可以通过依赖注入或直接传进来。
   */
  private async startAsrLoop() {
    const asr = (window as any).__asr
    if (!asr || typeof asr.start !== 'function') {
      console.warn('[appStore] __asr 未初始化，无法启动 ASR 循环')
      return
    }

    const loop = () => {
      if (this.asrLoopStopped) return

      if (avatarState.value === 'speak') {
        setTimeout(() => {
          if (!this.asrLoopStopped) loop()
        }, 500)
        return
      }

      const callbacks = {
        onFinished: async (text: string) => {
          const trimmed = text.trim()
          if (trimmed) {
            // 有识别结果 → 认为这一轮有人说话
            this.updateLastUserVoice()

            console.log('[ASR loop] 识别结果:', trimmed)

            // 如果没离线，就当成正常问题 → 走 sendMessage
            if (appState.interaction.mode !== 'offline') {
              appState.ui.text = trimmed
              await this.sendMessage()
            }
          }

          setTimeout(() => {
            // 1. 先关掉 UI 层“正在聆听”的标记
            this.stopVoiceInput()  // isListening = false，聆听动画收回

            // 2. 再启动下一轮监听
            if (!this.asrLoopStopped) {
              loop()
            }
          }, 3000)
        },
        onError: (err: any) => {
          console.error('[ASR loop] 出错:', err)
          if (!this.asrLoopStopped) {
            setTimeout(() => loop(), 1000)
          }
        }
      }

      //  这一行：复用你“按钮点击时”的逻辑（会把 isListening = true，触发聆听动画）
      this.startVoiceInput(callbacks)

      //  然后真正开始录音 + 识别
      asr.start(callbacks)
    }

    loop()
  }
}

// 导出单例
export const appStore = new AppStore()
