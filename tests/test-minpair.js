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
check(MINPAIRS.length >= 6, "至少 6 組對立組（目前 " + MINPAIRS.length + "）");
let ok = true;
MINPAIRS.forEach((p, i) => {
  if (!Array.isArray(p.s) || p.s.length !== 2 || !Array.isArray(p.o) || p.o.length !== 2) { ok = false; return; }
  p.o.forEach((o, j) => {
    if (!o.jp || !o.acc || !o.cn) ok = false;
    if (!p.s[j].includes(o.jp)) ok = false; // 句子必須含該選項的漢字（TTS 靠漢字選重音）
  });
  if (!(p.o[0].acc.includes("↘") || p.o[0].acc.includes("‾")) || !(p.o[1].acc.includes("↘") || p.o[1].acc.includes("‾"))) ok = false;
});
check(ok, "每組：2 句、2 選項、句含對應漢字、重音標記齊全");

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
