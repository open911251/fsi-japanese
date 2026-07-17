# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

FSI（美國外交學院）口語操練法的日語自學工具。**整個應用就是單一檔案 `fsi-japanese-trainer.html`**（HTML + CSS + JS 全部內嵌），`index.html` 只是跳轉頁。無建置流程、無套件管理、無測試框架。

部署方式：GitHub Pages（repo：`open911251/fsi-japanese`，push 到 `main` 即自動部署）。

## 常用指令

無 build/lint。開發時直接用瀏覽器開啟 `fsi-japanese-trainer.html` 驗證。測試在 `tests/`（node 直接跑，會從 HTML 抽出實際程式碼測）：

```
node tests/validate-lessons.js fsi-japanese-trainer.html   # LESSONS 欄位數驗證（改教材後必跑）
node tests/test-shuffle.js fsi-japanese-trainer.html       # 隨機順序邏輯（含全 script 語法檢查）
node tests/test-feedback.js fsi-japanese-trainer.html      # 正誤回饋的正規化與相似度比對
node tests/test-srs.js fsi-japanese-trainer.html           # 間隔複習升降盒/到期/鍵還原
node tests/test-voicevox.js fsi-japanese-trainer.html      # VOICEVOX 逐拍高低/重音標籤/評分邏輯
```

改動 `<script>` 內程式後至少跑一個 test-*.js（它們都先做全 script 語法編譯檢查）。測試靠字串錨點（如 `function itemsRaw`、`/* ================= 狀態`）從 HTML 切程式碼，改函式名或區段註解時要同步更新測試。

## 架構

`fsi-japanese-trainer.html` 內的 `<script>` 分幾層：

- **`LESSONS` 陣列**（約 150–730 行）：28 課教材資料，每課一個物件 `{t, g, listen, sub, qa, build}`。這是檔案的主體。
- **狀態機**：全域 `state` 物件（`mode`/`lesson`/`idx`/`running`/`runId`）。`runId` 遞增用於取消進行中的非同步播放迴圈（`sleep()` 會輪詢 `runId` 提早結束）。
- **語音層**：`say()` 優先走 `synthCloud()`（Google Cloud TTS REST API，key 存 localStorage），失敗或無 key 時退回 `speakBrowser()`（Web Speech API）。
- **四種練習模式**：`playItem()` 依 `state.mode`（listen/sub/qa/build）決定播放與停頓流程；`runFrom()` 是主迴圈。sub 模式的項目有三種 type：`base`（基本句）、`prev`（代換詞預習，開關控制，不進 SRS）、`cue`（正式出題）。
- **錄音與腔調分析**：MediaRecorder 錄音 + Web Audio 解碼，`pitchTrack()`（自相關法）抽音高、`contour()` 正規化、`analyzePitch()` 算相似度/語速/句尾升降並畫圖。
- **正誤回饋（選用）**：`fbGap()` 取代代換/應答留白的純 sleep，開啟時錄音並 POST 到使用者自填的 STT endpoint（OpenAI 相容），`fbSim()`（Levenshtein + `fbNorm()` 正字法歸一）比對正解後顯示於 `fbArea`；辨識在背景進行不阻塞播放。LLM endpoint 欄位留給開放應答模式。
- **回合評分**：`roundVerdict()`／`scoreSave()`／`scoreBadge()`／`finishRound()`（localStorage 鍵 `fsi_score`）。回饋開啟的 sub/qa 回合結束結算，`fbCheck` 會把遲到的辨識結果補進去（`roundDone` 旗標）。課程選單徽章由 `fillLessons()` 讀 `scoreBadge()`。
- **操練中腔調圖**：`fbPitch()` 在留白錄音後沿用⑤的音高管線畫到 `fbCanvas`（`drawPitch` 第三參數選擇畫布）；listen 跟讀也錄（`fbRecord()` 是共用的留白錄音器）。`worstWindow()` 找差異最大區段標紅＋`fbReplaySeg()` 半速切片重播；`fbHints()` 產生文字修正建議。即時跟唱：`liveStart()`（AnalyserNode 每 45ms 跑 `pitchOfFrame()` 自相關）在留白期間把使用者音高即時疊畫在示範軌道上（`liveDraw()`），示範 contour 由 `liveModel()` 快取；`fbRecord()` 第三參數傳句子文字即啟用。
- **聽辨訓練**：`MINPAIRS` 資料＋`mpAsk()/mpAnswer()`（⑥分頁，成績鍵 `fsi_minpair`）。四類對立：重音（acc 含 `↘`/`‾`）、長短音、促音、清濁（acc 含類別詞如「長音」「促音」「濁音」）。新增對立組時句 i 必須包含選項 i 的字、兩句載體須相同（只差目標詞），tests/test-minpair.js 會驗標記。抽題走 `mpPick()`：依 `mpHist.g`（每組答錯率）加權，錯得多的組優先出現。同分頁另有「重音位置」子分頁（`ap*` 函式群，成績鍵 `fsi_accentpos`，`ACCENT_WORDS` 詞庫），需 VOICEVOX，見下。
- **VOICEVOX 音高分析（選用）**：設定卡 `vvUrl`/`vvSpeaker`（localStorage `fsi_vv_url`/`fsi_vv_speaker`）。`vvQuery()` 呼叫 `/audio_query` 取得整句逐拍（mora）結構，`vvMoras()` 展平成 `{kana,voiced,hilo,t0,t1}` 陣列——高低不查教科書規則表，改用「該 accent phrase 內有聲拍音高是否高於該 phrase 平均」（引擎實際輸出常有「尖峰延遲」，比規則表更貼近使用者聽到的示範，見 tests/test-voicevox.js 的真實 fixture）。`moraScore()` 拿使用者 `contour()` 的 48 點序列依 t0/t1 逐拍取平均比對，標記吻合／不吻合，`renderMoraRow()` 畫成一排色塊；`drawMoraTrack()` 在 `drawPitch()`/`liveDraw()` 的畫布疊金色理論高低階梯。三處掛點：`fbPitch()`（操練中回饋）、`analyzePitch()`（⑤錄音對比）、`liveModel()`/`liveStart()`（卡拉OK跟唱）。`vvSynthesize()` 可把改寫過 `accent_phrases[i].accent` 的 JSON 重新合成，供⑥「重音位置」子分頁出題（任一詞查真實重音、複製 JSON 改成另一個重音位置當錯誤選項，不需人工找同音詞對）。VOICEVOX engine 需以 `--cors_policy_mode all` 啟動才允許瀏覽器跨源呼叫；示範播放仍走 Google TTS，VOICEVOX 只當分析器。
- **今日條**：`todayRender()`／`markPractice()`（streak）／`srsDueAll()`／`lastPracticed()`／`tdPanel()`（漸進揭露）。localStorage 鍵 `fsi_daily`（跨日歸零）與 `fsi_streak`。`finishRound()` 呼叫 `markPractice()`。
- **間隔複習**：`srs*()` 函式群（Leitner 五盒，localStorage 鍵 `fsi_srs`，每句鍵＝`mode|lesson|id`）。`runFrom(0)` 時 `srsBuildReview()` 把到期句插到 `state.review`（items() 會 concat 在最前）；升降盒由 `fbCheck`（回饋開啟）或 `runFrom` 迴圈（關閉）呼叫 `srsMark()`。句子識別用物件參照 `indexOf`（`srsIdOf`），所以隨機順序下也正確。
- **自訂教材**：使用者貼句子後產生 `state.customLesson`（`lesson === -1` 時使用）。

