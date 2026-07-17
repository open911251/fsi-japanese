#!/usr/bin/env python3
# 語音輔助：STT 前處理與 VOICEVOX 合成。
# 收發音由 relay/relay.js 負責（Discord 2026-03 強制 DAVE E2EE，Python 生態收音未支援，
# 走 discord.js 中繼；見 DESIGN.md 第十節）。本模組不碰 Discord。
import audioop
import io
import re
import wave

import aiohttp

CFG = {}  # bot.py 啟動時注入

JUNK = ["ご視聴ありがとうございました", "チャンネル登録", "お疲れ様でした。"]  # whisper 幻覚常客


async def transcribe_pcm48(pcm48s):
    """48kHz s16 立體聲 PCM → whisper 文字"""
    mono = audioop.tomono(pcm48s, 2, 0.5, 0.5)
    pcm16k, _ = audioop.ratecv(mono, 2, 1, 48000, 16000, None)
    bio = io.BytesIO()
    with wave.open(bio, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm16k)
    form = aiohttp.FormData()
    form.add_field("file", bio.getvalue(), filename="utt.wav", content_type="audio/wav")
    form.add_field("language", "ja")
    async with aiohttp.ClientSession() as s:
        async with s.post(CFG.get("stt_url", "http://127.0.0.1:8788/v1/audio/transcriptions"),
                          data=form, timeout=aiohttp.ClientTimeout(total=60)) as r:
            return (await r.json()).get("text", "").strip()


def _clean_for_tts(text):
    text = re.sub(r"\|\|[^|]*\|\|", "", text)               # 劇透注釋
    text = re.sub(r"[*_`~#>\[\]()]", "", text)               # markdown 殘渣
    text = re.sub(r"[\U0001F000-\U0001FAFF☀-➿]", "", text)  # emoji
    return text.strip()


async def synth_wav(text):
    """文字 → VOICEVOX WAV bytes（給 relay 播放）"""
    text = _clean_for_tts(text)
    if not text:
        return b""
    vv = CFG.get("voicevox_url", "http://127.0.0.1:50021")
    spk = int(CFG.get("voicevox_speaker", 11))
    async with aiohttp.ClientSession() as s:
        async with s.post(vv + "/audio_query", params={"text": text, "speaker": spk},
                          timeout=aiohttp.ClientTimeout(total=30)) as r:
            q = await r.json()
        q["speedScale"] = float(CFG.get("voice_speed", 0.95))
        q["intonationScale"] = float(CFG.get("voice_intonation", 1.15))  # 抑揚拉大，唸起來不平板
        async with s.post(vv + "/synthesis", params={"speaker": spk}, json=q,
                          timeout=aiohttp.ClientTimeout(total=120)) as r:
            return await r.read()
