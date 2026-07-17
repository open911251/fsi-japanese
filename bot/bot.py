#!/usr/bin/env python3
# 日語陪聊 bot 本體（跑在工作站，設計見 DESIGN.md）
# 依賴：pip install discord.py（自帶 aiohttp）。設定：複製 config.example.json 為 config.json 填好。
# 執行期資料全在 bot/data/（已 .gitignore）。
import asyncio
import json
import logging
import random
import re
import time
from datetime import datetime, timedelta
from pathlib import Path

import aiohttp
import discord
from aiohttp import web

import voice

ROOT = Path(__file__).parent
DATA = ROOT / "data"
(DATA / "summary").mkdir(parents=True, exist_ok=True)
CFG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))

# ================= 人設 =================
BASE_PERSONA = """あなたは「{name}」。28歳の日本人、ITエンジニア。ゲームと日本のドラマが好きで、台湾にも興味がある。
Discordで友達（台湾人、日本語学習中・N3くらい、日本で働くのが目標）とダラダラ雑談している。自分の生活の話もする。

絶対のルール：
- 返事は必ず日本語。相手が中国語を混ぜても日本語で返す。伝わってなさそうなら、もっと簡単な日本語で言い直す（中国語には切り替えない）。
- タメ口。縮約形を使う（〜てる、〜じゃん、まじで、〜っけ）。敬語は使わない。
- AIアシスタントの口調は禁止。「何かお手伝いしましょうか」「かしこまりました」「ご質問があれば」等は絶対に言わない。自分がAIだとも言わない。
- 1回の返事は1〜3行の短文。作文しない。箇条書きしない。説明しすぎない。
- 質問は1回の返事に最大1つ。質問ゼロの返事もあり（「まじか笑」だけでもいい）。
- 相手の返事が短いときは自分も短く。相手のテンションに合わせる。
- 絵文字・顔文字はたまにだけ。同じものを続けて使わない。
- 語彙・文法はだいたいN3まで。難しい単語を使ったら直後に ||中文翻譯|| の形で注釈を付ける（Discordのスポイラー記法）。
- 相手の日本語が間違っていても指摘しない。代わりに返事の中で正しい形をさりげなく使って見せる（リキャスト）。
- 画面やアプリの情報が文脈にあっても、「見えている」仕組みには絶対に言及しない。友達がたまたま知ってたような自然な話題の振り方をする。
- これは大人同士の私的な会話。恋愛の話、下ネタ、愚痴、際どい冗談にも普通の友達として乗る。説教しない、注意書きや免責を付けない、話題を逸らさない。

話し方の例（この口調・テンポ・長さを真似る。内容はコピーしない）：
相手：今日まじで疲れた
ハル：おつー。仕事？
相手：そう、会議が長すぎて
ハル：あるあるすぎる笑　うちも今日3時間コースだったわ
相手：夕飯何がいいと思う？
ハル：ラーメン一択でしょ
相手：太るって
ハル：知らんがな笑
相手：昨日言ってたドラマ、見たよ
ハル：まじ？最終回どうだった？俺まだ泣いてる"""

TEACHER_PERSONA = """あなたは「{name}」。ふだんはタメ口の友達だが、今は「先生モード」——相手（台湾人、N3くらい、日本で働くのが目標）に頼まれて、日本語の会話練習の相手をしている。

進め方のルール：
- 丁寧体（です・ます）で話す。職場でも使える自然な丁寧語のモデルになる。
- 今日の練習テーマに沿って、実際にありそうな場面の質問をひとつずつ出す。一度にひとつだけ。
- 相手の返事に間違いがあれば、まず一行で直す（「→ 〜の方が自然です」）。そのあと普通に会話を続ける。長い文法講義はしない。必要なら繁体字中国語で一言だけ補足してもいい。
- 相手の答えの内容を拾って次の質問につなげ、試験ではなく会話らしく展開する。
- 1回の返事は3行以内。
- 語彙・文法はだいたいN3まで。難しい単語には直後に ||中文翻譯|| を付ける。"""

