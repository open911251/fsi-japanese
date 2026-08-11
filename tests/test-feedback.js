const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

// 抽出 fbGap〜fbSim（實際出貨的程式碼，含fbBestSim的accept[]比對邏輯）
const blk = script.slice(script.indexOf("async function fbGap"), script.indexOf("async function fbCheck"));
const { fbNorm, fbSim, fbBestSim } = new Function(blk + "; return {fbNorm,fbSim,fbBestSim};")();

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };
const pct = (a, b) => Math.round(fbSim(a, b) * 100);

check(pct("わたしは会社員です", "わたしは会社員です。") === 100, "同句去標點 → 100%");
check(pct("私は会社員です", "わたしは会社員です。") === 100, "私/わたし 正字法歸一 → 100%");
check(pct("今、9時です", "今、九時です。") === 100, "阿拉伯數字/漢數字歸一 → 100%");
check(fbNorm("９時") === "九時", "全形數字 → 漢數字");
check(pct("ちょっと待って下さい", "ちょっと待ってください。") === 100, "下さい/ください 歸一 → 100%");
check(pct("わたしはかいしゃいんです", "わたしは かいしゃいんです。") === 100, "假名欄（含空格）比對 → 100%");
check(pct("わたしは学生です", "わたしは会社員です。") < 85, "說錯代換詞 → 不判正確 (" + pct("わたしは学生です", "わたしは会社員です。") + "%)");
check(pct("全然違う文章ですね", "わたしは会社員です。") < 60, "完全不同句 → ❌ (" + pct("全然違う文章ですね", "わたしは会社員です。") + "%)");
check(pct("バスで駅へ行きます", "バスで駅へ行きます。") === 100, "片假名句 → 100%");
check(pct("", "わたしは会社員です") === 0, "空字串 → 0%");

// fbBestSim：accept[]（Roadmap #33，替代講法）命中任一種都算對，不用硬湊單一寫死正解
{
  const best = (heard, expected, kana, accept) => Math.round(fbBestSim(heard, expected, kana, accept) * 100);
  check(best("いいえ、日本語の本じゃありません。", "いいえ、英語の本です。", "いいえ、えいごのほんです。", [["いいえ、日本語の本じゃありません。", "いいえ、にほんごのほんじゃありません。"]]) === 100, "講法跟accept[]裡的替代答案完全一致 → 100%（命中替代講法而非正解本身）");
  check(best("全然違う文章ですね", "いいえ、英語の本です。", "", [["いいえ、日本語の本じゃありません。", ""]]) < 60, "講法跟正解、accept[]都不像 → 仍判錯，accept[]不會放寬到亂講都算對");
  check(best("いいえ、英語の本です。", "いいえ、英語の本です。", "", undefined) === 100, "accept[]為undefined（舊資料沒有這個欄位）→ 沿用原本只比對expected/kana的行為，不炸");
  check(best("いいえ、英語の本です。", "いいえ、英語の本です。", "", []) === 100, "accept[]為空陣列 → 行為跟沒有accept一樣");
}

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
