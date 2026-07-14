const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

const lEnd = script.lastIndexOf("];", script.indexOf("/* ================= 狀態"));
const lessons = script.slice(script.indexOf("const LESSONS=["), lEnd + 2);
const blk = script.slice(script.indexOf("/* ================= 今日條"), script.indexOf("/* ================= 初始化"));

function makeEnv(preStore) {
  return new Function("PRE", lessons + `
    const mem=Object.assign({},PRE);
    const store={get:(k,d)=>k in mem?mem[k]:d,set:(k,v)=>{mem[k]=v;}};
    const els={};
    const $=id=>els[id]||(els[id]={style:{},dataset:{}});
    const state={mode:"listen",lesson:0};
    let srs={},scores={};
    function switchMode(){}function runFrom(){}function fillLessons(){}function mpAsk(){}
    ${blk}
    return {daily,streakD,markPractice,srsDueAll,lastPracticed,todayRender,els,
            setSrs:o=>{srs=o;},setScores:o=>{scores=o;},mem};
  `)(preStore || {});
}

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };
const DAY = 86400000;
const dayKey = d => d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
const today = dayKey(new Date());
const yesterday = dayKey(new Date(Date.now() - DAY));

// 跨日重置：昨天的勾選不留到今天
const stale = makeEnv({ fsi_daily: JSON.stringify({ day: yesterday, drill: true, anki: true, listen: true, mp: true }) });
check(stale.daily.day === today && !stale.daily.drill && !stale.daily.anki && !stale.daily.mp, "跨日 → 清單全部歸零");

// 連續天數
const env = makeEnv({ fsi_streak: JSON.stringify({ last: yesterday, n: 3 }) });
env.markPractice();
check(env.streakD.n === 4 && env.streakD.last === today && env.daily.drill, "昨天有練、今天再練 → 連續 4 天＋操練打勾");
env.markPractice();
check(env.streakD.n === 4, "同一天重複練 → 天數不重複加");
env.streakD.last = "2020-1-1"; env.streakD.n = 9;
env.markPractice();
check(env.streakD.n === 1, "中斷後再練 → 從 1 重新起算");

// 到期統計與上次進度
const now = Date.now();
env.setSrs({ "listen|1|0": { b: 0, due: now - 1 }, "sub|2|0-1": { b: 1, due: now - 1 }, "sub|3|0-0": { b: 0, due: now - 1 }, "qa|4|0": { b: 0, due: now + DAY } });
const d = env.srsDueAll();
check(d.tot === 3 && d.by.sub === 2 && d.by.listen === 1 && d.by.qa === 0, "srsDueAll：只算到期、按模式分組");
env.setScores({ 5: { sub: { best: 80, last: 68, t: 100 } }, 8: { qa: { best: 90, last: 90, t: 200 } } });
const lp = env.lastPracticed();
check(lp.lesson === 8 && lp.mode === "qa" && lp.last === 90, "lastPracticed 取最近時間戳");

// todayRender 輸出
env.todayRender();
check(env.els.tdReview.innerHTML.includes("3 句"), "今日條顯示到期複習數");
check(env.els.tdLast.innerHTML.includes("第9課") && env.els.tdLast.innerHTML.includes("繼續"), "上次進度：≥75% 顯示「繼續」");
check(env.els.tdStreak.textContent.includes("連續"), "顯示連續天數");
check(env.els.ckDrill.checked === true, "操練勾選反映今日狀態");

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
