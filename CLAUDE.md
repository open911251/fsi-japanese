# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

FSI（美國外交學院）口語操練法的日語自學工具。**整個應用就是單一檔案 `fsi-japanese-trainer.html`**（HTML + CSS + JS 全部內嵌），`index.html` 只是跳轉頁。無建置流程、無套件管理、無測試框架。

部署方式：GitHub Pages（repo：`open911251/fsi-japanese`，push 到 `main` 即自動部署）。

## 常用指令

無 build/lint/test。開發時直接用瀏覽器開啟 `fsi-japanese-trainer.html` 驗證。

改完教材資料後，用 node 驗證 JS 語法與欄位數（把 `<script>` 內容抽出來跑）：

```powershell
# 抽出 script 內容並檢查語法
node -e "const s=require('fs').readFileSync('fsi-japanese-trainer.html','utf8');const m=s.match(/<script>([\s\S]*)<\/script>/);new Function(m[1].replace(/document|window|navigator/g,'({})' ));console.log('syntax OK')"
```

（實務上可寫臨時腳本抽出 `LESSONS` 陣列，逐課檢查各欄位數，見下方資料格式。）

## 架構

`fsi-japanese-trainer.html` 內的 `<script>` 分幾層：

- **`LESSONS` 陣列**（約 150–730 行）：28 課教材資料，每課一個物件 `{t, g, listen, sub, qa, build}`。這是檔案的主體。
- **狀態機**：全域 `state` 物件（`mode`/`lesson`/`idx`/`running`/`runId`）。`runId` 遞增用於取消進行中的非同步播放迴圈（`sleep()` 會輪詢 `runId` 提早結束）。
- **語音層**：`say()` 優先走 `synthCloud()`（Google Cloud TTS REST API，key 存 localStorage），失敗或無 key 時退回 `speakBrowser()`（Web Speech API）。
- **四種練習模式**：`playItem()` 依 `state.mode`（listen/sub/qa/build）決定播放與停頓流程；`runFrom()` 是主迴圈。
- **錄音與腔調分析**：MediaRecorder 錄音 + Web Audio 解碼，`pitchTrack()`（自相關法）抽音高、`contour()` 正規化、`analyzePitch()` 算相似度/語速/句尾升降並畫圖。
- **正誤回饋（選用）**：`fbGap()` 取代代換/應答留白的純 sleep，開啟時錄音並 POST 到使用者自填的 STT endpoint（OpenAI 相容），`fbSim()`（Levenshtein + `fbNorm()` 正字法歸一）比對正解後顯示於 `fbArea`；辨識在背景進行不阻塞播放。LLM endpoint 欄位留給開放應答模式。
- **自訂教材**：使用者貼句子後產生 `state.customLesson`（`lesson === -1` 時使用）。

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
