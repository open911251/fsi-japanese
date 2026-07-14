const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

const lEnd = script.lastIndexOf("];", script.indexOf("/* ================= 狀態"));
const lessons = script.slice(script.indexOf("const LESSONS=["), lEnd + 2);
const blk = script.slice(script.indexOf("/* ================= 回合評分"), script.indexOf("/* ================= 顯示"));

const env = new Function(lessons + `
  const mem={};
  const store={get:(k,d)=>k in mem?mem[k]:d,set:(k,v)=>{mem[k]=v;}};
  const state={mode:"sub",lesson:0};
  let lastStatus="";
  function setStatus(id,msg){lastStatus=msg;}
  function fillLessons(){}
  function markPractice(){}
  const $=id=>({});
  ${blk}
  return {roundVerdict,scoreSave,scoreBadge,finishRound,scores,state,
          getStatus:()=>lastStatus,pushStats:a=>{roundStats=a;}};
`)();

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };
const { roundVerdict, scoreSave, scoreBadge, finishRound, scores, state, getStatus, pushStats } = env;

// roundVerdict 統計
check(roundVerdict([]) === null, "空回合 → null（不評分）");
const v1 = roundVerdict([90, 90, 70]);
check(v1.avg === 83 && v1.pass && v1.ok === 2 && v1.mid === 1 && v1.bad === 0, "平均 83 → 合格，✅🔶❌ 計數正確");
check(!roundVerdict([70, 70, 80]).pass, "平均 73 → 不合格");
check(roundVerdict([75]).pass, "剛好 75 → 合格（邊界）");
const v2 = roundVerdict([100, 50]);
check(v2.ok === 1 && v2.bad === 1 && v2.pass, "85/60 分界計數正確");

// scoreSave / scoreBadge
scoreSave({ avg: 60 });
check(scores[0].sub.best === 60 && scores[0].sub.last === 60, "首輪成績寫入 best/last");
scoreSave({ avg: 82 });
check(scores[0].sub.best === 82, "更高分更新 best");
scoreSave({ avg: 70 });
check(scores[0].sub.best === 82 && scores[0].sub.last === 70, "較低分只更新 last，best 保留");
check(scoreBadge(0) === "　✅82%", "只練過 sub → 徽章用 sub best");
scores[0].qa = { best: 55 };
check(scoreBadge(0) === "　⚠55%", "sub+qa 都練過 → 取較弱一項（精熟下限）");
check(scoreBadge(9) === "", "沒練過的課 → 無徽章");
scores[0].build = { best: 40 };
check(scoreBadge(0) === "　⚠40%", "build 也計入精熟下限");
state.lesson = -1;
scoreSave({ avg: 99 });
check(!scores[-1], "自訂教材不記分");
state.lesson = 0;

// finishRound 訊息
pushStats([90, 90, 90]);
finishRound();
check(getStatus().includes("🎉") && getStatus().includes("建議下一課"), "合格 → 慶祝＋建議下一課");
pushStats([50, 60, 55]);
finishRound();
check(getStatus().includes("💪") && getStatus().includes("重練"), "不合格 → 建議重練");
pushStats([]);
finishRound();
check(getStatus().includes("本輪完成"), "無評分資料 → 原本的完成訊息");
state.mode = "build";
pushStats([90, 88]);
finishRound();
check(getStatus().includes("🎉") && scores[0].build.best === 89, "build 模式也結算並記分");
state.mode = "listen";
pushStats([90, 88]);
finishRound();
check(getStatus().includes("本輪完成"), "listen 模式不結算（只有腔調圖）");

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
