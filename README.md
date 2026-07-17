# FSI 日語訓練工具

基於 FSI（美國外交學院）口語操練法的日語自學工具，串接 Google Cloud Text-to-Speech 日語語音。單一 HTML 檔，開網頁即用，支援手機。

本工具只負責口說操練；工具之外該做的練習與推薦工具見 [STUDY-GUIDE.md](STUDY-GUIDE.md)，文法書逐課對照（出口仁《大家學標準日本語》）見 [GRAMMAR-MAP.md](GRAMMAR-MAP.md)。

## 功能

- **① 聽讀**：先聽、暫停跟讀，可隱藏字幕（點擊揭示），符合 FSI 先聽後看原則
- **② 代換練習**：聽提示詞 → 自己說出新句 → 聽解答（後段課程為動詞變化操練：可能形、受身、使役、敬語等）
- **③ 應答練習**：聽問題 → 自己回答 → 聽示範解答
- **隨機順序**：可開啟隨機出題（影響②的代換詞與③的題序），避免背順序而非句型
- **代換詞預習**：可開啟 FSI breakdown 式預習——每個句型出題前，先把代換詞逐一唸過並顯示解答句，操練時不會撞到生詞
- **④ 逐段累加**：由句尾往前逐段建構長句（backward build-up）
- **⑤ 錄音對比＋腔調分析**：錄自己的發音，與示範 A/B 對比；一鍵分析音高曲線差異（相似度、語速、句首中尾高低、句尾升降方向），並有半速對比播放
- **自訂教材**：貼上任何句子（如課本課文）直接操練
- **正誤回饋（選用，自架 STT）**：②③模式留白時錄音，送自己架的 Whisper 辨識後與正解比對，即時顯示對錯與差異
- **間隔複習**：自動記錄每句的練習狀況（Leitner 盒，存瀏覽器），按「開始」時先插入其他課到期的複習句；配合正誤回饋會依對錯調整複習間隔
- **回合評分**：開啟正誤回饋時，②③④每輪結束依辨識結果結算（≥75% 合格建議下一課、未達建議重練）；每課最佳成績顯示在課程選單（✅82%／⚠58%），選課順序一目了然
- **操練中腔調圖**：開啟正誤回饋後，跟讀／代換／應答／逐段說完當下直接在操練畫面畫出你與示範的音高曲線對比（相似度＋語速差），附文字修正建議（「句尾要降下來」）；差異最大的區段會標紅，可一鍵半速重聽該段
- **卡拉OK式即時跟唱**：開口的當下，示範曲線是軌道、你的音高即時畫上去、游標跟著掃——邊說邊看邊修，不用等說完才看結果
- **今日條**：開站第一眼回答「今天該做什麼」——連續天數、到期複習數（一鍵開始）、上次進度（一鍵繼續／重練）、聽辨提醒，加上含 Anki／真實聽力的自勾清單（點文字展開工具建議，點方框打勾）
- **⑥ 聽辨訓練**：最小對立組測驗（箸／橋、雨／飴…），聽 TTS 判斷是哪個詞，答錯立即對比播放——先聽得出高低差，發音才修得動；另有「重音位置」分頁（實驗性，需 VOICEVOX），任一詞皆可出題，二選一挑出標準重音
- **符號級腔調評分（選用，需 VOICEVOX）**：填了 VOICEVOX endpoint 後，腔調回饋與錄音對比會多一排逐拍高低標註（哪個字讀錯一眼看出），畫布疊一條理論高低軌，跟唱畫面也會疊上去

## 自架 STT／LLM（選用）

「本地 AI 設定」可填 OpenAI 相容的 STT／LLM endpoint（如工作站上的 faster-whisper server、Ollama），也可填 VOICEVOX endpoint 做符號級腔調評分。遠端機器用 `ssh -L` 把埠轉發到 localhost 即可——瀏覽器允許 HTTPS 頁面連 localhost，不需要另外弄憑證。VOICEVOX engine 需以 `--cors_policy_mode all` 啟動才允許瀏覽器跨源呼叫。腔調曲線分析不走 STT（Whisper 會丟棄韻律），維持音高曲線對比；VOICEVOX 是額外疊加的逐拍符號分析，非必填。

現成的後端在 `server/`：一個 FastAPI 同時提供 Whisper 辨識與 Ollama 反向代理（自動補 CORS，不用改 Ollama 設定），只綁 127.0.0.1。部署：裝好 venv 依賴（`faster-whisper fastapi uvicorn python-multipart httpx`，GPU 加 `nvidia-cublas-cu12 nvidia-cudnn-cu12`）後 `tmux new -d -s fsi ./start.sh`。

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
