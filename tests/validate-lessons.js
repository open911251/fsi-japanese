const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const start = s.indexOf("const LESSONS=[");
const end = s.indexOf("];", s.lastIndexOf("build:", s.indexOf("/* ================= 狀態")));
if (start < 0 || end < 0) { console.error("找不到 LESSONS 陣列"); process.exit(1); }
const code = s.slice(start, end + 2) + "; return LESSONS;";
const LESSONS = new Function(code)();

let errors = 0;
const bad = (li, msg) => { errors++; console.log(`第${li + 1}課: ${msg}`); };

LESSONS.forEach((L, i) => {
  if (typeof L.t !== "string" || typeof L.g !== "string") bad(i, "t/g 欄位缺失");
  if (!Array.isArray(L.listen)) bad(i, "listen 缺失");
  else L.listen.forEach((x, j) => { if (!Array.isArray(x) || x.length !== 3) bad(i, `listen[${j}] 欄位數 ${x.length}≠3`); });
  if (!Array.isArray(L.sub)) bad(i, "sub 缺失");
  else L.sub.forEach((sx, j) => {
    if (typeof sx.p !== "string") bad(i, `sub[${j}].p 缺失`);
    if (!Array.isArray(sx.base) || sx.base.length !== 3) bad(i, `sub[${j}].base 欄位數 ≠3`);
    sx.cues.forEach((c, k) => { if (!Array.isArray(c) || c.length !== 4) bad(i, `sub[${j}].cues[${k}] 欄位數 ${c.length}≠4`); });
  });
  if (!Array.isArray(L.qa)) bad(i, "qa 缺失");
  else L.qa.forEach((x, j) => { if (!Array.isArray(x) || x.length !== 5) bad(i, `qa[${j}] 欄位數 ${x.length}≠5`); });
  if (!L.build || !Array.isArray(L.build.full) || L.build.full.length !== 3) bad(i, "build.full 欄位數 ≠3");
  else if (!Array.isArray(L.build.parts) || L.build.parts.some(p => typeof p !== "string")) bad(i, "build.parts 非字串陣列");
});

const n = LESSONS.reduce((a, L) => a + L.listen.length + L.qa.length + L.sub.reduce((b, s2) => b + 1 + s2.cues.length, 0) + 1, 0);
console.log(`共 ${LESSONS.length} 課、約 ${n} 個操練項目；錯誤 ${errors} 筆${errors ? "" : "，格式全數通過 ✅"}`);
process.exit(errors ? 1 : 0);
