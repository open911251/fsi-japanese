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

- **`LESSONS` 陣列**（約 367–942 行）：28 課教材資料，每課一個物件 `{t, g, listen, sub, qa, build}`。這是檔案的主體。
- **狀態機**：全域 `state` 物件（`mode`/`lesson`/`idx`/`running`/`runId`）。`runId` 遞增用於取消進行中的非同步播放迴圈（`sleep()` 會輪詢 `runId` 提早結束）。
- **語音層**：`say()` 優先走 `synthCloud()`（Google Cloud TTS REST API，key 存 localStorage），失敗或無 key 時退回 `speakBrowser()`（Web Speech API）。
- **五種練習模式**：`playItem()` 依 `state.mode`（listen/sub/qa/build/trans）決定播放與停頓流程；`runFrom()` 是主迴圈。sub 模式的項目有三種 type：`base`（基本句）、`prev`（代換詞預習，開關控制，不進 SRS）、`cue`（正式出題）。trans（轉換操練，🔁分頁）沿用 qa 的資料格式與播放邏輯（`playItem` 的 `qa`/`trans` 是同一分支）——給一句已學過的句子＋轉換指示（肯定→否定／過去／疑問），要自己套文法規則變出來，跟代換操練的「套現成詞」不同，練的是規則內化；資料存在每課的 `trans` 欄位（選填，目前只有第1課有內容），格式跟 `qa` 完全相同（5欄 `[指示句,指示假名,答案,答案假名,中文]`）。
- **錄音與腔調分析**：MediaRecorder 錄音 + Web Audio 解碼，`pitchTrack()`（自相關法）抽音高、`contour()` 正規化、`analyzePitch()` 算相似度/語速/句尾升降並畫圖。三處 `getUserMedia`（正誤回饋／⑤錄音對比／跟讀）共用 `MIC_CONSTRAINTS`（關掉瀏覽器預設的雜訊抑制／自動增益，那兩個是録音「悶」「忽大忽小」的常見成因）與 `newRecorder()`（明示 128kbps opus，避免瀏覽器預設低位元率造成破音）。
- **正誤回饋（選用）**：`fbGap()` 取代代換/應答留白的純 sleep，開啟時錄音並 POST 到使用者自填的 STT endpoint（OpenAI 相容），`fbSim()`（Levenshtein + `fbNorm()` 正字法歸一）比對正解後顯示於 `fbArea`；辨識在背景進行不阻塞播放。LLM endpoint 欄位留給開放應答模式。
- **回合評分**：`roundVerdict()`／`scoreSave()`／`scoreBadge()`／`finishRound()`（localStorage 鍵 `fsi_score`）。回饋開啟的 sub/qa 回合結束結算，`fbCheck` 會把遲到的辨識結果補進去（`roundDone` 旗標）。課程選單徽章由 `fillLessons()` 讀 `scoreBadge()`。
- **操練中腔調圖**：`fbPitch()` 在留白錄音後沿用⑤的音高管線畫到 `fbCanvas`（`drawPitch` 第三參數選擇畫布）；listen 跟讀也錄（`fbRecord()` 是共用的留白錄音器）。`worstWindow()` 找差異最大區段標紅＋`fbReplaySeg()` 半速切片重播；`fbHints()` 產生文字修正建議。即時跟唱：`liveStart()`（AnalyserNode 每 45ms 跑 `pitchOfFrame()` 自相關）在留白期間把使用者音高即時疊畫在示範軌道上（`liveDraw()`），示範 contour 由 `liveModel()` 快取；`fbRecord()` 第三參數傳句子文字即啟用。
- **聽辨訓練**：`MINPAIRS` 資料＋`mpAsk()/mpAnswer()`（⑥分頁，成績鍵 `fsi_minpair`）。四類對立：重音（acc 含 `↘`/`‾`）、長短音、促音、清濁（acc 含類別詞如「長音」「促音」「濁音」）。新增對立組時句 i 必須包含選項 i 的字、兩句載體須相同（只差目標詞），tests/test-minpair.js 會驗標記。抽題走 `mpPick()`：依 `mpHist.g`（每組答錯率）加權，錯得多的組優先出現。同分頁另有「重音位置」子分頁（`ap*` 函式群，成績鍵 `fsi_accentpos`，`ACCENT_WORDS` 詞庫），需 VOICEVOX，見下。
- **VOICEVOX 音高分析（選用）**：設定卡 `vvUrl`/`vvSpeaker`（localStorage `fsi_vv_url`/`fsi_vv_speaker`）。`vvQuery()` 呼叫 `/audio_query` 取得整句逐拍（mora）結構，`vvMoras()` 展平成 `{kana,voiced,hilo,t0,t1}` 陣列——高低不查教科書規則表，改用「該 accent phrase 內有聲拍音高是否高於該 phrase 平均」（引擎實際輸出常有「尖峰延遲」，比規則表更貼近使用者聽到的示範，見 tests/test-voicevox.js 的真實 fixture）。`moraScore()` 拿使用者 `contour()` 的 48 點序列依 t0/t1 逐拍取平均比對，標記吻合／不吻合，`renderMoraRow()` 畫成一排色塊；`drawMoraTrack()` 在 `drawPitch()`/`liveDraw()` 的畫布疊金色理論高低階梯。三處掛點：`fbPitch()`（操練中回饋）、`analyzePitch()`（⑤錄音對比）、`liveModel()`/`liveStart()`（卡拉OK跟唱）。`vvSynthesize()` 可把改寫過 `accent_phrases[i].accent` 的 JSON 重新合成，供⑥「重音位置」子分頁出題（任一詞查真實重音、複製 JSON 改成另一個重音位置當錯誤選項，不需人工找同音詞對）。VOICEVOX engine 需以 `--cors_policy_mode all` 啟動才允許瀏覽器跨源呼叫；示範播放仍走 Google TTS，VOICEVOX 只當分析器。
- **今日條**：`todayRender()`／`markPractice()`（streak）／`srsDueAll()`／`lastPracticed()`／`tdPanel()`（漸進揭露）。localStorage 鍵 `fsi_daily`（跨日歸零）與 `fsi_streak`。`finishRound()` 呼叫 `markPractice()`。
- **間隔複習**：`srs*()` 函式群（Leitner 五盒，localStorage 鍵 `fsi_srs`，每句鍵＝`mode|lesson|id`）。`runFrom(0)` 時 `srsBuildReview()` 把到期句插到 `state.review`（items() 會 concat 在最前）；升降盒由 `fbCheck`（回饋開啟）或 `runFrom` 迴圈（關閉）呼叫 `srsMark()`。句子識別用物件參照 `indexOf`（`srsIdOf`），所以隨機順序下也正確。
- **自訂教材**：使用者貼句子後產生 `state.customLesson`（`lesson === -1` 時使用）。
- **影子跟讀（⑦分頁）**：使用者選本機資料夾（`webkitdirectory`，不上傳、不持久化），`shadowClassify(name,relPath)` 依檔名決定分類——大家的日本語風「第N課」命名走課號＋小節關鍵字（`shadowSectionOf()`），課號對齊本工具課程順序；其他沒有這種命名的教材（跟讀書、文法書等）退回用資料夾結構（上層資料夾名）分類。這顆函式同時被「選資料夾」（`shadowIndexFiles()`）跟「匯入分句結果」共用，保證兩條路徑算出同一組 key。A/B 區間可手動設，也可以按「自動偵測分句」把整段音檔丟給 STT（`sttTranscribeFull()`，server 需回傳 `segments`，見下）拿到逐句時間戳＋文字，結果存 localStorage（`shadowSliceKey()`，格式跟 `shadowTextKey()` 一樣是課號＋小節當 key）；`shadowSelectSeg()`／`shadowStepSeg()` 做逐句導覽（上一句／下一句按鈕）。批次預先分析好的結果可以用「📥 匯入預先分析的分句結果」讀外部 JSON manifest（陣列 `[{path, segments}]`，`path` 是選資料夾時會出現的 `webkitRelativePath` 格式）寫進同一套 localStorage 快取，不用在瀏覽器裡一個個音檔重跑。「🎙 跟讀（播放＋錄音）」同步播放選定區間並錄音，播放結束後留 1.5 秒緩衝才真的停止錄音（跟讀常慢半拍，避免尾音被切）。「🔍 講評」重用⑤錄音對比的整套音高管線（`pitchTrack`/`contour`/`drawPitch`/`worstWindow`/`vvMorasFor`/`vvScore`），但參考音直接用 `sliceBuffer()` 從這段真人音檔本身裁出來，不叫 Google TTS、不需要 API key；`worstWindow` 抓到的最大差異段要換算回整軌的絕對秒數（`shadowSeg.t = shadowA + A.t0 + ...`，因為參考音的 `contour().t0` 是相對裁切後片段起點算的）才能讓 `shadowReplaySeg()` 半速重播對到正確位置。
- **角色扮演（⑧分頁，最小版）**：`ROLEPLAY_SCENARIOS` 資料刻意放在「/\* ================= 狀態」註解**之後**（例如跟 `MINPAIRS` 放一起）——`tests/test-shuffle.js` 用 `lastIndexOf("];", indexOf("狀態"))` 抓 `LESSONS` 陣列收尾，如果在 `LESSONS` 收尾跟狀態註解中間插新陣列會被誤判進 `LESSONS` 的抽取範圍，改資料時要留意這條邊界。每情境依課程文法程度分四級、固定兩輪；`turns[i]` 是 `{ask, cue, accept}`：`ask` 是給 LLM 的指示（這輪要問什麼，不是逐字稿）、`cue` 是顯示給使用者的中文提示詞（不是日文答案）、`accept` 是可接受的日文寫法陣列。`rpAskTurn()` 呼叫 LLM 即時生成 AI 問句，生成後用 `rpValidQuestion()` 檢查有沒有直接洩漏 `accept` 內容，洩題就帶提醒重問（最多 3 次嘗試）才顯示給使用者。使用者作答用 `fbNorm()` 正規化後對 `accept` 做子字串比對（`rpSend()`）算對錯，不再打一次 LLM 當裁判——自架小模型當裁判本身不穩，關鍵字比對更確定也不用等。跟「進度陪伴角色」（`teacherChat*`）完全獨立，不共用歷史／persona，狀態只留在記憶體不寫 localStorage（換分頁再切回來歷史還在，重新整理頁面才會消失，按「開始」會重置）。

