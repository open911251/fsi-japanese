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
    const $=id=>els[id]||(els[id]={style:{},dataset:{},value:""});
    const state={mode:"listen",lesson:0};
    let srs={},scores={};
    function switchMode(){}function runFrom(){}function fillLessons(){}function mpAsk(){}
    ${blk}
    return {daily,streakD,markPractice,srsDueAll,lastPracticed,todayRender,els,plan,
            planAdvanceIfNewDay,planMastered,planRender,LESSONS,
            tdWeekNum,teacherRuleComment,teacherContext,WEEK_PLAN,
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

// 今日指定課（自動排進度，換日才評估一次）
const p1 = makeEnv({});
check(p1.plan.lesson === 0 && p1.plan.day === 1, "無紀錄時預設第1課、第1天");

const p2 = makeEnv({ fsi_plan: JSON.stringify({ lesson: 2, day: 1, checked: today, forced: false }) });
p2.planAdvanceIfNewDay();
check(p2.plan.lesson === 2 && p2.plan.day === 1, "同一天重複評估 → 不變");

const p3 = makeEnv({ fsi_plan: JSON.stringify({ lesson: 2, day: 1, checked: yesterday, forced: false }) });
p3.setScores({ 2: { sub: { best: 80 }, qa: { best: 90 } } });
p3.planAdvanceIfNewDay();
check(p3.plan.lesson === 3 && p3.plan.day === 1 && !p3.plan.forced, "換日＋已達標（≥75%）→ 前進下一課，天數歸1");

const p4 = makeEnv({ fsi_plan: JSON.stringify({ lesson: 2, day: 1, checked: yesterday, forced: false }) });
p4.planAdvanceIfNewDay();
check(p4.plan.lesson === 2 && p4.plan.day === 2, "換日＋未達標且未到上限天數 → 留在原課，天數+1");

const p5 = makeEnv({ fsi_plan: JSON.stringify({ lesson: 2, day: 2, checked: yesterday, forced: false }) });
p5.planAdvanceIfNewDay();
check(p5.plan.lesson === 3 && p5.plan.day === 1 && p5.plan.forced === true, "換日＋未達標但天數到上限 → 強制前進，標記 forced");

const p6 = makeEnv({ fsi_plan: JSON.stringify({ lesson: 3, day: 1, checked: yesterday, forced: true }) });
p6.planAdvanceIfNewDay();
check(p6.plan.forced === false, "forced 只維持一天，隔天評估後清除");

const lastIdx = p6.LESSONS.length - 1;
const p7 = makeEnv({ fsi_plan: JSON.stringify({ lesson: lastIdx, day: 2, checked: yesterday, forced: false }) });
p7.planAdvanceIfNewDay();
check(p7.plan.lesson === lastIdx, "已在最後一課 → 不再前進（不超出範圍）");

const p8 = makeEnv({ fsi_plan: JSON.stringify({ lesson: 0, day: 2, checked: today, forced: false }) });
p8.planRender();
check(p8.els.tdPlan.innerHTML.includes("⏰") && p8.els.tdPlan.innerHTML.includes("第2天"), "第2天未達標 → 顯示過關壓力提示");

// 週數計算（開始日設定，17週表背景參考）
const fmtDate = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const tenDaysAgo = fmtDate(new Date(Date.now() - 10 * DAY));
const w1 = makeEnv({ fsi_start_date: tenDaysAgo });
check(w1.tdWeekNum() === 2, "開始日往前推10天 → 第2週");
const w2 = makeEnv({});
check(w2.tdWeekNum() === null, "沒填開始日 → null");

// 規則版講評（teacherRuleComment，不需要 LLM）
const t1 = makeEnv({ fsi_plan: JSON.stringify({ lesson: 3, day: 2, checked: yesterday, forced: true }) });
check(t1.teacherRuleComment().includes("不用有罪惡感"), "plan.forced → 講評提到不用有罪惡感");

const t2 = makeEnv({});
check(t2.teacherRuleComment().includes("還沒開始"), "今天還沒練、連續天數0 → 講評提醒開始");

const t3 = makeEnv({ fsi_streak: JSON.stringify({ last: today, n: 5 }), fsi_daily: JSON.stringify({ day: today, drill: true, mp: false, rt: {} }) });
t3.setSrs(Object.fromEntries(Array.from({ length: 9 }, (_, i) => ["listen|1|" + i, { b: 0, due: Date.now() - 1 }])));
check(t3.teacherRuleComment().includes("到期"), "SRS 到期堆積 ≥8 句 → 講評提醒清複習");

const t4 = makeEnv({ fsi_streak: JSON.stringify({ last: today, n: 5 }), fsi_daily: JSON.stringify({ day: today, drill: true, mp: false, rt: {} }) });
check(t4.teacherRuleComment().includes("連續"), "連續天數高、無其他狀況 → 講評肯定連續天數");

const t5 = makeEnv({ fsi_streak: JSON.stringify({ last: today, n: 1 }), fsi_daily: JSON.stringify({ day: today, drill: true, mp: false, rt: {} }) });
check(t5.teacherRuleComment().includes("照表操課"), "都沒有特別狀況 → 預設句");

// teacherContext 基本欄位
const c1 = makeEnv({});
const ctx = c1.teacherContext();
check(ctx.includes(c1.LESSONS[0].t) && ctx.includes("到期複習"), "teacherContext 包含目前課名與到期複習數");

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
