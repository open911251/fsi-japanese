const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

// 抽出 fbNorm〜fbSim（實際出貨的程式碼）
const blk = script.slice(script.indexOf("function fbNorm"), script.indexOf("async function fbCheck"));
const { fbNorm, fbSim } = new Function(blk + "; return {fbNorm,fbSim};")();

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

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