`server/` 是自架 STT/LLM 後端（跑在使用者的遠端工作站，非本 repo 部署範圍）：`server.py` 為 FastAPI（faster-whisper ＋ Ollama CORS 代理，只綁 127.0.0.1:8788），`start.sh` 為啟動腳本。`/v1/audio/transcriptions` 除了 `text` 也回傳 `segments`（`[{start,end,text}]`，faster-whisper 內建 VAD 切出來的整句時間戳），供跟讀分頁的自動分句用；只讀 `text` 的舊呼叫方不受影響。改動後需手動部署到工作站。

`bot/` 是日語陪聊 Discord bot（獨立於網頁工具，同樣跑在筆電＋工作站，設計見 `bot/DESIGN.md`）。**token、對話記憶、視窗紀錄等執行期資料一律放 `bot/data/`（已 .gitignore），絕不 commit**——本 repo 是 public。

## 教材資料格式（修改 LESSONS 時必須遵守）

- `listen`：每項 3 欄 `[日文, かな, 中文]`
- `sub`：每個練習為 `{p, base, cues}`；`base` 3 欄，`cues` 每項 4 欄 `[提示詞, 日文, かな, 中文]`
- `qa`：每項 5 欄 `[問題, 問題かな, 答案, 答案かな, 中文]`
- `build`：`{full, parts}`；`full` 3 欄，`parts` 為由短到長的字串陣列
- `trans`（選填，轉換操練用）：格式跟 `qa` 相同，每項 5 欄 `[指示句, 指示かな, 答案, 答案かな, 中文]`，指示句要是完整可唸的日文句子（例如「「わたしは学生です」を否定形にしてください。」），不要只寫「→否定形」這種符號，TTS 會照著唸
- **改完教材必須用 node 驗證欄位數和 JS 語法**，欄位數錯了播放流程會壞掉

## 規則

1. **維持單一 HTML 檔架構**：不拆分檔案、不引入任何外部依賴（CDN、npm、框架都不要）。
2. **教材句子必須原創**：依「大家的日本語」的文法進度編寫，但**勿抄課本原句**（有版權）。
3. **絕不把 API key 寫進程式碼或 commit**；也不要向使用者索取任何憑證。Key 只存在使用者瀏覽器的 localStorage。
4. **回覆使用繁體中文**，簡潔直接。
