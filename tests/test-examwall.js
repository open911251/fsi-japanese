const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

const qaBlk = script.slice(script.indexOf("function qaResolveItem"), script.indexOf("function showQaImage"));
const blk = qaBlk + script.slice(script.indexOf("const EXAM_INIT="), script.indexOf("function examRenderAll"));

function mkEnv(lessons) {
  const mem = {};
  const store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
  const srsCalls = [];
  const srsMark = (key, grade) => srsCalls.push({ key, grade });
  const srsKey = (mode, lesson, id) => mode + "|" + lesson + "|" + id;
  const env = new Function("LESSONS", "store", "srsMark", "srsKey", blk + `
    return {examKey,examPoolKeys,examPick,examResolve,examMasteryBump,examWeightBump,
            examMaybeUnlock,examWinBump,examLessonAchieved,examSrsKeyFor,examStatsText,examLogPush,
            examWin,examMastery,examWeight,examLog,EXAM_MINN,EXAM_THRESH,EXAM_LOGCAP,EXAM_FRESH_DAYS};
  `)(lessons, store, srsMark, srsKey);
  return { env, mem, store, srsCalls };
}

// 3 課教材，每課 2 個 sub 句型、1 個 qa（第0/1課是舊5欄陣列格式、第2課是配圖變體格式）、第0課額外 1 個 trans
const LESSONS3 = [0, 1, 2].map(i => ({
  t: "第" + (i + 1) + "課 測試",
  sub: [
    { p: "p" + i + "a", base: ["b", "bk", "bc"], cues: [["cue1", "ans1", "ansk1", "cn1"]] },
    { p: "p" + i + "b", base: ["b", "bk", "bc"], cues: [["cue2", "ans2", "ansk2", "cn2"]] },
  ],
  qa: i === 2
    ? [{ q: "q2", qk: "qk2", variants: [{ img: "img2a.png", a: "a2", ak: "ak2", cn: "cn2" }] }]
    : [["q" + i, "qk" + i, "a" + i, "ak" + i, "cn" + i]],
  trans: i === 0 ? [["t0", "tk0", "ta0", "tak0", "tcn0"]] : [],
}));

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };

// 初始窗口 + 題池組成（sub+trans一定含；qa只收配圖變體格式，舊5欄陣列格式答案是編出來的劇本事實排除，見程式碼註解）
{
  const { env } = mkEnv(LESSONS3);
  check(JSON.stringify(env.examWin.u) === "[0,1]", "無歷史紀錄 → 預設解鎖前2課");
}
{
  // 精算：第0課 sub2+trans1=3，第1課 sub2+trans0=2，共5；第0/1課qa是舊格式不算，第2課含配圖qa但還沒解鎖也不算
  const { env } = mkEnv(LESSONS3);
  const keys = env.examPoolKeys();
  check(keys.length === 5, "題池精確計數：第0課3個(2sub+1trans)+第1課2個(2sub)=5，舊格式qa不算");
  check(keys.filter(k => k.indexOf("sub|") === 0).length === 4, "sub 題共4個（2課*各2句型）");
  check(keys.filter(k => k.indexOf("qa|") === 0).length === 0, "qa 題共0個（初始窗口內的qa都是舊格式，答案無從推理）");
  check(keys.filter(k => k.indexOf("trans|") === 0).length === 1, "trans 題共1個（只有第0課有）");
}
{
  // 配圖變體格式的qa，課程一旦解鎖就應該進題池（這是本次新加的行為：解決qa可測驗性問題後把它放回題庫）
  const { env } = mkEnv(LESSONS3);
  env.examWin.u.push(2);
  const keys = env.examPoolKeys();
  check(keys.indexOf(env.examKey("qa", 2, 0)) >= 0, "配圖變體格式的qa在課程解鎖後會進題池");
}

// examPick 加權：答錯率高的 key 應更常被抽到
{
  const { env } = mkEnv(LESSONS3);
  const keys = env.examPoolKeys();
  keys.forEach(k => { env.examWeight[k] = { n: 10, ok: 10 }; });
  env.examWeight[keys[0]] = { n: 10, ok: 0 };
  let hit0 = 0;
  for (let i = 0; i < 3000; i++) if (env.examPick() === keys[0]) hit0++;
  check(hit0 / 3000 > 2 / keys.length, "全錯的題抽中率超過均勻兩倍（實測 " + (hit0 / 30).toFixed(1) + "%）");
}

// examPick 新鮮度地板：久未被抽到的已精熟項目權重應回升
{
  const { env } = mkEnv(LESSONS3);
  const keys = env.examPoolKeys();
  const old = Date.now() - (env.EXAM_FRESH_DAYS + 1) * 86400000;
  const recent = Date.now();
  keys.forEach(k => { env.examWeight[k] = { n: 10, ok: 10, last: recent }; });
  env.examWeight[keys[0]] = { n: 10, ok: 10, last: old }; // 全對但很久沒抽到
  let hit0 = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) if (env.examPick() === keys[0]) hit0++;
  const baseline = 1 / keys.length;
  check(hit0 / N > baseline * 1.15, "久未被抽到的已精熟項目權重回升，抽中率高於均勻基準（實測 " + (hit0 / N * 100).toFixed(1) + "% vs 均勻 " + (baseline * 100).toFixed(1) + "%）");
}

