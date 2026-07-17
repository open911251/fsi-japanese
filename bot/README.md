# 日語陪聊 bot（v1）

設計與對話邏輯見 [DESIGN.md](DESIGN.md)。兩個程式：

| 檔案 | 跑在哪 | 做什麼 |
|---|---|---|
| `agent.py` | 筆電（Windows） | 抓前景視窗程序名＋標題，POST 給 bot（純標準庫，無依賴） |
| `bot.py` | 工作站 | Discord DM 陪聊本體：觸發引擎＋人設＋記憶＋糾錯，接 Ollama |

## 一次性設定

### 1. Discord 應用

1. [discord.com/developers/applications](https://discord.com/developers/applications) → New Application
2. 左側 **Bot** → Reset Token 取得 token；同頁打開 **Message Content Intent**
3. 左側 **OAuth2 → URL Generator**：勾 `bot` scope，權限勾 Send Messages＋**Connect＋Speak**（後兩個是 v2 語音模式用的，現在一起勾省得重邀）→ 用產生的網址把 bot 邀進一個你自己的私人伺服器（bot 要和你共享至少一個伺服器才能 DM；DM 本身不吃伺服器權限）
4. Discord 客戶端：設定 → 進階 → 開發者模式打開 → 右鍵自己的頭像 → 複製使用者 ID

### 2. 工作站

```bash
pip install discord.py
cp config.example.json config.json   # 填 token、user id、模型名
tmux new -d -s fsibot python bot.py
```

只綁 127.0.0.1:8789（視窗事件入口）。Discord 連線是 bot 主動對外連，不需要開防火牆。

### 3. 筆電

ssh 隧道多轉發一個 port（跟現有 STT 隧道併同一條）：

```
ssh -L 8788:127.0.0.1:8788 -L 8789:127.0.0.1:8789 工作站
```

背景啟動 agent（或排進工作排程器開機執行）：

```
pythonw agent.py
```

agent 的忽略清單（銀行、通訊軟體等不上傳的關鍵字）在 `agent.py` 開頭的 `IGNORE`，自己加。

## 使用

- 在 Discord 對 bot 的 DM 直接用日文聊；它只說日文、タメ口，難詞會附 `||中文||` 劇透注釋
- 說錯不會被當場糾正（它會在回覆裡自然示範正確說法）；想被批改就打「**添削して**」
- 打「**先生モード**」切換成引導式練習：它改用丁寧體、按當日主題（面接、電話応対、市役所手續…）一次一問、每句直接批改；打「**友達モード**」切回閒聊。記憶共用
- 它一天最多主動找你 5 次（開遊戲、換影片、深夜加班、久坐、隨機話題），已讀不回它會自動變安靜
- 你的錯誤句都存在 `data/errors.jsonl`——定期挑出來貼回訓練工具的「自訂教材」操練

## 資料（全部在 `data/`，已 .gitignore）

| 檔案 | 內容 |
|---|---|
| `state.json` | 冷卻、每日計數、退避、今日種子 |
| `history.jsonl` | 對話紀錄（prompt 只取最近 12 輪） |
| `facts.md` | bot 對你的長期記憶（每日凌晨自動更新） |
| `summary/YYYY-MM-DD.md` | 每日對話摘要＋未完話題（主動搭話的素材） |
| `errors.jsonl` | 錯誤句收集（回流自訂教材用） |
