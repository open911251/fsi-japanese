const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };

// 抽出 VOICEVOX 音高分析區塊（vvMoras／accentLabel／moraScore／circ）
const blk = script.slice(script.indexOf("/* ================= VOICEVOX 音高分析"),
                          script.indexOf("/* ================= 正誤回饋"));
const { vvMoras, accentLabel, moraScore } = new Function(
  blk + "; return {vvMoras, accentLabel, moraScore};")();

// ---- accentLabel：頭高／尾高／平板／中高／超出符號表的 fallback ----
check(accentLabel(2, 1) === "頭高①", "2拍・核在1 → 頭高①");
check(accentLabel(2, 2) === "尾高②", "2拍・核在2（尾高，跟頭高①用同一拍數但不同標記）");
check(accentLabel(4, 0) === "平板⓪", "4拍・無核 → 平板⓪");
check(accentLabel(4, 2) === "中高②", "4拍・核在2（非首非尾）→ 中高②");
check(accentLabel(13, 13) === "尾高(13)", "超出圈碼表（13）時退回文字括號，不噴 undefined");

// ---- vvMoras：真實 API 回應（2026-07-18 對工作站 VOICEVOX 0.25.2 實測「箸です」）----
// 頭高①詞＋です：整句判成單一 accent phrase，核後下降在實際音高上常延後一拍（尖峰延遲），
// 這正是本功能改用「該 phrase 內有聲拍平均以上＝高」而非查表規則的原因（見程式註解）。
const hashiDesu = {
  accent_phrases: [{
    moras: [
      { text: "ハ", consonant_length: 0.0599, vowel_length: 0.0409, pitch: 5.887136459350586 },
      { text: "シ", consonant_length: 0.0844, vowel_length: 0.0461, pitch: 6.0035295486450195 },
      { text: "デ", consonant_length: 0.0371, vowel_length: 0.1077, pitch: 5.809732913970947 },
      { text: "ス", consonant_length: 0.1051, vowel_length: 0.0748, pitch: 0.0 },
    ],
    accent: 1, pause_mora: null, is_interrogative: false,
  }],
};
const hm = vvMoras(hashiDesu);
check(hm.length === 4, "箸です → 4 拍");
check(hm.map(m => m.hilo).join(",") === "L,H,L,", "箸です 逐拍高低＝L,H,L,(清音化不計)　←　實際音高，非教科書規則");
check(hm[3].voiced === false && hm[3].hilo === null, "句尾「す」清音化 → 標記無聲、不參與評分");
check(Math.abs(hm[0].t0) < 1e-9 && Math.abs(hm[hm.length - 1].t1 - 1) < 1e-9, "時間軸從 0 到 1（覆蓋全句時長）");

// ---- vvMoras：合成情境驗證多 accent phrase＋pause_mora 間隔＋跨 phrase 各自判高低 ----
const synth = {
  accent_phrases: [
    { moras: [{ text: "パ", consonant_length: 0, vowel_length: 0.1, pitch: 6 },
              { text: "ン", consonant_length: 0, vowel_length: 0.1, pitch: 6 }],
      accent: 1, pause_mora: { consonant_length: 0, vowel_length: 0.2 } },
    { moras: [{ text: "デ", consonant_length: 0, vowel_length: 0.1, pitch: 7 },
              { text: "ス", consonant_length: 0, vowel_length: 0.1, pitch: 0 }],
      accent: 0, pause_mora: null },
  ],
};
const sm = vvMoras(synth);
check(sm.length === 4, "跨 2 phrase＋停頓 → 仍展平成 4 拍");
check(sm[0].hilo === "H" && sm[1].hilo === "H", "第1 phrase 兩拍音高相同 → 都判高（>=均值即H）");
check(sm[2].hilo === "H", "第2 phrase 只有一個有聲拍 → 自成一組判高（不受第1 phrase 影響，各 phrase 獨立判）");
check(Math.abs(sm[1].t1 - 1 / 3) < 1e-6, "第1 phrase 結束於 1/3（0.2s／總 0.6s）");
check(Math.abs(sm[2].t0 - 2 / 3) < 1e-6, "第2 phrase 起點跳過停頓，落在 2/3（0.2+0.2=0.4／0.6）");
check(Math.abs(sm[3].t1 - 1) < 1e-9, "最後一拍結束於 1.0（總時長）");

// ---- moraScore：使用者曲線 vs 理論高低，含清音化拍一律視為吻合 ----
const pts = new Array(48).fill(0).map((_, i) => (i < 24 ? 2 : -2)); // 前半高、後半低
const moras = [
  { kana: "ア", voiced: true, hilo: "H", t0: 0, t1: 0.5 },
  { kana: "イ", voiced: true, hilo: "H", t0: 0.5, t1: 1 }, // 理論是高，但使用者後半是低 → 應不吻合
  { kana: "ウ", voiced: false, hilo: null, t0: 0.9, t1: 1 },
];
const scored = moraScore(pts, moras);
check(scored[0].match === true && scored[0].got === "H", "前半拍：理論高、使用者也高 → 吻合");
check(scored[1].match === false && scored[1].got === "L", "後半拍：理論高、使用者讀低 → 標記不吻合（能抓出實際錯誤）");
check(scored[2].voiced === false && scored[2].match === true, "清音化拍不參與評分，一律視為吻合（不誤判成錯）");
check(moraScore(null, moras) === null && moraScore(pts, null) === null, "缺資料時回 null（呼叫端據此靜默略過，不畫壞的圖）");

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
