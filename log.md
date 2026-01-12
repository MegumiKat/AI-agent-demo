# log

## 2026/01/12

### 1. 修复 `sendMessage()` 返回值不完整
- **问题**：原先 `return buffer` 只会返回流式切分后最后残留的一小段文本。
- **修改**：新增 `fullText` 累计完整输出；`buffer` 仅用于切分与播报。
- **效果**：`sendMessage()` 可返回完整 LLM 回复，便于后续 UI 展示/记录/调试。

### 2. 流式播报切分改为 `while` 连续切分
- **问题**：每个 chunk 只切一刀，导致 buffer 内已包含多句时仍需等待下个 chunk 才继续播报，出现滞后。
- **修改**：在每次追加 `buffer` 后用 `while (true)` 反复 `splitSentence(buffer)`，可切就立刻播，直到不可切为止。
- **效果**：明显提升流式播报的“即时性”和连贯感。

### 3. 引入 ASR session/token 防止 stop 后回调串线
- **问题**：停止连续监听后，飞行中的 `asr.start()` 仍可能触发 `onFinished/onError`，导致停止后仍继续播报/改状态。
- **修改**：增加 `asrSession` 自增令牌；`startContinuousListening()`/`stopContinuousListening()` 都 bump session；loop 与回调内均校验 session。
- **效果**：stop 后旧回调立即失效，避免“幽灵回调”与状态串线。

### 4. offline 模式不终止 loop（改为轮询等待恢复）
- **问题**：原先 offline 分支 `return` 直接结束循环，后续切回 online 无法自动恢复。
- **修改**：offline 时 `setTimeout` 延迟后继续 `loop()`，并保留 session/stopped 校验。
- **效果**：状态可恢复，offline→online 后无需手动重启监听。

### 5. 增加本地 TTS speaking 锁，减少 ASR 抢跑与回声收音
- **问题**：仅依赖 `avatarState === 'speak'` 可能因状态事件延迟导致 ASR 抢跑，甚至录进虚拟人播报声音。
- **修改**：新增 `isTtsSpeaking`；sendMessage 播报期置 true，播报结束后等待 speak 结束再释放；ASR loop 启动前检查该锁。
- **效果**：降低 TTS 回声被 ASR 识别的概率，整体对话更稳定。

---

### 6. 不再用 `silenceTimer` 作为“已启动”判断，改用显式状态
- **问题**：用 `silenceTimer !== null` 作为 guard 语义混乱；未来 loop 退出但 timer 仍在会导致无法再启动。
- **修改**：新增 `isContinuousListening` 作为唯一启动标记；timer 仅作为未来扩展保留。
- **效果**：启动/停止语义清晰，避免“误判已启动”。

### 7. 修复 `isListening` 可能卡死为 true（异常路径补齐）
- **问题**：`asr.start()` 失败或异常路径未覆盖时，`appState.asr.isListening` 可能一直为 true。
- **修改**：在 `asr.start().catch` 与 `onError` 中显式调用 `stopVoiceInput()`；并保留轮次结束时的复位逻辑。
- **效果**：UI/状态不会因异常卡死。

### 8. 停止连续监听时强制清理 speaking 锁（边界兜底）
- **问题**：在停止时若仍处于播报期，可能残留 speaking 锁影响后续重启。
- **修改**：`stopContinuousListening()` 中强制 `isTtsSpeaking = false`，并配合 session 失效。
- **效果**：停止行为“干净”，重启更可靠。

### 9. `avatarState` 初始值从空串改为 `null`（状态语义更明确）
- **问题**：`ref<AvatarState>('')` 不是明确状态，类型与状态机语义混乱。
- **修改**：改为 `ref<AvatarState | null>(null)`，断开连接时也置 `null`；所有 speak 判断兼容 null。
- **效果**：状态更可维护，减少隐式“空串状态”引发的问题。

### 10. standby 切换增加空轮去抖（避免噪声环境动作抖动）
- **问题**：ASR 可能频繁出现短空轮；空轮一次就切 standby 会导致 avatar 动作频繁切换。
- **修改**：新增 `emptyUtteranceCount` 与阈值 `EMPTY_TO_STANDBY_THRESHOLD`；连续空轮达到阈值才切 standby；有有效识别则清零。
- **效果**：standby 更稳，降低动作抖动与误切换。

### 11. 增加 SSML 安全转义（防止 XML 特殊字符破坏播报）
- **问题**：LLM 输出可能包含 `<`, `&` 等字符，若未 escape 会导致 SSML 结构损坏、炸音或不播报。
- **修改**：新增 `escapeXml()` + `safeGenerateSSML()`；所有播报入口统一走安全 SSML 生成。
- **效果**：播报更健壮，降低偶发失败。

### 12. 日志降噪：引入 verbose 开关与 debug 包装
- **问题**：连续聆听下高频日志会淹没关键问题点，难以排障。
- **修改**：新增 `VERBOSE_LOG`（例如 DEV 环境开启）与 `logDebug()`；将高频日志改为 debug 输出。
- **效果**：日志更可读，排障效率更高。