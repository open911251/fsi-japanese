# ROADMAP

2026-07-13 討論定案。記錄 FSI/ALM 教學法的已知限制、對應解法與實作順序。

## 四個已知限制與對策

| 限制 | 對策 |
|---|---|
| 缺複習排程 | 間隔複習（spaced repetition）：localStorage 記每句練習紀錄，Leitner 盒排程，按「開始」時先插入到期複習題 |
| 操練順序固定 | 代換 cues 與 qa 題目加「隨機順序」開關（shuffle），避免背順序而非句型 |
| 純機械操練 | 新增「開放應答」模式：答案不唯一，由 LLM 評判（有無對題、文法對錯、是否用到本課句型）並給修正建議 |
| 無正誤回饋 | 拆兩半：**正確度**用 STT（Whisper）轉文字後比對／LLM 評判，可解；**腔調**維持現有音高曲線 A/B 對比——Whisper 原理上會丟棄韻律資訊，不能用於腔調判斷 |

## 已定案的架構決策

- **Google Cloud TTS 輸出端不動**。選用理由是自然度，示範音質決定模仿上限；免費額度足夠。新功能全部在輸入端（聽使用者說什麼），與 TTS 互不相干。
- **推理後端＝使用者工作站的本地 LLM**（使用者日常以 ssh 連線，機上有較大模型）：
  - `ssh -L 11434:localhost:11434 工作站` 轉發 OpenAI 相容 API（Ollama/llama.cpp/vLLM）
  - 瀏覽器視 localhost 為安全來源，GitHub Pages（HTTPS）直連 `http://localhost:*` 不被 mixed content 擋
  - CORS：Ollama 需設 `OLLAMA_ORIGINS=*`（llama.cpp/vLLM 各有對應開關）
  - 手機使用場景日後再考慮 Tailscale，暫不處理
- **STT 也自架**：工作站跑 faster-whisper / whisper.cpp server 模式，網頁把現有 MediaRecorder 錄的 webm POST 過去。繞過 iOS Safari 無 Web Speech 辨識的問題，零 API 費。
- **網頁端只新增設定欄位**：「LLM endpoint URL」「STT endpoint URL」，存 localStorage（與 TTS key 同模式）。維持單一 HTML 檔、不引入外部依賴。做 OpenAI 相容格式，同欄位填雲端 API 也能用。
- **母語者校對以 LLM 校對替代**（成本考量）；自然度終審用前沿模型，本地模型只做初篩。
- 腔調回饋的強化方向（低優先）：比對該句的標準東京式重音型（OJAD／UniDic 重音資料），而非換掉音高對比法。

## 實作順序

1. ✅ 教材 LLM 校對（2026-07-13 完成，一次性）：28 課全數檢查，無需修正的硬錯誤；少數風格備註見當日討論紀錄
2. ✅ 代換／應答順序隨機化（2026-07-13 完成）：設定區「隨機順序」開關，影響代換 cues（各句型內，基本句仍在前）與應答題序；一輪之內順序固定（seed 快取），每輪重洗；存 localStorage
3. ✅ LLM／STT endpoint 設定欄位 ＋ 正誤回饋（2026-07-13 完成）：設定卡「本地 AI 設定」收 STT／LLM 的 URL 與模型名（OpenAI 相容、存 localStorage）；「正誤回饋」開關開啟後，代換・應答的留白期間錄音 → POST 到 STT → Levenshtein 相似度比對（正規化：去標點、私/わたし・下さい/ください・阿拉伯/漢數字歸一，並同時比對假名欄取高分）→ 顯示 ✅≥85%／🔶≥60%／❌，附辨識結果與正解。辨識在背景進行不阻塞播放。LLM 欄位供第 4 項使用
4. ⬜ 開放應答模式（LLM 評判 + 修正建議）
5. ⬜ 間隔複習排程（Leitner）