`server/` 是自架 STT/LLM 後端（跑在使用者的遠端工作站，非本 repo 部署範圍）：`server.py` 為 FastAPI（faster-whisper ＋ Ollama CORS 代理，只綁 127.0.0.1:8788），`start.sh` 為啟動腳本。改動後需手動部署到工作站。

`bot/` 是日語陪聊 Discord bot（獨立於網頁工具，同樣跑在筆電＋工作站，設計見 `bot/DESIGN.md`）。**token、對話記憶、視窗紀錄等執行期資料一律放 `bot/data/`（已 .gitignore），絕不 commit**——本 repo 是 public。

## 教材資料格式（修改 LESSONS 時必須遵守）

- `listen`：每項 3 欄 `[日文, かな, 中文]`
- `sub`：每個練習為 `{p, base, cues}`；`base` 3 欄，`cues` 每項 4 欄 `[提示詞, 日文, かな, 中文]`
- `qa`：每項 5 欄 `[問題, 問題かな, 答案, 答案かな, 中文]`
- `build`：`{full, parts}`；`full` 3 欄，`parts` 為由短到長的字串陣列
- **改完教材必須用 node 驗證欄位數和 JS 語法**，欄位數錯了播放流程會壞掉

## 規則

1. **維持單一 HTML 檔架構**：不拆分檔案、不引入任何外部依賴（CDN、npm、框架都不要）。
2. **教材句子必須原創**：依「大家的日本語」的文法進度編寫，但**勿抄課本原句**（有版權）。
3. **絕不把 API key 寫進程式碼或 commit**；也不要向使用者索取任何憑證。Key 只存在使用者瀏覽器的 localStorage。
4. **回覆使用繁體中文**，簡潔直接。
