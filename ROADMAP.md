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
  - ✅ 2026-07-13 已部署：工作站使用者空間跑 FastAPI（faster-whisper large-v3-turbo GPU），同一 port 同時提供 STT 與 Ollama 的 CORS 代理，共用 Ollama 設定不動；只綁 127.0.0.1，經 ssh 隧道使用（單一 port 轉發即可）。
- **網頁端只新增設定欄位**：「LLM endpoint URL」「STT endpoint URL」，存 localStorage（與 TTS key 同模式）。維持單一 HTML 檔、不引入外部依賴。做 OpenAI 相容格式，同欄位填雲端 API 也能用。
- **母語者校對以 LLM 校對替代**（成本考量）；自然度終審用前沿模型，本地模型只做初篩。
- 腔調回饋的強化方向（低優先）：比對該句的標準東京式重音型（OJAD／UniDic 重音資料），而非換掉音高對比法。

## 方向修訂（2026-07-13）

**目標＝在日生活能力，JLPT 為輔。** 影響如下：

- 內建文法課推進到 N3 收尾即可，不做 N2 長尾句型的陣地戰（考試導向的閱讀量瓶頸不是本工具的戰場）
- 擴充方向改為**生活場景課**：市役所・郵局手續、醫院、電話應對、購物退換貨、租屋、職場基本敬語應對——每場景高頻固定句＋應答練習，高度可操練
- 真實語速聽力（縮約口語、快速敬語）靠真實材料＋「自訂教材」貼句操練，不自產
- 開放應答模式（第 4 項）升級定位：做成生活場景的模擬對話
- 優先序：間隔複習（5）→ 開放應答（4）→ 生活場景課

## 實作順序

