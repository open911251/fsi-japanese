# FSI 日語訓練工具

基於 FSI（美國外交學院）口語操練法的日語自學工具，串接 Google Cloud Text-to-Speech 日語語音。單一 HTML 檔，開網頁即用，支援手機。

## 功能

- **① 聽讀**：先聽、暫停跟讀，可隱藏字幕（點擊揭示），符合 FSI 先聽後看原則
- **② 代換練習**：聽提示詞 → 自己說出新句 → 聽解答（後段課程為動詞變化操練：可能形、受身、使役、敬語等）
- **③ 應答練習**：聽問題 → 自己回答 → 聽示範解答
- **④ 逐段累加**：由句尾往前逐段建構長句（backward build-up）
- **⑤ 錄音對比＋腔調分析**：錄自己的發音，與示範 A/B 對比；一鍵分析音高曲線差異（相似度、語速、句首中尾高低、句尾升降方向），並有半速對比播放
- **自訂教材**：貼上任何句子（如課本課文）直接操練

## 教材

內建 28 課，依「大家的日本語」文法進度原創編寫，涵蓋 N5 → N3：

- 第 1–14 課：N5（です、指示詞、時間、移動、動詞句、形容詞、存在、數量、過去、たい、て形）
- 第 15–25 課：N4（た形、辭書形、ない形、普通形、名詞修飾節、條件、可能形、意向形、授受、受身、使役）
- 第 26–28 課：N3（そう／よう／はず、敬語、ば〜ほど・ながら・のに 等綜合句型）

每句附假名與中文翻譯。

## 使用方式

1. 開啟網頁（或直接開 `fsi-japanese-trainer.html`）
2. 貼上你的 Google Cloud TTS API Key → 儲存 → 測試
   - 沒有 key 也能用，會退回瀏覽器內建語音（音質較差，且無法使用腔調分析）
3. 選課程、選模式、按開始

## 取得 Google Cloud TTS API Key

1. 到 [console.cloud.google.com](https://console.cloud.google.com) 建立專案
2. 搜尋並啟用「Cloud Text-to-Speech API」
3. 「API 和服務」→「憑證」→「建立憑證」→「API 金鑰」
4. **建議**：編輯金鑰 → 「應用程式限制」選「網站」，加入你的 GitHub Pages 網址（例 `https://你的帳號.github.io/*`），防止金鑰被盜用
5. 免費額度：Neural2/WaveNet 語音每月 100 萬字元，個人練習用不完

Key 只儲存在你的瀏覽器 localStorage，不會寫進程式碼、不會上傳到任何地方。

## 部署到 GitHub Pages

1. 建立新 repository（Public）
2. 上傳 `index.html`、`fsi-japanese-trainer.html`、`README.md`
3. Settings → Pages → Source 選「Deploy from a branch」→ Branch 選 `main`、資料夾 `/ (root)` → Save
4. 約一分鐘後網址生效：`https://你的帳號.github.io/repo名稱/`

## 手機使用注意

- 錄音與腔調分析需要 HTTPS（GitHub Pages 預設就是），第一次會詢問麥克風權限
- iPhone 需 iOS 14.3 以上的 Safari
- 播放前需點一下按鈕（行動瀏覽器規定使用者互動後才能出聲）
