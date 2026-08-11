const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

const blk = script.slice(script.indexOf("function qaResolveItem"), script.indexOf("let subCapSeed"));
const { qaResolveItem } = new Function(blk + "; return {qaResolveItem};")();

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };

// 舊格式（純陣列）：行為不變，img 為 null，accept 固定空陣列
{
  const old = ["お名前は？", "おなまえは？", "陳です。", "ちんです。", "您貴姓？→我姓陳。"];
  const r = qaResolveItem(old);
  check(r.q === "お名前は？" && r.a === "陳です。" && r.img === null, "舊格式（純陣列）正確還原，img為null");
  check(Array.isArray(r.accept) && r.accept.length === 0, "舊格式（純陣列）不支援accept，固定回傳空陣列");
}

// 無配圖但有accept[]格式（Roadmap #33）：q/qk/a/ak/cn跟舊格式一樣直接讀，img固定null，accept原樣帶出
{
  const item = { q: "これは何の本ですか。", qk: "これは なんのほんですか。", a: "日本語の本です。", ak: "にほんごのほんです。", cn: "cn", accept: [["日本語です。", "にほんごです。"]] };
  const r = qaResolveItem(item);
  check(r.q === item.q && r.a === item.a && r.img === null, "無配圖accept格式：欄位正確還原、img為null");
  check(JSON.stringify(r.accept) === JSON.stringify(item.accept), "無配圖accept格式：accept原樣帶出");
}
{
  const item = { q: "q", qk: "qk", a: "a", ak: "ak", cn: "cn" };
  const r = qaResolveItem(item);
  check(Array.isArray(r.accept) && r.accept.length === 0, "無配圖格式沒填accept → 固定回傳空陣列，不是undefined（下游fbGap/examAsk可以直接當陣列用不用額外判斷）");
}

// 新格式（配圖變體）：q/qk 來自外層，a/ak/cn/img 來自選中的 variant
{
  const item = {
    q: "この本は日本語の本ですか。", qk: "このほんは にほんごの ほんですか。",
    variants: [
      { img: "images/qa/l2_book_ja.png", a: "はい、日本語の本です。", ak: "はい、にほんごの ほんです。", cn: "是日文書。" },
      { img: "images/qa/l2_book_en.png", a: "いいえ、英語の本です。", ak: "いいえ、えいごの ほんです。", cn: "是英文書。" },
    ],
  };
  const r = qaResolveItem(item);
  check(r.q === item.q && r.qk === item.qk, "新格式：q/qk 來自外層，不隨變體變");
  check(["images/qa/l2_book_ja.png", "images/qa/l2_book_en.png"].includes(r.img), "新格式：img 來自選中的變體");
  check((r.img.endsWith("ja.png") && r.a.includes("日本語")) || (r.img.endsWith("en.png") && r.a.includes("英語")), "新格式：a 跟 img 是同一個變體配對的（不會答案跟圖對不上）");
}

// 配圖變體格式的每個variant可以選填accept[]，qaResolveItem要照選中的variant帶出對應accept
{
  const item = {
    q: "q", qk: "qk",
    variants: [
      { img: "A.png", a: "aA", ak: "akA", cn: "cnA", accept: [["altA", "altAk"]] },
      { img: "B.png", a: "aB", ak: "akB", cn: "cnB" },
    ],
  };
  let allOk = true;
  for (let i = 0; i < 50; i++) {
    const r = qaResolveItem(item);
    if (r.img === "A.png") allOk = allOk && JSON.stringify(r.accept) === JSON.stringify([["altA", "altAk"]]);
    else allOk = allOk && Array.isArray(r.accept) && r.accept.length === 0;
  }
  check(allOk, "配圖變體：50次呼叫，accept皆正確跟著選中的variant走（有填的帶出、沒填的回空陣列）");
}

// 隨機性：多次呼叫應該兩個變體都選得到，不會卡死在同一個
{
  const item = {
    q: "q", qk: "qk",
    variants: [
      { img: "A.png", a: "aA", ak: "akA", cn: "cnA" },
      { img: "B.png", a: "aB", ak: "akB", cn: "cnB" },
    ],
  };
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(qaResolveItem(item).img);
  check(seen.size === 2, "200次呼叫後兩個變體都出現過（不是永遠選同一個）");
}

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
