const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

// 抽出角色扮演延伸對話區塊（Roadmap #35）：不判對錯的延伸練習，rpExtValidQuestion是唯一不依賴DOM/LLM的純函式
const blk = script.slice(script.indexOf("/* ================= 迷你角色扮演對話"), script.indexOf("/* ================= 初始化"));
const { RP_EXT_CAP, rpExtValidQuestion } = new Function(
  "$", "fbNorm", "teacherEsc", "ROLEPLAY_SCENARIOS",
  blk + "; return {RP_EXT_CAP, rpExtValidQuestion};"
)(() => ({ value: "", textContent: "", disabled: false, style: {} }), s2 => s2, s2 => s2, []);

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };

check(typeof RP_EXT_CAP === "number" && RP_EXT_CAP >= 2 && RP_EXT_CAP <= 6, "RP_EXT_CAP 是合理的短平快輪數上限（2-6輪），不會無限拖長");

// rpExtValidQuestion：防跑出情境/程度範圍（非防洩題——延伸對話沒有預設答案可洩，這個概念在這階段不成立）
check(rpExtValidQuestion("今日は何をしましたか。") === true, "正常日文短句 → 通過");
check(rpExtValidQuestion("そうですか、それはいいですね。誰と行きましたか。") === true, "含常見標點（、。）的日文句 → 通過（標點不該被誤判成非日文字元）");
check(rpExtValidQuestion("") === false, "空字串 → 不通過");
check(rpExtValidQuestion(null) === false, "null → 不通過（不拋錯）");
check(rpExtValidQuestion("Hello, how are you today?") === false, "整句英文 → 不通過（非日文字元比例過高）");
check(rpExtValidQuestion("え？") === true, "極短日文句 → 通過");
{
  const tooLong = "それはとても面白い話ですね、もっと詳しく教えてください、例えばいつ、どこで、誰と一緒に、それからどうなったのか、全部知りたいです。";
  check(tooLong.length > 60, "測試用長句本身確實超過60字（驗證fixture有效）");
  check(rpExtValidQuestion(tooLong) === false, "一次吐太長的句子 → 不通過（超過操練該有的簡短份量）");
}

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
