const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

const lEnd = script.lastIndexOf("];", script.indexOf("/* ================= 狀態"));
const lessons = script.slice(script.indexOf("const LESSONS=["), lEnd + 2);
const blk = script.slice(script.indexOf("const SRS_INT"), script.indexOf("function itemsRaw"));

const env = new Function("NOW", lessons + `
  const mem={};
  const store={get:(k,d)=>k in mem?mem[k]:d,set:(k,v)=>{mem[k]=v;}};
  const state={mode:"listen",lesson:0,idx:0,review:[]};
  let stubItems=[];
  function items(){return stubItems;}
  function curLesson(){return state.lesson===-1?null:LESSONS[state.lesson];}
  ${blk}
  return {srs,srsMark,srsDue,srsResolve,srsIdOf,srsBuildReview,state,LESSONS,
          setItems:a=>{stubItems=a;},SRS_INT};
`)(Date.now());

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };
const DAY = 86400000, now = Date.now();
const { srs, srsMark, srsDue, srsResolve, srsIdOf, srsBuildReview, state, LESSONS, setItems, SRS_INT } = env;

// 升降盒邏輯
srsMark("listen|1|0", 1);
check(srs["listen|1|0"].b === 0 && Math.abs(srs["listen|1|0"].due - (now + 1 * DAY)) < 5000, "新句首次成功 → 盒0、明天到期");
const dueBefore = srs["listen|1|0"].due;
srsMark("listen|1|0", 1);
check(srs["listen|1|0"].b === 0 && srs["listen|1|0"].due === dueBefore, "未到期重複練習 → 排程不變（防狂刷衝頂）");
srs["listen|1|0"].due = now - 1000;
srsMark("listen|1|0", 1);
check(srs["listen|1|0"].b === 1 && Math.abs(srs["listen|1|0"].due - (now + 2 * DAY)) < 5000, "到期後成功 → 升盒、間隔加倍");
srsMark("listen|1|0", -1);
check(srs["listen|1|0"].b === 0, "失敗 → 打回盒0（即使未到期）");
for (let i = 0; i < 9; i++) { srs["listen|1|0"].due = now - 1000; srsMark("listen|1|0", 1); }
check(srs["listen|1|0"].b === SRS_INT.length - 1, "連續成功 → 封頂在最高盒");
srsMark(null, 1);
check(true, "null 鍵不爆炸");

// 到期查詢：同模式、非目前課、已到期
srs["listen|2|0"] = { b: 0, due: now - 5000 };
srs["listen|0|0"] = { b: 0, due: now - 5000 };   // 目前課（lesson 0）→ 排除
srs["qa|3|0"]     = { b: 0, due: now - 5000 };   // 不同模式 → 排除
srs["listen|4|1"] = { b: 0, due: now + 9 * DAY };// 未到期 → 排除
srs["listen|5|2"] = { b: 0, due: now - 90000 };  // 更早到期 → 排最前
const due = srsDue();
check(due.length === 2 && due[0] === "listen|5|2" && due[1] === "listen|2|0", "srsDue 過濾＋排序正確");

// 鍵 → 教材項目還原
const r1 = srsResolve("listen|2|0");
check(r1 && r1.it === LESSONS[2].listen[0] && r1.src === LESSONS[2].t, "listen 鍵還原到正確句子");
const r2 = srsResolve("sub|7|1-2");
check(r2 && r2.it.type === "cue" && r2.it.s === LESSONS[7].sub[1] && r2.it.c === LESSONS[7].sub[1].cues[2], "sub 鍵還原到正確句型與代換詞");
const r3 = srsResolve("qa|3|1");
check(r3 && r3.it === LESSONS[3].qa[1], "qa 鍵還原到正確問答");
check(srsResolve("listen|99|0") === null, "不存在的課 → null");

// items() 索引 → 鍵
state.review = [{ key: "listen|5|2", src: "x", it: LESSONS[5].listen[2] }];
setItems([LESSONS[5].listen[2]].concat(LESSONS[0].listen));
check(srsIdOf(0) === "listen|5|2", "複習題索引 → 回其原始鍵");
check(srsIdOf(1) === "listen|0|0", "本課句索引 → 正確鍵");
state.mode = "sub"; state.review = [];
setItems([{ type: "base", s: LESSONS[0].sub[0] }, { type: "cue", s: LESSONS[0].sub[0], c: LESSONS[0].sub[0].cues[3] }]);
check(srsIdOf(0) === null, "sub 基本句 → 不排程");
check(srsIdOf(1) === "sub|0|0-3", "sub 代換題 → 正確鍵");
setItems([{ type: "prev", s: LESSONS[0].sub[0], c: LESSONS[0].sub[0].cues[0] }]);
check(srsIdOf(0) === null, "sub 預習項 → 不排程");
setItems([{ type: "base", s: LESSONS[0].sub[0] }, { type: "cue", s: LESSONS[0].sub[0], c: LESSONS[0].sub[0].cues[3] }]);
state.lesson = -1;
check(srsIdOf(1) === null, "自訂教材 → 不排程");
state.lesson = 0;

// 複習隊列建構
state.mode = "listen";
const r = (srsBuildReview(), state.review);
check(r.length === 2 && r[0].key === "listen|5|2" && r[0].it === LESSONS[5].listen[2], "srsBuildReview 插入到期複習題");
state.mode = "build";
srsBuildReview();
check(state.review.length === 0, "build 模式不插複習");

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
