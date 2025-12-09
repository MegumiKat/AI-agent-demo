import { ref } from 'vue'
import type { AsrConfig, AsrCallbacks } from '../types'

// 默认的后端地址（你 curl 用的是啥就写啥）
const DEFAULT_SENSEVOICE_URL = 'http://localhost:8001/asr'

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
    } catch (err) {
      console.error('调用 SenseVoice 失败:', err)
      callbacks.onError(err)
    } finally {
      isListening.value = false

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
    }
  }

  /**
   * 开始语音识别（开始录音）
   */
  const start = async (callbacks: AsrCallbacks, vadSilenceTime?: number) => {
    if (isListening.value) {
      console.warn('语音识别已在进行中')
      return
    }

    try {
      // 1. 申请麦克风权限
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
        // 很多浏览器会把 error 挂在 event 上，这里用 as any 取一下
        const err = (event as any).error
        console.error('MediaRecorder 错误:', err)
        callbacks.onError(err)
        isListening.value = false
      }

      // 3. 停止录音时，把音频发送到本地 SenseVoice
      mediaRecorder.onstop = () => {
        if (!chunks.length) {
          console.warn('没有录到音频数据')
          isListening.value = false
          return
        }

        const blob = new Blob(chunks, { type: 'audio/webm' })
        console.log('录音结束，发送到 SenseVoice，大小:', blob.size)
        void sendToSenseVoice(blob, callbacks)
      }

      // 4. 开始录音
      mediaRecorder.start()
      isListening.value = true
      asrText.value = ''
      console.log('开始录音（SenseVoice）')

      // 可选：根据静音时间自动停止录音
      const timeout =
        vadSilenceTime || config.vadSilenceTime || 0
      if (timeout > 0) {
        stopTimer = window.setTimeout(() => {
          stop()
        }, timeout)
      }
    } catch (err) {
      console.error('获取麦克风或初始化录音失败:', err)
      callbacks.onError(err)
      isListening.value = false
    }
  }

  /**
   * 停止语音识别（结束录音，触发 onstop → sendToSenseVoice）
   */
  const stop = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
      console.log('停止录音，准备发送到 SenseVoice')
    } else {
      console.log('MediaRecorder 未在录音状态')
    }
  }


  if (typeof window !== 'undefined') {
    ; (window as any).__asr = {
      start,
      stop
    }
  }

  return {
    asrText,
    isListening,
    start,
    stop
  }
}