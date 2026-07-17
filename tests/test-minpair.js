const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };

// MINPAIRS 資料完整性
const mpBlk = script.slice(script.indexOf("const MINPAIRS=["), script.indexOf("];", script.indexOf("const MINPAIRS=[")) + 2);
const MINPAIRS = new Function(mpBlk + "; return MINPAIRS;")();
check(MINPAIRS.length >= 25, "至少 25 組對立組（目前 " + MINPAIRS.length + "）");
let ok = true;
const pitchMark = a => a.includes("↘") || a.includes("‾");
const segMark = a => /長音|短音|促音|清音|濁音|拗音|直音/.test(a); // 音段對立組用類別標記
MINPAIRS.forEach((p, i) => {
  if (!Array.isArray(p.s) || p.s.length !== 2 || !Array.isArray(p.o) || p.o.length !== 2) { ok = false; return; }
  p.o.forEach((o, j) => {
    if (!o.jp || !o.acc || !o.cn) ok = false;
    if (!p.s[j].includes(o.jp)) ok = false; // 句子必須含該選項的字（TTS 靠它選發音）
  });
  if (!((pitchMark(p.o[0].acc) && pitchMark(p.o[1].acc)) || (segMark(p.o[0].acc) && segMark(p.o[1].acc)))) ok = false;
});
check(ok, "每組：2 句、2 選項、句含對應字、標記齊全（重音符號或音段類別）");

// mpPick 加權抽題：答錯率高的組被抽中機率應高於均勻
const pickBlk = script.slice(script.indexOf("function mpKey"), script.indexOf("let mp={"));
const mkPick = new Function("MINPAIRS", "mpHist", pickBlk + "; return mpPick;");
const hist = { g: {} };
MINPAIRS.forEach((p, i) => { hist.g[p.o[0].jp + "|" + p.o[1].jp] = { n: 10, ok: i === 0 ? 0 : 10 }; });
const pick = mkPick(MINPAIRS, hist);
let hit0 = 0;
for (let i = 0; i < 2000; i++) if (pick() === MINPAIRS[0]) hit0++;
check(hit0 / 2000 > 2 / MINPAIRS.length, "全錯的組抽中率超過均勻兩倍（實測 " + (hit0 / 20).toFixed(1) + "%）");
check(mkPick(MINPAIRS, { g: {} })() != null, "無歷史紀錄時也能抽題");

// fbHints：曲線差異 → 文字修正建議
const hintsBlk = script.slice(script.indexOf("function fbHints"), script.indexOf("let fbSeg"));
const slopeBlk = script.slice(script.indexOf("function segSlope"), script.indexOf("function corrOf"));
const { fbHints } = new Function(slopeBlk + hintsBlk + "; return {fbHints};")();

const flat = Array(48).fill(0);
check(fbHints(flat, flat).length === 0, "曲線一致 → 無建議");
check(fbHints(flat, flat.map(() => 3))[0].includes("壓低"), "整體偏高 → 句首壓低建議");
const fall = flat.map((_, i) => i > 33 ? -(i - 33) * 0.5 : 0); // 示範句尾下降
check(fbHints(fall, flat).some(h => h.includes("句尾要降")), "示範句尾下降、使用者持平 → 提醒降下來");
const rise = flat.map((_, i) => i > 33 ? (i - 33) * 0.5 : 0); // 示範句尾上揚（疑問）
check(fbHints(rise, flat).some(h => h.includes("句尾要揚")), "示範句尾上揚、使用者持平 → 提醒揚上去");

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
