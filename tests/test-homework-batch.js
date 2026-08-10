const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

const hwStart_ = script.indexOf("/* ================= 作業批改");
const hwEnd_ = script.indexOf("/* ================= 迷你角色扮演對話");
if (hwStart_ < 0 || hwEnd_ < 0) throw new Error("找不到作業批改區段的錨點註解，函式名或區段註解可能被改過");
const hwBlk = script.slice(hwStart_, hwEnd_);

// 這批不該出現在作業批改區段裡（寫成回歸測試，鎖住「SRS/localStorage 完全不碰」的設計決定）
const forbidden = [
  ["srsMark(", "作業批改不該直接呼叫 srsMark（質性回饋沒有乾淨的 1/0/-1 訊號，不該污染SRS）"],
  ["srsBuildReview(", "作業批改不該呼叫 srsBuildReview"],
  ["store.set(", "hwState 設計為純記憶體，不該寫入 localStorage（store.set）"],
];
forbidden.forEach(([needle, msg]) => {
  if (hwBlk.includes(needle)) throw new Error("違反設計決定：" + msg);
});
console.log("✅ 原始碼掃描：不含 srsMark／srsBuildReview／store.set 呼叫");

function makeEnv(opts) {
  opts = opts || {};
  const lessons = opts.lessons || [
    { t: "第1課", g: "", qa: [
      ["質問1", "しつもん1", "答え1", "こたえ1", "cn1"],
      ["質問2", "しつもん2", "答え2", "こたえ2", "cn2"],
      ["質問3", "しつもん3", "答え3", "こたえ3", "cn3"],
      { q: "配圖問", qk: "はいずもん", variants: [{ img: "a.png", a: "答えA", ak: "こたえA", cn: "cnA" }] },
    ] },
  ];
  const sttImpl = opts.sttImpl || (() => Promise.resolve("辨識文字"));
  const fetchImpl = opts.fetchImpl || (() => Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: "第1題\n很好\n\n總評\n多練習" } }] }) }));
  return new Function("LESSONS_JSON", "STT_IMPL", "FETCH_IMPL", `
    const LESSONS = LESSONS_JSON;
    const state = {lesson:0, customLesson:null};
    function curLesson(){return state.lesson===-1?state.customLesson:LESSONS[state.lesson];}
    function qaResolveItem(it){
      if(Array.isArray(it))return{q:it[0],qk:it[1],a:it[2],ak:it[3],cn:it[4],img:null};
      const v=it.variants[Math.floor(Math.random()*it.variants.length)];
      return{q:it.q,qk:it.qk,a:v.a,ak:v.ak,cn:v.cn,img:v.img};
    }
    const els={};
    const $=id=>els[id]||(els[id]={style:{},dataset:{},value:"",innerHTML:"",textContent:"",disabled:false});
    function setStatus(id,msg){$(id).textContent=msg;}
    let practiceCalls=0; function markPractice(){practiceCalls++;}
    let srsMarkCalls=0; function srsMark(){srsMarkCalls++;}
    function sttTranscribe(blob){return STT_IMPL(blob);}
    function synthCloud(t){return Promise.resolve("url:"+t);}
    function decodeUrl(u){return Promise.resolve({fake:true});}
    function actxGet(){return {decodeAudioData:()=>Promise.resolve({fake:true})};}
    function contour(pt,n){return {pts:[0,1],t0:0,dur:1};}
    function pitchTrack(x){return [];}
    function vvMorasFor(t){return Promise.resolve(null);}
    function corrOf(a,b){return 0.5;}
    function fbHints(a,b,t){return [];}
    function vvScore(t,b,m){return Promise.resolve(null);}
    function drawPitch(){}
    function renderMoraRow(){}
    function teacherEsc(x){return String(x||"");}
    const URL = {createObjectURL:()=>"blob:fake"};
    const fetch = FETCH_IMPL;
    ${hwBlk}
    return {
      hwPickItems,hwCanSubmit,hwParseGradingResponse,hwSystemPrompt,hwReady,
      hwStart,hwNext,hwSubmit,hwGradeCall,hwRenderRecordStep,hwNewBatch,
      getHwState:()=>hwState, getPracticeCalls:()=>practiceCalls, getSrsMarkCalls:()=>srsMarkCalls,
      els, state
    };
  `)(lessons, sttImpl, fetchImpl);
}

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };
const fakeBlob = { size: 100, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };

// ---- hwParseGradingResponse：純函式，格式解析 ----
{
  const env = makeEnv();
  const good = "第1題\n文法不錯，但用詞可以更自然。\n\n第2題\n這句完全正確！\n\n第3題\n語序要注意。\n\n總評\n這批常見問題是助詞使用。";
  const r = env.hwParseGradingResponse(good, 3);
  check(r.perItem[0].includes("用詞可以更自然") && r.perItem[1].includes("完全正確") && r.perItem[2].includes("語序"), "格式正常 → 逐題內容正確切分");
  check(r.summary.includes("助詞使用"), "格式正常 → 總評正確切出");
}
{
  const env = makeEnv();
  const malformed = "這是一段沒有照格式輸出的講評文字，模型自由發揮沒有用第N題標題。";
  const r = env.hwParseGradingResponse(malformed, 3);
  check(r.perItem.every(x => x === ""), "格式跑掉 → 逐題內容留空（不硬湊）");
  check(r.summary === malformed, "格式跑掉 → 整包內容退回總評顯示，不拋例外");
}
{
  const env = makeEnv();
  const partial = "第1題\n不錯。\n\n第2題\n還可以。"; // 只有2題，沒有總評段落
  const r = env.hwParseGradingResponse(partial, 2);
  check(r.perItem[0].includes("不錯") && r.perItem[1].includes("還可以"), "缺總評段落 → 逐題仍正確切分");
}