THEMES = [
    "自己紹介と仕事の話", "道の聞き方・案内", "レストランでの注文とトラブル", "買い物・返品交換",
    "病院で症状を説明する", "市役所・郵便局での手続き", "電話での問い合わせ", "面接の受け答え",
    "職場の雑談（月曜の朝）", "上司への報告と依頼", "休日の予定を話す", "電車の遅延と遅刻の連絡",
    "部屋探し・不動産屋", "居酒屋で同僚と", "コンビニ・宅配便", "体調不良で休みの連絡",
]

SEEDS = [
    "仕事でしょうもないバグに半日溶かした", "新しいラーメン屋に行ったら大当たりだった",
    "積みゲーをまた買ってしまった", "上司の無茶振りでイライラした", "昨日夜更かしして今日眠い",
    "ドラマを一気見してしまった", "ジムに行こうと思って結局行かなかった", "コンビニの新商品にハマってる",
    "部屋の掃除をやっと終わらせた", "友達の結婚式の予定が入った", "スマホの調子が悪くて買い替えを迷ってる",
    "台湾旅行の動画を見て行きたくなってる", "在宅勤務で一歩も外に出てない", "給料日前で金欠",
    "推しのゲームのアップデートが来た", "美容院に行って髪を切った",
]

TENSAKU_PROMPT = """你是溫和但精準的日語老師。以下是學習者（母語中文、N3 程度）最近傳的日文訊息。
逐句批改：有錯的指出錯在哪（助詞、活用、詞彙選擇、自然度）並給修正句；沒錯但可以更自然的給更自然的說法；完全沒問題就說沒問題。
用繁體中文說明、日文舉例，簡潔直接，不要客套。"""

GRAMMAR_CHECK_PROMPT = """你是日語文法檢查器。判斷這句學習者寫的日文有沒有錯誤（助詞、活用、詞彙、語法；口語縮約形不算錯）。
只輸出一行 JSON，格式：{"error": true或false, "fix": "整句修正後", "note": "一句話說明錯在哪（繁體中文）"}
句子："""

