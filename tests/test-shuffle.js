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
  const $=id=>({checked:id==="prevChk"?!!OPTS.preview:OPTS.checked});
  const state={mode:OPTS.mode,lesson:OPTS.lesson,idx:0,review:[]};
  function curLesson(){return LESSONS[state.lesson];}
  ${blk}
  return {items,itemsRaw,bump:()=>{shufSeed++;},state,subCapMap};
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
// sub 隨機：每個句型的基本句仍在其 cues 之前、cues 集合不變（受 subCap 影響：cue 數超過上限時，
// 「不變的集合」是 subCapMap() 選出的那個上限子集，不是句型完整的 s.cues——第4-9課加厚代換詞後
// 部分句型cue數已經超過預設上限4，這條測試原本沒考慮到cap會截斷，2026-08-10改用subCapMap()當基準）
{
  const m = make({ checked: true, mode: "sub", lesson: 7 }); // 第8課有 3 個句型
  for (let t = 0; t < 30; t++) {
    m.bump();
    const arr = m.items();
    const cap = m.subCapMap();
    let curBase = null, ok = true;
    const seen = new Map();
    arr.forEach(it => {
      if (it.type === "base") { curBase = it.s; seen.set(it.s, []); }
      else { if (it.s !== curBase) ok = false; seen.get(it.s).push(it.c); }
    });
    if (!ok) { check(false, "sub 有 cue 出現在自己的基本句之前／跨句型"); break; }
    for (const [s2, cues] of seen) {
      const expected = cap.get(s2);
      if (key(cues.slice().sort()) !== key(expected.slice().sort())) { check(false, "sub cues 集合改變"); ok = false; }
    }
    if (!ok) break;
    if (t === 29) check(true, "sub 隨機 30 輪：基本句永遠在前、cues 集合不變（受subCap上限）");
  }
}
// 代換詞預習：base → 全部 prev（原順序）→ cues；關閉時無 prev
// （同樣要用 subCapMap() 算出的上限子集當基準，不能直接用 s.cues.length 切片）
{
  const off = make({ checked: false, mode: "sub", lesson: 7 });
  check(!off.items().some(x => x.type === "prev"), "預習關閉 → 無 prev 項目");
  const m = make({ checked: false, mode: "sub", lesson: 7, preview: true });
  const arr = m.items();
  const capM = m.subCapMap();
  let ok = true;
  arr.filter(x => x.type === "base").map(x => x.s).forEach(s => {
    const capped = capM.get(s);
    const bi = arr.findIndex(x => x.type === "base" && x.s === s);
    const prevs = arr.slice(bi + 1, bi + 1 + capped.length);
    if (!prevs.every((x, j) => x.type === "prev" && x.c === capped[j])) ok = false;
    const cues = arr.slice(bi + 1 + capped.length, bi + 1 + 2 * capped.length);
    if (!cues.every(x => x.type === "cue" && x.s === s)) ok = false;
  });
  check(ok, "預習開啟 → base 後接原順序 prev，再接 cues");
  const ms = make({ checked: true, mode: "sub", lesson: 7, preview: true });
  const arrS = ms.items();
  const capS = ms.subCapMap();
  let okS = true;
  arrS.filter(x => x.type === "base").map(x => x.s).forEach(s => {
    const capped = capS.get(s);
    const bi = arrS.findIndex(x => x.type === "base" && x.s === s);
    const prevs = arrS.slice(bi + 1, bi + 1 + capped.length);
    if (!prevs.every((x, j) => x.type === "prev" && x.c === capped[j])) okS = false;
    const cues = arrS.slice(bi + 1 + capped.length, bi + 1 + 2 * capped.length).map(x => x.c);
    if (key(cues.slice().sort()) !== key(capped.slice().sort())) okS = false;
  });
  check(okS, "預習＋隨機並用 → prev 維持原順序、cues 集合不變");
}

// chain:true 句型：即使「隨機順序」開啟、cue 數（8）超過預設 cap（4），cues 仍保持原始固定順序不被抽樣/打亂
// （第4課 sub[2] 是鏈式代換試點，8 個 cue 彼此接續，順序打亂或被抽樣會讓答案對不上「沿用上一句」的前提）
{
  const m = make({ checked: true, mode: "sub", lesson: 3 }); // 第4課
  const arr = m.items();
  const chainItem = arr.find(x => x.type === "base" && x.s.chain);
  check(!!chainItem, "第4課含 chain:true 句型（鏈式代換試點）");
  const chainS = chainItem.s;
  check(chainS.cues.length > 4, "鏈式句型 cue 數超過預設 cap（4），足以測試抽樣是否被正確跳過");
  const cuesInOrder = arr.filter(x => x.type === "cue" && x.s === chainS).map(x => x.c);
  check(key(cuesInOrder) === key(chainS.cues), "chain 句型：隨機順序開啟＋cue數超過cap → cues 仍完整、原始順序");
  const capM = m.subCapMap();
  check(key(capM.get(chainS)) === key(chainS.cues), "chain 句型：subCapMap() 不抽樣，回傳完整原始 cues");
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