// ---- hwCanSubmit：純函式 ----
{
  const env = makeEnv();
  check(env.hwCanSubmit(null) === false, "hwCanSubmit：hwState 為 null → 不可繳交");
  check(env.hwCanSubmit({ answers: [null, null, null] }) === false, "hwCanSubmit：0題已錄 → 不可繳交");
  check(env.hwCanSubmit({ answers: [{ blob: fakeBlob }, null, null] }) === true, "hwCanSubmit：1題已錄 → 可繳交（不強制滿5題）");
  check(env.hwCanSubmit({ answers: [{ blob: fakeBlob }, { blob: fakeBlob }, { blob: fakeBlob }] }) === true, "hwCanSubmit：全部已錄 → 可繳交");
}

// ---- hwPickItems / hwStart：狀態機生命週期 ----
{
  const env = makeEnv();
  const items = env.hwPickItems(5);
  check(items.length === 4, "hwPickItems：課次只有4題qa，最多只能選到4題（不會硬湊出不存在的題目）");
  check(items.every(it => it.q && it.a), "hwPickItems：每題都解析出 q/a（含配圖 variants 格式）");
}
{
  const env = makeEnv();
  env.hwStart();
  const hw = env.getHwState();
  check(hw !== null && hw.phase === "collecting", "hwStart：建立 hwState，phase=collecting");
  check(hw.cursor === 0 && hw.answers.length === hw.items.length, "hwStart：cursor歸零、answers長度對齊題數");
  check(env.getPracticeCalls() === 1, "hwStart：立刻呼叫 markPractice（不等批改完成）");
  hw.answers[0] = { blob: fakeBlob, sttText: null, sttOk: null, pitchResult: null };
  env.hwNext();
  check(hw.cursor === 1, "hwNext：cursor 前進1");
}

async function runAsyncChecks() {
  // ---- hwSubmit：STT失敗仍照樣跑腔調分析、LLM講評正常寫回 ----
  {
    const okBlob = { size: 100, marker: "OK1", arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    const failBlob = { size: 100, marker: "FAIL", arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    const sttImpl = (blob) => blob.marker === "FAIL" ? Promise.reject(new Error("stt down")) : Promise.resolve("正常辨識");
    const env = makeEnv({ sttImpl });
    env.hwStart();
    const hw = env.getHwState();
    hw.answers[0] = { blob: okBlob, sttText: null, sttOk: null, pitchResult: null };
    hw.answers[1] = { blob: failBlob, sttText: null, sttOk: null, pitchResult: null };
    env.els.apiKey = { value: "dummy-key" }; // 有填key，hwPitchFor才不會直接短路回null
    env.els.llmUrl = { value: "http://fake-llm" };
    await env.hwSubmit();
    check(hw.answers[0].sttOk === true && hw.answers[0].sttText === "正常辨識", "STT成功題：sttOk=true、文字正確");
    check(hw.answers[1].sttOk === false && hw.answers[1].sttText === null, "STT失敗題：標記sttOk=false，不中斷整批");
    check(hw.answers[1].pitchResult !== null && typeof hw.answers[1].pitchResult.sim === "number", "STT失敗題：腔調分析仍照樣執行（不會因為STT失敗被跳過）");
    check(hw.phase === "done" && hw.result !== null, "全部處理完 → phase=done，LLM講評寫入result");
    check(env.getSrsMarkCalls() === 0, "整個批改流程：srsMark 從未被呼叫（SRS完全不碰的回歸測試）");
  }

  // ---- hwSubmit：LLM連不上時的降級 ----
  {
    const fetchImpl = () => Promise.reject(new Error("network down"));
    const env = makeEnv({ fetchImpl });
    env.hwStart();
    const hw = env.getHwState();
    hw.answers[0] = { blob: fakeBlob, sttText: null, sttOk: null, pitchResult: null };
    env.els.llmUrl = { value: "http://fake-llm" };
    await env.hwSubmit();
    check(hw.answers[0].sttOk === true, "LLM失敗：STT結果仍然正確寫入（不被LLM失敗拖累）");
    check(hw.gradeError && hw.gradeError.length > 0, "LLM失敗：gradeError有訊息，可重新送出，不整批卡死");
    check(hw.phase === "grading", "LLM失敗：phase停在grading（不是done，因為講評沒真的完成）");
  }

  // ---- hwSubmit：沒填llmUrl時的降級（只顯示STT/腔調，不嘗試呼叫LLM）----
  {
    const env = makeEnv();
    env.hwStart();
    const hw = env.getHwState();
    hw.answers[0] = { blob: fakeBlob, sttText: null, sttOk: null, pitchResult: null };
    // 不設定 els.llmUrl.value，保持空字串
    await env.hwSubmit();
    check(hw.answers[0].sttOk === true, "未設定LLM：STT仍正常執行");
    check(hw.gradeError && hw.gradeError.includes("尚未設定"), "未設定LLM：明確提示尚未設定，而不是靜默失敗或報網路錯誤");
  }

  if (fails) { console.log(fails + " 項失敗"); process.exit(1); }
  console.log("全部通過");
}
runAsyncChecks();
