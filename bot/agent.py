#!/usr/bin/env python3
# 視窗 agent（跑在筆電，Windows，純標準庫）
# 抓前景視窗的程序名＋標題，變化且穩定 10 秒後 POST 給 bot 本體；
# bot 本體在工作站，經既有 ssh 隧道轉發（ssh -L 8789:127.0.0.1:8789 工作站）。
# 背景執行：pythonw agent.py（或排進「工作排程器」開機啟動）
import ctypes
import ctypes.wintypes
import json
import time
import urllib.request

BOT_URL = "http://127.0.0.1:8789/window"
POLL_SEC = 5          # 輪詢間隔
STABLE_POLLS = 2      # 視窗變化後需連續 N 次輪詢相同才上報（過濾 alt-tab 掃過）
HEARTBEAT_SEC = 300   # 視窗沒變也每 5 分鐘報一次（供 bot 判斷長時間工作／今日首次活動）

# 含這些關鍵字（比對 exe＋標題小寫）的視窗完全不上傳
IGNORE = ["bank", "玉山", "國泰", "富邦", "郵局", "line", "messenger", "whatsapp",
          "password", "1password", "bitwarden", "keepass", "私密", "incognito", "無痕"]

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32


def foreground():
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return "", ""
    n = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    pid = ctypes.wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    exe = ""
    h = kernel32.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
    if h:
        sz = ctypes.wintypes.DWORD(1024)
        b = ctypes.create_unicode_buffer(1024)
        if kernel32.QueryFullProcessImageNameW(h, 0, b, ctypes.byref(sz)):
            exe = b.value.replace("/", "\\").rsplit("\\", 1)[-1].lower()
        kernel32.CloseHandle(h)
    return exe, buf.value


def send(exe, title):
    data = json.dumps({"ts": time.time(), "exe": exe, "title": title}).encode("utf-8")
    req = urllib.request.Request(BOT_URL, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=3).read()
    except Exception:
        pass  # 隧道沒開就靜默丟棄


def main():
    reported = ("", "")
    candidate = ("", "")
    stable = 0
    last_sent = 0.0
    while True:
        exe, title = foreground()
        cur = (exe, title)
        low = (exe + " " + title).lower()
        if not exe or any(k in low for k in IGNORE):
            time.sleep(POLL_SEC)
            continue
        if cur == reported:
            stable = 0
            candidate = cur
            if time.time() - last_sent >= HEARTBEAT_SEC:  # 心跳
                send(exe, title)
                last_sent = time.time()
        else:
            if cur == candidate:
                stable += 1
            else:
                candidate = cur
                stable = 1
            if stable >= STABLE_POLLS:
                reported = cur
                send(exe, title)
                last_sent = time.time()
                stable = 0
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    main()
