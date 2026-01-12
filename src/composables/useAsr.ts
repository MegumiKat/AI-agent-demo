import { ref } from 'vue'
import type { AsrConfig, AsrCallbacks } from '../types'
import { registerAsr } from './asrRegistry'
import { ASR_CONFIG } from '../constants'

// 默认的后端地址：通过 Vite 代理转发到 8001
const DEFAULT_SENSEVOICE_URL = ASR_CONFIG.DEFAULT_URL

function getAsrUrl(config: AsrConfig): string {
  return config.sensevoiceUrl || DEFAULT_SENSEVOICE_URL
}

/**
 * 使用本地 SenseVoice ASR 的语音识别 Composable
 * 对外接口保持不变：asrText, isListening, start, stop
 */
export function useAsr(config: AsrConfig) {
  const asrText = ref('')
  const isListening = ref(false)

  let mediaRecorder: MediaRecorder | null = null
  let chunks: BlobPart[] = []
  let stream: MediaStream | null = null
  let stopTimer: number | null = null
  let isRecording = false         // 内部录音状态，防重入

    // 静音检测相关
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let silenceCheckId: number | null = null
    let lastVoiceTs = 0



    const cleanupAudio = () => {
      if (silenceCheckId !== null) {
        cancelAnimationFrame(silenceCheckId)
        silenceCheckId = null
      }
      if (audioCtx) {
        try {
          audioCtx.close()
        } catch {
          // 某些浏览器可能抛异常，忽略即可
        }
        audioCtx = null
        analyser = null
      }
    }

  /**
   * 调用后端 SenseVoice /asr 接口
   */
  const sendToSenseVoice = async (blob: Blob, callbacks: AsrCallbacks) => {
    try {
      const formData = new FormData()
      // 字段名 audio 要和后端 FastAPI 的参数名一致
      formData.append('audio', blob, 'audio.webm')

      const resp = await fetch(getAsrUrl(config), {
        method: 'POST',
        body: formData
      })

      if (!resp.ok) {
        throw new Error(`ASR 请求失败: ${resp.status} ${resp.statusText}`)
      }

      const data = await resp.json() as { text?: string; error?: string }
      if (data.error) {
        throw new Error(data.error)
      }

      const text = data.text || ''
      console.log(text)
      asrText.value = text
      callbacks.onFinished(text)
    } catch (err: any) {
      // ⭐ 这里也把 AbortError 当成“正常中断”，不走 onError
      if (err?.name === 'AbortError') {
        console.warn('调用 SenseVoice 被中止(AbortError)，一般是页面刷新/离开导致，可忽略')
      } else {
        console.error('调用 SenseVoice 失败:', err)
        callbacks.onError(err)
      }
    } finally {
      isListening.value = false
      isRecording = false   // 无论成功失败，录音状态都重置

      // 释放麦克风
      if (stream) {
        stream.getTracks().forEach(t => t.stop())
        stream = null
      }

      mediaRecorder = null
      chunks = []
      if (stopTimer !== null) {
        window.clearTimeout(stopTimer)
        stopTimer = null
      }
      cleanupAudio()
    }
  }

    /**
   * 简单静音检测：
   * - 每帧读取音频数据，算 RMS（能量）
   * - RMS > 阈值 => 有人在说话，更新 lastVoiceTs
   * - 当前时间 - lastVoiceTs > SILENCE_HOLD_MS => 认为说完了，自动 stop()
   */
    const setupSilenceDetector = () => {
      if (!stream || audioCtx) return
  
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const source = audioCtx.createMediaStreamSource(stream)
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 2048
  
        source.connect(analyser)
  
        const data = new Float32Array(analyser.fftSize)
        lastVoiceTs = performance.now()
  
        const threshold = ASR_CONFIG.SILENCE_THRESHOLD
        const holdMs = ASR_CONFIG.SILENCE_HOLD_MS
  
        const check = () => {
          if (!analyser || !audioCtx) return
          if (!isRecording || !isListening.value) return  // 已经没在录，就不检测了
  
          analyser.getFloatTimeDomainData(data)
  
          // 计算 RMS
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const v = data[i]
            sum += v * v
          }
          const rms = Math.sqrt(sum / data.length)
  
          if (rms > threshold) {
            // 有明显声音
            lastVoiceTs = performance.now()
          } else {
            const now = performance.now()
            if (now - lastVoiceTs > holdMs) {
              console.log(
                '[ASR] 检测到静音超过',
                holdMs,
                'ms，自动 stop()'
              )
              stop()
              return
            }
          }
  
          silenceCheckId = requestAnimationFrame(check)
        }
  
        silenceCheckId = requestAnimationFrame(check)
      } catch (err) {
        console.warn('初始化静音检测失败，降级为仅按最大时长停止:', err)
        cleanupAudio()
      }
    }
  /**
   * 开始语音识别（开始录音）
   */
  const start = async (
    callbacks: AsrCallbacks,
    maxUtteranceMs?: number,       // 第二个参数改个名字，更符合语义
  ) => {
    // ⭐ 用内部 isRecording 防止重入
    if (isRecording) {
      console.warn('语音识别已在进行中')
      return
    }

    isRecording = true

    try {
      // 1. 申请麦克风
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks = []

      // 2. 初始化 MediaRecorder
      mediaRecorder = new MediaRecorder(stream)

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onerror = (event: Event) => {
        const err = (event as any).error
        if (err?.name === 'AbortError') {
          console.warn('MediaRecorder 被中止(AbortError)，通常是 stop/刷新导致，可忽略')
        } else {
          console.error('MediaRecorder 错误:', err)
          callbacks.onError(err)
        }
        isListening.value = false
        isRecording = false
        cleanupAudio()
      }

      mediaRecorder.onstop = () => {
        if (!chunks.length) {
          console.warn('没有录到音频数据')
          isListening.value = false
          isRecording = false
          if (stream) {
            stream.getTracks().forEach((t) => t.stop())
            stream = null
          }
          mediaRecorder = null
          chunks = []
          cleanupAudio()
          return
        }

        const blob = new Blob(chunks, { type: 'audio/webm' })
        console.log('录音结束，发送到 SenseVoice，大小:', blob.size)
        void sendToSenseVoice(blob, callbacks)
      }

      mediaRecorder.start()
      isListening.value = true
      asrText.value = ''
      console.log('开始录音（SenseVoice）')

      // ⭐ 启动静音检测
      setupSilenceDetector()

      // ⭐ 兜底最大录音时长：
      //    优先用参数 -> 配置里的 vadSilenceTime -> 全局 ASR_CONFIG.MAX_UTTERANCE_MS
      const timeout =
        maxUtteranceMs ??
        config.vadSilenceTime ??
        ASR_CONFIG.MAX_UTTERANCE_MS

      if (timeout > 0) {
        stopTimer = window.setTimeout(() => {
          console.log('[ASR] 达到最长录音时长，stop()')
          stop()
        }, timeout)
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.warn('获取麦克风或初始化录音时被中止(AbortError)，可能是页面刷新或 stop 导致，可忽略')
      } else {
        console.error('获取麦克风或初始化录音失败:', err)
        callbacks.onError(err)
      }
      isListening.value = false
      isRecording = false
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
        stream = null
      }
      cleanupAudio()
    }
  }
  /**
  * 停止语音识别（结束录音，触发 onstop → sendToSenseVoice）
  */
  const stop = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop()
        console.log('停止录音，准备发送到 SenseVoice')
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          console.warn('调用 MediaRecorder.stop 时发生 AbortError，可忽略')
        } else {
          console.error('MediaRecorder.stop 出错:', err)
        }
        isRecording = false
        isListening.value = false
        if (stream) {
          stream.getTracks().forEach((t) => t.stop())
          stream = null
        }
        mediaRecorder = null
        chunks = []
        cleanupAudio()
      }
    } else {
      console.log('MediaRecorder 未在录音状态')
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
        stream = null
      }
      isListening.value = false
      isRecording = false
      cleanupAudio()
    }
  }

  // ⭐ 在这里注册全局 ASR 实例，给 AppStore 使用
  registerAsr({
    start,
    stop,
  })

  return {
    asrText,
    isListening,
    start,
    stop
  }
}