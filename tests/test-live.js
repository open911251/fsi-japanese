const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const script = s.match(/<script>([\s\S]*)<\/script>/)[1];

new Function(script);
console.log("✅ 全 script 語法 OK");

const blk = script.slice(script.indexOf("function pitchOfFrame"), script.indexOf("function liveDraw"));
const { pitchOfFrame } = new Function(blk + "; return {pitchOfFrame};")();

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) fails++; };

const SR = 48000, N = 2048;
const sine = (hz, amp) => Float32Array.from({ length: N }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / SR));
const near = (f, hz) => Math.abs(f - hz) / hz < 0.03;

check(near(pitchOfFrame(sine(220, 0.3), SR), 220), "220Hz 正弦 → 偵測 " + Math.round(pitchOfFrame(sine(220, 0.3), SR)) + "Hz");
check(near(pitchOfFrame(sine(100, 0.3), SR), 100), "100Hz（男聲低音域）→ " + Math.round(pitchOfFrame(sine(100, 0.3), SR)) + "Hz");
check(near(pitchOfFrame(sine(350, 0.3), SR), 350), "350Hz（女聲高音域）→ " + Math.round(pitchOfFrame(sine(350, 0.3), SR)) + "Hz");
check(pitchOfFrame(new Float32Array(N), SR) === 0, "無聲 → 0（不畫點）");
check(pitchOfFrame(sine(220, 0.003), SR) === 0, "音量過小 → 0（RMS 門檻）");
// 帶諧波的擬人聲（基頻 180Hz + 2、3 次諧波）
const voiced = Float32Array.from({ length: N }, (_, i) => 0.25 * Math.sin(2 * Math.PI * 180 * i / SR) + 0.12 * Math.sin(2 * Math.PI * 360 * i / SR) + 0.06 * Math.sin(2 * Math.PI * 540 * i / SR));
check(near(pitchOfFrame(voiced, SR), 180), "含諧波的 180Hz 複合波 → 抓到基頻 " + Math.round(pitchOfFrame(voiced, SR)) + "Hz");

console.log(fails ? `❌ ${fails} 項失敗` : "全部通過");
process.exit(fails ? 1 : 0);