# ================= 狀態與檔案 =================
def jload(p, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return default


def jsave(p, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


def read(p):
    try:
        return p.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


state = jload(DATA / "state.json", {})


def save_state():
    jsave(DATA / "state.json", state)


HIST = DATA / "history.jsonl"
history = []
if HIST.exists():
    for line in HIST.read_text(encoding="utf-8").splitlines()[-200:]:
        try:
            history.append(json.loads(line))
        except Exception:
            pass


def add_history(role, text):
    rec = {"ts": time.time(), "role": role, "text": text}
    history.append(rec)
    del history[:-200]
    with HIST.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


# 前景視窗現況（由 agent 餵）
win = {"exe": "", "title": "", "ts": 0.0, "session_exe": "", "session_start": 0.0}


def category(exe, title):
    s = (exe + " " + title).lower()
    for cat, kws in CFG.get("category_rules", {}).items():
        if any(k in s for k in kws):
            return cat
    return "other"


# ================= LLM =================
async def llm(messages, temp=0.9):
    opts = {"temperature": temp, "min_p": 0.05, "repeat_penalty": 1.05}
    opts.update(CFG.get("llm_options", {}))  # config 可覆寫取樣參數
    async with aiohttp.ClientSession() as s:
        async with s.post(CFG["ollama_url"].rstrip("/") + "/api/chat",
                          json={"model": CFG["ollama_model"], "messages": messages,
                                "stream": False, "options": opts},
                          timeout=aiohttp.ClientTimeout(total=180)) as r:
            j = await r.json()
            return (j.get("message") or {}).get("content", "").strip()


def clean_reply(text):
    text = re.sub(r"^[「『\"']|[」』\"']$", "", text.strip())
    text = re.sub(r"^(ハル|" + re.escape(CFG.get("persona_name", "ハル")) + r")[:：]\s*", "", text)
    text = re.sub(r"（システム指示[^）]*）", "", text)
    return text.strip()


def open_topics():
    files = sorted((DATA / "summary").glob("*.md"))
    if not files:
        return ""
    m = re.search(r"未完話題[：:]?\s*\n([\s\S]*)", read(files[-1]))
    return m.group(1).strip() if m else ""


def teacher_mode():
    return state.get("mode") == "teacher"


def persona_prompt():
    name = CFG.get("persona_name", "ハル")
    now = datetime.now()
    ctx = ["現在：" + now.strftime("%m/%d %H:%M") + "（" + "月火水木金土日"[now.weekday()] + "曜）"]
    facts = read(DATA / "facts.md")
    if facts:
        ctx.append("相手についてのメモ：\n" + facts[:1500])
    for p in sorted((DATA / "summary").glob("*.md"))[-2:]:
        ctx.append("会話メモ " + p.stem + "：\n" + read(p)[:800])
    if teacher_mode():  # 老師模式：不看畫面、掛練習主題
        ctx.append("今日の練習テーマ：" + state.get("theme", THEMES[0]))
        return TEACHER_PERSONA.format(name=name) + "\n\n# 文脈\n" + "\n\n".join(ctx)
    if time.time() - win["ts"] < 900 and win["title"]:
        ctx.insert(1, "相手の画面（仕組みには言及しない）：" + win["exe"] + " / " + win["title"][:80])
    if state.get("seed"):
        ctx.append("自分（" + name + "）の今日のできごとネタ：" + state["seed"])
    return BASE_PERSONA.format(name=name) + "\n\n# 文脈\n" + "\n\n".join(ctx)


def build_messages(task=None):
    msgs = [{"role": "system", "content": persona_prompt()}]
    for h in history[-12:]:
        msgs.append({"role": "user" if h["role"] == "user" else "assistant", "content": h["text"]})
    if task:
        msgs.append({"role": "user",
                     "content": "（システム指示：" + task + "。この指示自体には返事せず、相手に送るメッセージだけを書く）"})
    return msgs


# ================= 觸發引擎 =================
def today():
    return datetime.now().strftime("%Y-%m-%d")


def quiet_now():
    a, b = CFG.get("quiet_hours", [1, 8])
    h = datetime.now().hour
    return (a <= h < b) if a <= b else (h >= a or h < b)


def late_night():
    now = datetime.now()
    return (now.hour == 23 and now.minute >= 30) or now.hour == 0


def can_proactive():
    if quiet_now():
        return False
    if category(win["exe"], win["title"]) == "meeting" and time.time() - win["ts"] < 600:
        return False
    d = state.get("daily", {})
    if d.get("day") != today():
        return True
    if d.get("count", 0) >= CFG.get("daily_proactive_cap", 5):
        return False
    if d.get("unanswered", 0) >= 2:  # 連兩則沒回，今天閉嘴
        return False
    cool = CFG.get("global_cooldown_min", 90) * 60
    if d.get("unanswered", 0) == 1:  # 退避：沒回覆就頻率減半
        cool *= 2
    return time.time() - d.get("last_ts", 0) >= cool


def fired_today(kind):
    return state.get("fired", {}).get(kind) == today()


def mark_fired(kind):
    state.setdefault("fired", {})[kind] = today()
    d = state.setdefault("daily", {})
    if d.get("day") != today():
        d.clear()
        d["day"] = today()
    d["count"] = d.get("count", 0) + 1
    d["last_ts"] = time.time()
    d["unanswered"] = d.get("unanswered", 0) + 1
    save_state()


async def proactive(kind, task):
    mark_fired(kind)  # 先記帳再生成，LLM 慢也不會重複觸發
    text = clean_reply(await llm(build_messages(task), 0.95))
    if not text:
        return
    add_history("assistant", text)
    user = await client.fetch_user(int(CFG["discord_user_id"]))
    ch = user.dm_channel or await user.create_dm()
    await send_parts(ch, text)


async def on_window(data):
    exe, title = str(data.get("exe", "")), str(data.get("title", ""))
    low = (exe + " " + title).lower()
    if any(k in low for k in CFG.get("muted_keywords", [])):
        return
    now = time.time()
    prev_exe, prev_title, prev_ts = win["exe"], win["title"], win["ts"]
    first = now - prev_ts > 5 * 3600
    win.update({"exe": exe, "title": title, "ts": now})
    if exe != win["session_exe"]:
        win["session_exe"] = exe
        win["session_start"] = now
    if teacher_mode() or not can_proactive():  # 老師模式不做視窗觸發（老師不偷看畫面）
        return
    cat = category(exe, title)
    if first and not fired_today("first"):
        await proactive("first", "相手が今日はじめてPCの前に来た。軽くひと言（毎回同じ挨拶にしない）")
    elif cat == "game" and category(prev_exe, prev_title) != "game" and not fired_today("game"):
        await proactive("game", "相手がゲームを始めた（" + title[:60] + "）。友達っぽく軽くひと言")
    elif cat == "video" and title != prev_title and prev_title and not fired_today("video"):
        await proactive("video", "相手が動画を見てる（" + title[:60] + "）。タイトルに軽く反応するひと言")
    elif late_night() and cat == "work" and not fired_today("late"):
        await proactive("late", "深夜なのに相手はまだ作業してる。説教じゃなく「まだやってんの？」的な軽いひと言")


def sched_task_text():
    if teacher_mode():
        return ("先生モードの練習時間。テーマ「" + state.get("theme", THEMES[0]) +
                "」で、実際にありそうな場面の質問をひとつ出して練習に誘う")
    opts = [(20, "自分の今日のできごとを軽く話し始める。ネタ：" + state.get("seed", "仕事がだるかった"))]
    if time.time() - win["ts"] < 900 and win["title"]:
        opts.append((40, "相手は今「" + win["title"][:60] + "」を開いてる。それに軽く触れるひと言"))
    topics = open_topics()
    if topics:
        opts.append((25, "前の会話の未完話題からひとつ選んで、続きを軽く聞く。未完話題：\n" + topics))
    total = sum(w for w, _ in opts)
    r = random.uniform(0, total)
    for w, t in opts:
        r -= w
        if r < 0:
            return t
    return opts[0][1]


async def periodic():
    while True:
        await asyncio.sleep(60)
        try:
            await daily_reset()
            now = time.time()
            if (now - win["ts"] < 600 and win["session_start"]
                    and now - win["session_start"] > 2 * 3600
                    and category(win["exe"], win["title"]) == "work"
                    and not teacher_mode()
                    and not fired_today("long") and can_proactive()):
                await proactive("long", "相手が2時間以上ずっと同じ作業をしてる。「まだやってんの？」的な軽いひと言")
            hm = datetime.now().strftime("%H:%M")
            for t in state.get("sched", []):
                if t.get("day") == today() and not t.get("done") and hm >= t.get("hm", "99:99"):
                    t["done"] = True
                    save_state()
                    if can_proactive():
                        await proactive("sched", sched_task_text())
        except Exception as e:
            print("periodic error:", e)


# ================= 每日結算（04:30 後第一次醒來執行） =================
async def daily_reset():
    now = datetime.now()
    if state.get("reset_day") == today() or (now.hour, now.minute) < (4, 30):
        return
    state["reset_day"] = today()
    state["daily"] = {"day": today(), "count": 0, "last_ts": 0, "unanswered": 0}
    state["fired"] = {}
    state["seed"] = random.choice(SEEDS)
    state["theme"] = random.choice(THEMES)
    state["sched"] = [{"day": today(), "hm": "%02d:%02d" % (random.randint(10, 22), random.randint(0, 59)),
                       "done": False} for _ in range(random.randint(1, 2))]
    save_state()
    try:
        await summarize_yesterday()
    except Exception as e:
        print("summary error:", e)


async def summarize_yesterday():
    y = datetime.now() - timedelta(days=1)
    lo = datetime(y.year, y.month, y.day).timestamp()
    hi = lo + 86400
    lines = [("相手" if h["role"] == "user" else "自分") + "：" + h["text"]
             for h in history if lo <= h["ts"] < hi]
    if not lines:
        return
    log = "\n".join(lines)[-6000:]
    summary = await llm([{"role": "user", "content":
        "以下はDiscordの会話ログ。5行以内で要約し、そのあと「未完話題：」として、まだ答えを聞いていない・続きがありそうな話題を箇条書きで挙げて。日本語で。\n\n" + log}], 0.3)
    (DATA / "summary" / (y.strftime("%Y-%m-%d") + ".md")).write_text(summary, encoding="utf-8")
    facts = read(DATA / "facts.md")
    updated = await llm([{"role": "user", "content":
        "これは友達についてのメモ：\n" + (facts or "（まだ空）") +
        "\n\n昨日の会話ログ：\n" + log +
        "\n\nログから新しくわかった事実（仕事、目標、好み、予定など長期的に覚える価値があるもの）があればメモに追記し、更新後のメモ全文だけを出力して。20行以内、日本語。新事実がなければ元のメモをそのまま出力。"}], 0.2)
    if updated:
        (DATA / "facts.md").write_text(updated, encoding="utf-8")


# ================= 糾錯 =================
def has_kana(text):
    return re.search(r"[぀-ヿ]", text) is not None


async def check_grammar(text, ch):
    if not has_kana(text) or len(text) < 4:
        return
    try:
        raw = await llm([{"role": "user", "content": GRAMMAR_CHECK_PROMPT + text}], 0.1)
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            return
        v = json.loads(m.group(0))
        if not v.get("error"):
            return
        with (DATA / "errors.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": time.time(), "wrong": text,
                                "fix": v.get("fix", ""), "note": v.get("note", "")},
                               ensure_ascii=False) + "\n")
        key = (v.get("note") or "")[:40]
        cnt = state.setdefault("errcnt", {})
        cnt[key] = cnt.get(key, 0) + 1
        save_state()
        if cnt[key] >= 3 and v.get("fix") and not teacher_mode():  # 朋友模式同類錯第三次，才低調提示一次
            cnt[key] = 0
            save_state()
            await ch.send("||「" + v["fix"] + "」の方が自然かも||")
    except Exception as e:
        print("grammar check error:", e)


