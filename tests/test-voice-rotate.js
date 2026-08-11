const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

// 抽出 VOICE_POOL／pickItemVoice（多音色輪流，Roadmap #34：訓練耳朵適應不只一種TTS聲音）
const blk = script.slice(script.indexOf("const VOICE_POOL"), script.indexOf("async function synthCloud"));
const { VOICE_POOL, pickItemVoice } = new Function(blk + "; return {VOICE_POOL,pickItemVoice};")();

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };

check(Array.isArray(VOICE_POOL) && VOICE_POOL.length >= 4, "VOICE_POOL 至少4種聲音（單一聲音沒有輪流意義）");
check(new Set(VOICE_POOL).size === VOICE_POOL.length, "VOICE_POOL 內無重複");
check(pickItemVoice(0) === VOICE_POOL[0] && pickItemVoice(1) === VOICE_POOL[1], "依索引依序挑聲音");
check(pickItemVoice(VOICE_POOL.length) === VOICE_POOL[0], "索引超過池子長度時循環回第一個（不會undefined）");
{
  const seen = new Set();
  for (let i = 0; i < VOICE_POOL.length * 3; i++) seen.add(pickItemVoice(i));
  check(seen.size === VOICE_POOL.length, "連續多題輪過一輪後，池子裡每種聲音都出現過");
}

// 全script掃描：確認獨立於playItem()的TTS/音高分析入口都有重設curItemVoice，不會殘留上一輪的輪流聲音
// （這幾個函式在改用playItem()流程之外呼叫synthCloud，若不重設，開著輪流時會把上一題的聲音誤帶進來）
const independentEntries = ["playModel", "playModelSlow", "analyzePitch", "mpAsk", "examAsk", "hwPitchFor"];
independentEntries.forEach(name => {
  const re = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = re.exec(script);
  check(!!m, name + "() 存在於原始碼中");
  if (!m) return;
  // 找到函式起點後，往後找到下一個「function 」開頭（下一個函式宣告）當作粗略邊界，掃描這段範圍內有沒有 curItemVoice=null
  const bodyStart = m.index;
  const nextFnMatch = script.slice(bodyStart + m[0].length).search(/\n(async )?function /);
  const body = script.slice(bodyStart, nextFnMatch >= 0 ? bodyStart + m[0].length + nextFnMatch : bodyStart + 400);
  check(/curItemVoice\s*=\s*null/.test(body), name + "() 內有重設 curItemVoice=null（防殘留輪流聲音）");
});

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
