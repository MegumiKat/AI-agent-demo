// src/composables/asrRegistry.ts
import type { AsrCallbacks } from '../types'

/**
 * ASR 实现的统一接口
 */
export type AsrStartFn = (
  callbacks: AsrCallbacks,
  vadSilenceTime?: number
) => Promise<void>

export type AsrStopFn = () => void

export interface AsrImpl {
  start: AsrStartFn
  stop: AsrStopFn
}

// 当前全局唯一 ASR 实例
let currentAsr: AsrImpl | null = null

/**
 * 注册 ASR 实例（在 useAsr 里调用）
 */
export function registerAsr(impl: AsrImpl) {
  currentAsr = impl
}

/**
 * 获取当前 ASR 实例（在 AppStore 里调用）
 */
export function getAsr(): AsrImpl | null {
  return currentAsr
}