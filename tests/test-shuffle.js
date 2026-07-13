const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

// 1. 全 script 語法檢查（僅編譯不執行）
new Function(script);
console.log("✅ 全 script 語法 OK");

// 2. 抽出 LESSONS 與 itemsRaw〜items 區塊，配 stub 實測隨機邏輯
const lEnd = script.lastIndexOf("];", script.indexOf("/* ================= 狀態"));
const lessons = script.slice(script.indexOf("const LESSONS=["), lEnd + 2);
const blk = script.slice(script.indexOf("function itemsRaw"), script.indexOf("function showText"));

const make = new Function("OPTS", lessons + `
  const $=id=>({checked:OPTS.checked});
  const state={mode:OPTS.mode,lesson:OPTS.lesson,idx:0,review:[]};
  function curLesson(){return LESSONS[state.lesson];}
  ${blk}
  return {items,itemsRaw,bump:()=>{shufSeed++;},state};
`);

const key = x => JSON.stringify(x);
let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };

// 關閉隨機：順序 = 原始
{
  const m = make({ checked: false, mode: "qa", lesson: 0 });
  check(key(m.items()) === key(m.itemsRaw()), "關閉時 qa 順序不變");
}
// qa 隨機：同一輪內穩定、內容相同、換 seed 會變
{
  const m = make({ checked: true, mode: "qa", lesson: 7 }); // 第8課 qa 4 題
  const a = m.items(), b = m.items();
  check(a === b, "qa 同一輪內重複呼叫回傳同一快取（順序固定）");
  check(key(a.slice().sort()) === key(m.itemsRaw().slice().sort()), "qa 隨機後內容集合不變");
  let changed = false;
  for (let i = 0; i < 20 && !changed; i++) { m.bump(); if (key(m.items()) !== key(a)) changed = true; }
  check(changed, "qa 換 seed 後順序會變（20 次內至少一次）");
}
// sub 隨機：每個句型的基本句仍在其 cues 之前、cues 集合不變
{
  const m = make({ checked: true, mode: "sub", lesson: 7 }); // 第8課有 2 個句型
  for (let t = 0; t < 30; t++) {
    m.bump();
    const arr = m.items();
    let curBase = null, ok = true;
    const seen = new Map();
    arr.forEach(it => {
      if (it.type === "base") { curBase = it.s; seen.set(it.s, []); }
      else { if (it.s !== curBase) ok = false; seen.get(it.s).push(it.c); }
    });
    if (!ok) { check(false, "sub 有 cue 出現在自己的基本句之前／跨句型"); break; }
    for (const [s2, cues] of seen) if (key(cues.slice().sort()) !== key(s2.cues.slice().sort())) { check(false, "sub cues 集合改變"); ok = false; }
    if (!ok) break;
    if (t === 29) check(true, "sub 隨機 30 輪：基本句永遠在前、cues 集合不變");
  }
}
// listen / build 開著隨機也不受影響
{
  const l = make({ checked: true, mode: "listen", lesson: 0 });
  const b = make({ checked: true, mode: "build", lesson: 0 });
  check(key(l.items()) === key(l.itemsRaw()), "listen 不受隨機影響");
  check(key(b.items().map(x => x.p)) === key(b.itemsRaw().map(x => x.p)), "build 不受隨機影響");
}
console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