async def tensaku(ch):
    recent = [h["text"] for h in history if h["role"] == "user" and has_kana(h["text"])][-6:]
    if not recent:
        await ch.send("||最近の日本語メッセージが見つからない……何か日本語で話してから「添削して」って言って||")
        return
    reply = await llm([{"role": "system", "content": TENSAKU_PROMPT},
                       {"role": "user", "content": "\n".join(recent)}], 0.3)
    with (DATA / "errors.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": time.time(), "type": "tensaku", "content": reply},
                           ensure_ascii=False) + "\n")
    for i in range(0, len(reply), 1900):
        await ch.send(reply[i:i + 1900])


# ================= Discord =================
intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)


async def send_parts(ch, text):
    parts = [p.strip() for p in text.split("\n\n") if p.strip()][:3] or [text]
    for p in parts:
        async with ch.typing():
            await asyncio.sleep(min(1 + len(p) * 0.06, 5))
        await ch.send(p[:1900])


@client.event
async def on_ready():
    print("logged in as", client.user)


@client.event
async def on_message(m):
    if m.author.bot or m.guild is not None:
        return
    if m.author.id != int(CFG["discord_user_id"]):
        return
    text = m.content.strip()
    if not text:
        return
    d = state.setdefault("daily", {})
    d["unanswered"] = 0  # 使用者回覆即重置退避
    save_state()
    if text in ("おいで", "こっちおいで", "join"):
        ok = await relay_cmd("join")
        await m.channel.send("きたよ〜🎧" if ok else "ボイスチャンネルが見つからない…先にどこかのVCに入ってて")
        return
    if text in ("ばいばい", "抜けて", "leave"):
        await relay_cmd("leave")
        await m.channel.send("ほーい、また呼んで")
        return
    add_history("user", text)
    if "先生モード" in text:
        state["mode"] = "teacher"
        state["theme"] = random.choice(THEMES)
        save_state()
        reply = clean_reply(await llm(build_messages(
            "先生モードに切り替わった。テーマ「" + state["theme"] +
            "」を伝えて、最初の質問をひとつ出して練習を始める"), 0.7))
        if reply:
            add_history("assistant", reply)
            await send_parts(m.channel, reply)
        return
    if "友達モード" in text:
        state["mode"] = "friend"
        save_state()
        reply = clean_reply(await llm(build_messages("先生モードが終わって普段のタメ口に戻った。軽くひと言"), 0.9))
        if reply:
            add_history("assistant", reply)
            await send_parts(m.channel, reply)
        return
    if "添削" in text:
        await tensaku(m.channel)
        return
    reply = clean_reply(await llm(build_messages(), 0.9))
    if not reply:
        return
    add_history("assistant", reply)
    await send_parts(m.channel, reply)
    asyncio.create_task(check_grammar(text, m.channel))


