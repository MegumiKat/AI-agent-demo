// src/utils/text.ts

/**
 * 将长文本按中英文标点和长度切成两段：
 * - 尽量优先在标点后切
 * - 超过最大长度时强制切
 */
const MIN_SPLIT_LENGTH = 2 // 最小切分长度
const MAX_SPLIT_LENGTH = 20 // 最大切分长度

export function splitSentence(text: string): string[] {
  if (!text) return []

  // 定义中文标点（不需要空格）
  const chinesePunctuations = new Set(['、', '，', '：', '；', '。', '？', '！', '…', '\n'])
  // 定义英文标点（需要后跟空格）
  const englishPunctuations = new Set([',', ':', ';', '.', '?', '!'])

  let count = 0
  let firstValidPunctAfterMin = -1 // 最小长度后第一个有效标点位置
  let forceBreakIndex = -1        // 强制切分位置
  let i = 0
  const n = text.length

  while (i < n && count < MAX_SPLIT_LENGTH) {
    const char = text[i]

    // 汉字
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
      const start = i
      i++
      while (
        i < n &&
        ((text[i] >= 'a' && text[i] <= 'z') || (text[i] >= 'A' && text[i] <= 'Z'))
      ) {
        i++
      }
      count++
      if (count === MAX_SPLIT_LENGTH) {
        forceBreakIndex = i
      }
    }
    // 标点 / 其他
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