1. ✅ 教材 LLM 校對（2026-07-13 完成，一次性）：28 課全數檢查，無需修正的硬錯誤；少數風格備註見當日討論紀錄
2. ✅ 代換／應答順序隨機化（2026-07-13 完成）：設定區「隨機順序」開關，影響代換 cues（各句型內，基本句仍在前）與應答題序；一輪之內順序固定（seed 快取），每輪重洗；存 localStorage
3. ✅ LLM／STT endpoint 設定欄位 ＋ 正誤回饋（2026-07-13 完成）：設定卡「本地 AI 設定」收 STT／LLM 的 URL 與模型名（OpenAI 相容、存 localStorage）；「正誤回饋」開關開啟後，代換・應答的留白期間錄音 → POST 到 STT → Levenshtein 相似度比對（正規化：去標點、私/わたし・下さい/ください・阿拉伯/漢數字歸一，並同時比對假名欄取高分）→ 顯示 ✅≥85%／🔶≥60%／❌，附辨識結果與正解。辨識在背景進行不阻塞播放。LLM 欄位供第 4 項使用
4. ⬜ 開放應答模式（LLM 評判 + 修正建議）
5. ✅ 間隔複習排程（2026-07-13 完成）：Leitner 五盒（間隔 1/2/4/8/16 天），每句一筆存 localStorage（`fsi_srs`）。按「開始」從頭跑時自動插入至多 5 句其他課的到期複習題（同模式），進度列標「🔁 複習」與出處課名。正誤回饋開啟時由辨識結果升降盒（≥85% 升、<60% 打回盒0），關閉時播完即視為成功；未到期的重複練習不改排程（防止一天狂刷衝頂）。build 與自訂教材不排程
6. ✅ 代換詞預習（2026-07-13 完成）：「代換詞預習」開關，開啟後每個句型在基本句之後插入 `{type:"prev"}` 項目——唸代換詞→播解答句（含假名中文），不要求產出（仿 FSI breakdown，操練不撞生詞）。與隨機順序並存（prev 維持原順序）、不進 SRS。詞彙廣度不歸本工具管（交給 Anki 等，本工具只顧操練流暢）
7. ✅ 回合評分與課程順序（2026-07-13 完成）：回饋開啟的 sub/qa 每輪結算平均分（roundVerdict，≥75 合格）；合格建議下一課、未達建議重練（不強制鎖課）；每課 best/last 存 `fsi_score`，課程選單顯示徽章（取 sub/qa 較弱一項當精熟下限）。遲到的 STT 結果會補進結算。2026-07-14：build 逐段跟讀也接上評分（每段與段落文字比對，末段用 full 假名；不進 SRS），徽章精熟下限含 build
8. ✅ 操練中腔調圖（2026-07-13 完成）：回饋開啟時，listen 跟讀留白也錄音，並在 fbPitch() 沿用⑤的音高管線（pitchTrack/contour/drawPitch 加 canvas 參數）於操練畫面直接畫示範 vs 使用者曲線＋相似度＋語速差；無 TTS key 靜默略過
9. ✅ 差異區段重點重聽（2026-07-14 完成）：worstWindow() 以 8/48 點滑窗找平均半音差最大處，畫布標紅底，fbSeg 記錄示範音檔時間切片（contour 補回傳 t0），「🐢 重聽差最大的一段」以 Audio currentTime＋preservesPitch 半速播放該切片。平均差 <2 半音不顯示。不用 OJAD（無官方 API、音質低於 Neural2）
10. ✅ 文字修正建議（2026-07-14 完成）：fbHints() 把曲線差異翻譯成指令（句首高低、句尾該降沒降／該揚沒揚），附在腔調資訊列
11. ✅ 聽辨訓練分頁（2026-07-14 完成）：⑥ 最小對立組測驗（MINPAIRS，7 組名詞對：頭高/尾高/平板），TTS 唸「〇〇です」句、二選一、答後強制對比播放；成績存 `fsi_minpair`。Kotu.io 無 API 且 iframe 會被擋，故原生自建；大量刷題仍建議 Kotu
12. ✅ 卡拉OK式即時跟唱（2026-07-14 完成）：解「腔調矯正不及時」。回饋開啟時每個開口留白都是跟唱畫面——liveStart() 先畫示範曲線當軌道（liveModel() 以 text|voice|rate 快取 contour），AnalyserNode 每 45ms 取 2048 樣本跑 pitchOfFrame()（自相關 70–420Hz、RMS 門檻），游標從使用者開口那刻起跑、掃完示範時長，音高以使用者自己的滾動中位數正規化成半音疊畫上去。說完由既有 fbPitch() 事後對比接手。全瀏覽器本地。listen/sub/qa/build 全部生效
13. ✅ 今日條（2026-07-14 完成）：頁首狀態驅動儀表——連續天數（`fsi_streak`，完成任一輪操練記為當日有練）、到期複習總數（`srsDueAll()`，一鍵切到最多到期的模式開跑）、上次進度（`lastPracticed()` 掃 `fsi_score` 時間戳，≥75% 顯「繼續」否則「重練」）、聽辨提醒；自勾清單（`fsi_daily`，跨日歸零；操練自動勾、Anki／聽力手動）＋漸進揭露面板（點文字展開 2–3 個外部連結與「卡句貼回自訂教材」提醒，點方框只打勾）。原則：狀態驅動的今日待辦，不做靜態功能牆
14. ✅ 聽辨訓練批量擴充・音段對立（2026-07-16 完成）：MINPAIRS 從 7 組擴到 29 組，新增三類「差異寫在假名上、TTS 必唸得出」的低風險對立——長短音・拗音 9 組、促音 6 組、清濁・半濁 7 組（選詞避開多音字如「音／おん」，兩句載體相同、只差目標詞）；抽題改 `mpPick()` 依各組答錯率加權（`fsi_minpair` 新增 `g` 欄記每組成績，舊資料相容），錯得多的組出現率約為熟練組 4 倍、沒練過視為 50%；test-minpair 放寬為「重音符號或音段類別詞」雙軌標記並加抽題統計驗證
15. ✅ VOICEVOX 音高資料整合（2026-07-18 提案並完成，使用者發現）：`audio_query` 回傳逐拍（mora）重音結構、`synthesis` 可吃改寫過的 accent 值重新合成。設定卡新增 VOICEVOX URL／speaker 欄位（`fsi_vv_url`／`fsi_vv_speaker`，同 localStorage 模式）＋「測試」按鈕；工作站 VOICEVOX engine 改用 `--cors_policy_mode all` 啟動（已重啟，實測 GitHub Pages 來源的 preflight 回 200）。三個子功能：
    - **A．逐拍評分**：`vvMoras()` 展平整句 accent_phrases，每拍高低取「該 accent phrase 內有聲拍平均以上＝高」（不查教科書規則表——實測「箸です」等頭高詞，字典規則的「核後立即下降」跟引擎實際音高常差一拍即「尖峰延遲」現象，規則反而會誤判；直接用引擎輸出更貼近使用者聽到的示範）。`moraScore()` 比對使用者 `contour()` 的 48 點半音序列，逐拍標記吻合／不吻合。掛到 `fbPitch()`（操練中）、`analyzePitch()`（⑤錄音對比）：canvas 疊金色理論高低階梯（`drawMoraTrack`），下方新增逐拍列（`fbMoraRow`／`pitchMoraRow`，`renderMoraRow`）
    - **B．重音位置聽辨**（⑥分頁新分頁籤，實驗性）：不需人工找同音詞對——任一詞查 VOICEVOX 拿正確 accent，複製 JSON 改寫 accent 欄位合成一個「錯誤」版本，二選一問「哪個是標準唸法」。詞庫 `ACCENT_WORDS` 20 詞（含 MINPAIRS 既有 10 詞＋10 個新常見詞），成績存 `fsi_accentpos`
    - **C．跟唱理論軌道**：`liveModel()` 快取 VOICEVOX moras、`liveDraw()` 疊同一條理論階梯，示範曲線＋使用者即時曲線＋理論高低三線同框
    - 2026-07-19 設計覆核後修三處：①`moraScore` 使用者端門檻改按 accent phrase 分組取平均（原全句 0 門檻與理論端不對稱，長句自然下傾時後段 phrase 的相對高拍會被誤判成 L，已加下傾情境測試）；②⑥答題標籤改 `apWordLabel()` 還原詞級重音（平板詞＋です核固定落在「で」＝a=n-1 的規律，實測 20 詞全部吻合辭典；原 `accentLabel` 直接套整句會把平板⓪詞標成中高③誤導使用者）；③⑥出新題時 revoke 上一題的 blob URL（原本每題洩漏兩個）。已知未修的小項：⑥答題前不能重聽 A/B
    - **測試狀況（供下次接手判斷）**：✅ 已測——`tests/test-voicevox.js`（vvMoras／accentLabel／moraScore 邏輯，含用真實引擎回應「箸です」build 的 fixture，驗過尖峰延遲現象）；ssh 直連工作站 VOICEVOX 驗證 audio_query／synthesis／accent override 契約與 CORS header；20 詞聽辨詞庫逐一在真實引擎跑過 query＋雙版本合成；既有 5 個測試檔（validate-lessons/test-shuffle/test-feedback/test-srs/test-minpair）跑過無回歸。**⚠ 未測**——沒有瀏覽器自動化工具，實際瀏覽器點擊流程（設定卡新欄位存取、canvas 疊圖視覺呈現、⑤逐拍列、⑥「重音位置」分頁按鈕互動、跟唱三線疊圖）完全沒有人工跑過；`moraScore` 在真人錄音（非合成音）上的準確度未驗證，僅有邏輯層 unit test。**使用者下次開啟頁面時應先實際點過一輪再視為正式驗收**