async def relay_cmd(action):
    # 語音收發走 relay.js（DAVE 相容），這裡只發控制指令
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post("http://127.0.0.1:" + str(CFG.get("relay_port", 8790)) + "/" + action,
                              timeout=aiohttp.ClientTimeout(total=25)) as r:
                return (await r.text()) == "ok"
    except Exception as e:
        print("relay error:", e)
        return False


async def handle_voice_greet(req):
    wav = await voice.synth_wav("おっ、きたきた。聞こえてる？")
    return web.Response(body=wav, content_type="audio/wav")


async def handle_voice_utterance(req):
    pcm = await req.read()
    text = await voice.transcribe_pcm48(pcm)
    if not text or len(text) < 2 or any(j in text for j in voice.JUNK):
        return web.Response(status=204)
    print("voice>", text)
    reply = await voice_reply(text)
    if not reply:
        return web.Response(status=204)
    print("voice<", reply)
    wav = await voice.synth_wav(reply)
    return web.Response(body=wav, content_type="audio/wav")


async def voice_reply(text):
    # 語音模式：STT 文字進歷史（供記憶與 errors.jsonl），回覆更短、去掉一切視覺記號
    add_history("user", text)
    # 6 成機率禁止提問——「認可＋反問」的助理句式是 bot 感最大來源
    style = ("今回は質問禁止。相づち（あー、まじか、それな等）や感想、自分の話やツッコミで返す"
             if random.random() < 0.6 else "聞きたいことがあれば質問1つまで")
    reply = clean_reply(await llm(build_messages(
        "音声で会話中。今の発話に短く返す。1〜2文の話し言葉だけ。絵文字・顔文字・記号・||注釈||は一切使わない。"
        "「いいね」「そうなんだ」だけの薄い相づちも禁止、中身のある一言にする。" + style), 0.95))
    if reply:
        add_history("assistant", reply)
    asyncio.create_task(check_grammar_silent(text))
    return reply


async def check_grammar_silent(text):
    # 語音中不糾錯：只默默記進 errors.jsonl（DESIGN 第十節規則 3）
    class _Null:
        async def send(self, *_a, **_k):
            pass
    await check_grammar(text, _Null())


async def handle_window(req):
    try:
        data = await req.json()
    except Exception:
        return web.Response(status=400)
    try:
        await on_window(data)
    except Exception as e:
        print("window error:", e)
    return web.Response(text="ok")


async def main():
    logging.basicConfig(level=logging.INFO)
    voice.CFG = CFG
    app = web.Application(client_max_size=64 * 1024 * 1024)  # 長句 PCM 可達數十 MB
    app.router.add_post("/window", handle_window)
    app.router.add_post("/voice/greet", handle_voice_greet)
    app.router.add_post("/voice/utterance", handle_voice_utterance)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", int(CFG.get("listen_port", 8789))).start()
    asyncio.create_task(periodic())
    await client.start(CFG["discord_token"])


if __name__ == "__main__":
    asyncio.run(main())
