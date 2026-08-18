const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

const lEnd = script.lastIndexOf("];", script.indexOf("/* ================= 狀態"));
const lessons = script.slice(script.indexOf("const LESSONS=["), lEnd + 2);
const blk = script.slice(script.indexOf("function findWeakSpots"), script.indexOf("const TD_MODENAME"));

const env = new Function(lessons + `
  let scores={};
  let mpHist={g:{}};
  ${blk}
  return {findWeakSpots:findWeakSpots, setScores:v=>{scores=v;}, setMpHist:v=>{mpHist=v;}, LESSONS:LESSONS};
`)();
const { findWeakSpots, setScores, setMpHist, LESSONS } = env;

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };

// 課次弱點
{
  setScores({
    "0": { sub: { best: 60, t: 1000 }, qa: { best: 90, t: 1000 } }, // sub 弱、qa 不弱
    "1": { sub: { best: 0 } },                                     // 沒有 t（從沒練過）→ 不算弱點
    "2": { qa: { best: 40, t: 2000 } },                             // 更弱，應排在前面
  });
  setMpHist({ g: {} });
  const w = findWeakSpots();
  check(w.lessons.length === 2, "只抓到2個真弱點（best<75 且已經練過），沒練過的那個被排除");
  check(w.lessons[0].lesson === 2 && w.lessons[0].best === 40, "最弱的（40%）排最前面");
  check(w.lessons[1].lesson === 0 && w.lessons[1].mode === "sub", "第1課的sub（60%）也被抓到，qa（90%）沒有");
}

// pending 骨架課次不算（即使不小心留有分數紀錄，也不是真的內容）
{
  const idx = 0;
  const origPending = LESSONS[idx].pending;
  LESSONS[idx].pending = true;
  setScores({ [idx]: { sub: { best: 30, t: 1000 } } });
  setMpHist({ g: {} });
  const w = findWeakSpots();
  check(w.lessons.length === 0, "pending骨架課次即使有低分紀錄也不算弱點");
  LESSONS[idx].pending = origPending;
}

// 聽辨弱點
{
  setScores({});
  setMpHist({
    g: {
      "箸|橋": { n: 5, ok: 2 },   // wr=0.6，偏弱
      "雨|飴": { n: 2, ok: 0 },   // 樣本數<3，排除
      "神|紙": { n: 10, ok: 9 },  // wr=0.1，不算弱
      "牡蠣|柿": { n: 4, ok: 1 }, // wr=0.75，最弱
    }
  });
  const w = findWeakSpots();
  check(w.minpairs.length === 2, "只抓到2組真弱點（樣本數>=3 且答錯率>=0.4）");
  check(w.minpairs[0].key === "牡蠣|柿", "答錯率最高的排最前面");
  check(w.minpairs.some(x => x.key === "箸|橋"), "箸/橋（wr=0.6）有被抓到");
  check(!w.minpairs.some(x => x.key === "雨|飴"), "樣本數不足的組被排除");
  check(!w.minpairs.some(x => x.key === "神|紙"), "答對率高的組沒有被誤判成弱點");
}

// 完全沒有練習紀錄的空狀態
{
  setScores({});
  setMpHist({ g: {} });
  const w = findWeakSpots();
  check(w.lessons.length === 0 && w.minpairs.length === 0, "空資料 → 回傳兩個空陣列，不拋例外");
}

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