16. 🔶 日語陪聊 bot（`bot/`，2026-07-16 設計定案見 bot/DESIGN.md；2026-07-17 v1 文字版程式完成——agent.py 已在筆電實測抓到前景視窗，bot.py（含先生モード雙模式）語法檢查通過、待工作站部署實測，部署步驟見 bot/README.md）。**核心目標＝語音直接對話**（非學習時間掛著娛樂時無壓力閒聊）：v2 Discord 語音頻道管線（voice.py：discord-ext-voice-recv 收音→停頓 0.8s 斷句→faster-whisper→同一套人設→VOICEVOX 播回；barge-in、語音不糾錯只默默記 errors.jsonl）。
    - 2026-07-17 部署進度：v1 文字版＋v2 語音全部部署到工作站並上線（DM 指令「おいで」進語音頻道／「ばいばい」離開；tmux session：`fsibot`＝bot、`voicevox`＝TTS engine 0.25.2 於 50021）。人設已加台詞例＋大人對話不說教規則＋min_p/repeat_penalty 取樣；模型 gpt-oss:120b（嫌慢可換 gemma4:31b-it-q8_0），聲線 VOICEVOX speaker 11 玄野武宏。拒答常見再考慮 abliterated 模型。
    - 2026-07-18 **v2 語音實測成功**（完整對話迴路通）。過程中發現 Discord 2026-03 起強制語音 E2EE（DAVE），Python 收音生態未支援（discord-ext-voice-recv 只收到亂碼），改為混合架構：`bot/relay/relay.js`（discord.js＋@discordjs/voice 0.19.2＋davey，tmux `fsirelay`）當耳朵嘴巴——收音、AfterSilence 800ms 斷句、播放、barge-in；大腦仍在 bot.py（HTTP 8789 `/voice/utterance`、`/voice/greet`，控制 8790）。坑：Discord ID 超過 JS 安全整數，config 的數字型 id 會被 JSON.parse 四捨五入，relay 以 regex 從原文抽字串解決。人設微調（禁問句 6 成機率、禁空洞相づち、intonationScale 1.15）、聲線切換琴詠ニア（74）
    - VOICEVOX engine 現由訓練工具（第 15 項）與 bot 共用，注意改 CORS/啟動參數時兩邊都要重驗
17. ⬜ 重音對立批量管線（kanjium）：優先度降低——第 15 項 B 子功能已用「任一詞查 VOICEVOX＋改寫 accent 合成錯誤版」達成類似訓練效果，不再依賴人工找同音詞對。若仍要做傳統「同音不同重音」詞義對立組（MINPAIRS 風格），流程不變：從 kanjium `accents.txt`（Yomichan 音調資料，約 12 萬詞條）按讀音分組撈詞對 → LLM 只填中文釋義 → 現在可直接用 VOICEVOX 指定重音合成，免 TTS 驗收這一步