// examResolve：三種模式都能正確還原
{
  const { env } = mkEnv(LESSONS3);
  const rSub = env.examResolve(env.examKey("sub", 1, 0));
  check(rSub.mode === "sub" && rSub.lesson === 1 && rSub.patternIdx === 0 && rSub.s.p === "p1a" && rSub.c[0] === "cue1", "examResolve 還原 sub 正確");
  const rQa = env.examResolve(env.examKey("qa", 2, 0));
  check(rQa.mode === "qa" && rQa.lesson === 2 && rQa.q === "q2" && rQa.a === "a2" && rQa.img === "img2a.png", "examResolve 還原 qa 正確（含配圖路徑）");
  check(env.examResolve(env.examKey("qa", 0, 0)) === null, "舊5欄陣列格式的qa → examResolve 拒絕還原（保險擋一次，不該進題庫的題目就算被塞key進來也不解析）");
  const rTrans = env.examResolve(env.examKey("trans", 0, 0));
  check(rTrans.mode === "trans" && rTrans.q === "t0" && rTrans.a === "ta0", "examResolve 還原 trans 正確");
  check(env.examResolve(env.examKey("sub", 99, 0)) === null, "不存在的課 → null");
  check(env.examResolve(env.examKey("trans", 1, 0)) === null, "該課沒有 trans 資料 → null");
}

// examMasteryBump：只有 sub 題型會點亮格子，qa/trans 不影響
{
  const { env } = mkEnv(LESSONS3);
  const subKey = env.examKey("sub", 0, 0), qaKey = env.examKey("qa", 0, 0);
  env.examMasteryBump(subKey, true);
  check(env.examMastery[subKey] === 1, "sub 答對 → 格子升1級");
  env.examMasteryBump(qaKey, true);
  check(env.examMastery[qaKey] === undefined, "qa 答對 → 不產生格子（不在 examMastery 裡）");
  env.examMasteryBump(subKey, false);
  check(env.examMastery[subKey] === 1, "sub 答錯 → 不退階");
}

// examWinBump / 永久達標旗標：一旦達標，之後退步不撤銷
{
  const { env, srsCalls } = mkEnv(LESSONS3);
  for (let i = 0; i < 4; i++) env.examWinBump(0, true); // 4/4=100%，首次達標
  check(env.examLessonAchieved(0) === true, "首次達標(4/4) → 永久旗標設true");
  // 之後連續答錯很多次
  for (let i = 0; i < 10; i++) env.examWinBump(0, false);
  const ratioNow = env.examWin.p[0].ok / env.examWin.p[0].n; // 4/14 ≈ 28.6%，遠低於75%
  check(ratioNow < env.EXAM_THRESH, "終身累積比率確實已跌破門檻（驗證測試情境有效）");
  check(env.examLessonAchieved(0) === true, "但永久旗標仍是true，不因後續退步撤銷（核心修正）");
}

// examFinishAnswer 邏輯（用 examWinBump 模擬）：已達標課退步時應能算出正確的SRS key，不影響達標判定
{
  const { env } = mkEnv(LESSONS3);
  for (let i = 0; i < 4; i++) env.examWinBump(0, true);
  check(env.examLessonAchieved(0) === true, "第0課達標");
  const cur = { mode: "sub", key: env.examKey("sub", 0, 0), patternIdx: 0, cueIdx: 0 };
  const srsK = env.examSrsKeyFor(cur.key, cur);
  check(srsK === "sub|0|0-0", "examSrsKeyFor 正確換算 sub 的 SRS 鍵（patternIdx-cueIdx）");
  const qaKey = env.examKey("qa", 0, 0);
  check(env.examSrsKeyFor(qaKey, null) === "qa|0|0", "examSrsKeyFor 正確換算 qa 的 SRS 鍵");
}

// 用平均會誤判達標的情境：兩課合計達標但個別一課沒達標 → 不該解鎖（核心不變邏輯，換新API後重驗）
{
  const { env } = mkEnv(LESSONS3);
  for (let i = 0; i < 4; i++) env.examWinBump(0, true); // 第0課 4/4=100%
  env.examWinBump(1, true); env.examWinBump(1, true); env.examWinBump(1, false);
  const u = env.examWinBump(1, false); // 第1課 2/4=50%，合計6/8=75%（平均會誤判達標）
  check(u === null, "用平均會誤判達標的情境 → 各課分開判定仍正確擋下未解鎖");
  check(env.examLessonAchieved(1) === false, "第1課本身未達標");
}
{
  const { env } = mkEnv(LESSONS3);
  for (let i = 0; i < 4; i++) env.examWinBump(0, true);
  let unlocked = null;
  for (let i = 0; i < 4; i++) unlocked = env.examWinBump(1, true);
  check(unlocked === 2, "窗口內兩課都達標才解鎖第3課，回傳課號2");
  check(JSON.stringify(env.examWin.u) === "[0,1,2]", "解鎖後 u 陣列正確更新");
}
{
  const { env } = mkEnv(LESSONS3);
  env.examWinBump(0, true); env.examWinBump(0, true); // n=2 < EXAM_MINN=4
  const unlocked = env.examWinBump(1, true);
  check(unlocked === null, "樣本數不足 EXAM_MINN 時，即使正確率100%也不解鎖（防單次僥倖）");
}

// examLogPush：FIFO，上限 EXAM_LOGCAP
{
  const { env, mem } = mkEnv(LESSONS3);
  for (let i = 0; i < env.EXAM_LOGCAP + 10; i++) env.examLogPush({ t: i });
  const saved = JSON.parse(mem["fsi_examlog"]);
  check(saved.length === env.EXAM_LOGCAP, "超過上限後長度封頂在 " + env.EXAM_LOGCAP);
  check(saved[0].t === 10 && saved[saved.length - 1].t === env.EXAM_LOGCAP + 9, "FIFO：最舊的先被砍掉，保留最新的");
}

// examStatsText：基本輸出不炸、含關鍵數字
{
  const { env } = mkEnv(LESSONS3);
  const txt = env.examStatsText();
  check(txt.includes("2") && txt.includes("3"), "統計文字含已解鎖課數與總課數");
}

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
