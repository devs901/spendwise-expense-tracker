"use strict";
/* ============================================================
   Spendwise front-end (vanilla JS, hand-written SVG charts)
   ============================================================ */
const $ = id => document.getElementById(id);
const PALETTE = ["#6366f1","#10b981","#f59e0b","#ec4899","#06b6d4","#8b5cf6","#f97316","#14b8a6","#ef4444","#84cc16"];
const FIXED = {Food:"#10b981",Travel:"#06b6d4",Shopping:"#818cf8",Bills:"#f59e0b",Entertainment:"#ec4899",Health:"#f43f5e",Education:"#a78bfa"};
const ICONS = {Food:"🍽️",Travel:"🚌",Shopping:"🛍️",Bills:"💡",Entertainment:"🎬",Health:"💊",Education:"📚"};
const DEFAULT_CATS = Object.keys(FIXED);
const GOAL_EMOJI = ["🎯","🏖️","💻","🚗","🏠","📱","🎓","💍","🎸","🛟"];
const ic = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const SVG = {
  home: ic('<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>'),
  list: ic('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  target: ic('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  goal: ic('<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>'),
  spark: ic('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'),
  edit: ic('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
  trash: ic('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  search: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  download: ic('<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>', 'width="17" height="17"'),
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 'width="18" height="18"'),
  moon: ic('<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>', 'width="18" height="18"'),
  wallet: ic('<path d="M3 7a2 2 0 012-2h13v4M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2z"/><circle cx="16.5" cy="14.5" r="1.2" fill="#fff"/>', 'width="42" height="42" style="color:#fff"')
};
const VIEWS = {
  overview:{label:"Overview", icon:"home"},
  transactions:{label:"Transactions", icon:"list"},
  budgets:{label:"Budgets", icon:"target"},
  goals:{label:"Goals", icon:"goal"},
  assistant:{label:"Assistant", icon:"spark", badge:"AI"}
};
const S = {month:null, months:[], view:"overview", d:{}, a:null, goals:[], txs:[], allTime:false, cat:"All", q:"", sort:"date_desc", limit:20,
           meta:{}, cats:[], editing:null, catTouched:false, undo:null, chat:[], busy:false, fundId:null, emoji:"🎯", insights:null};

/* ---------- helpers ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const inr = n => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const inr2 = n => { n = Number(n) || 0; return "₹" + n.toLocaleString("en-IN", {minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2}); };
const compact = n => n >= 100000 ? (n/100000).toFixed(n >= 1000000 ? 0 : 1).replace(/\.0$/, "") + "L" : n >= 1000 ? (n/1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(Math.round(n));
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const pad = n => String(n).padStart(2, "0");
const monthLabel = m => { const [y, mo] = m.split("-"); return MONTHS[+mo - 1] + " " + y; };
const monthShort = m => MONTHS[+m.split("-")[1] - 1].slice(0, 3);
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const stepMonth = (m, n) => { let [y, mo] = m.split("-").map(Number); mo += n; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return `${y}-${pad(mo)}`; };
const daysIn = m => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo, 0).getDate(); };
const colorFor = c => { if (FIXED[c]) return FIXED[c]; let h = 0; for (const ch of String(c)) h = (h*31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
const iconFor = c => ICONS[c] || "🏷️";
const tint = (hex, a = .16) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`; };
const prettyDate = d => { const [y, m, dd] = d.split("-"); return `${+dd} ${MONTHS[+m-1].slice(0,3)} ${y}`; };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function api(path, method = "GET", data = null) {
  const res = await fetch(path, {method, headers: {"Content-Type": "application/json"}, body: data ? JSON.stringify(data) : null});
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong");
  return body;
}
let toastTimer;
function toast(msg, action) {
  const t = $("toast");
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button data-act="undo">${esc(action)}</button>` : "");
  t.classList.add("show"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), action ? 6500 : 3200);
}
function tip(e, html) { const t = $("tip"); t.innerHTML = html; t.style.display = "block"; t.style.left = Math.min(e.clientX + 14, innerWidth - 200) + "px"; t.style.top = (e.clientY + 14) + "px"; }
const hideTip = () => $("tip").style.display = "none";
document.addEventListener("mouseover", e => { const el = e.target.closest("[data-tip]"); if (el) tip(e, el.dataset.tip); });
document.addEventListener("mousemove", e => { if ($("tip").style.display === "block") tip(e, $("tip").innerHTML); });
document.addEventListener("mouseout", e => { if (e.target.closest("[data-tip]")) hideTip(); });
document.addEventListener("pointermove", e => {            /* card spotlight */
  const c = e.target.closest(".card"); if (!c) return; const r = c.getBoundingClientRect();
  c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px");
});

/* animated count-up for any [data-count] element */
function animateCounts(root = document) {
  const fmt = {inr: inr, inr2: inr2, int: v => String(Math.round(v)), pct: v => Math.round(v) + "%"};
  root.querySelectorAll("[data-count]").forEach(el => {
    const to = parseFloat(el.dataset.count), f = fmt[el.dataset.fmt || "inr"];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = f(to); return; }
    const t0 = performance.now(), dur = 1000;
    const step = now => { const p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3); el.textContent = f(to * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
function confetti() {
  const cv = $("confetti"), ctx = cv.getContext("2d"); cv.width = innerWidth; cv.height = innerHeight;
  const cols = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#22d3ee"];
  const ps = Array.from({length: 150}, () => ({x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .55, vx: (Math.random() - .5) * 16, vy: -Math.random() * 17 - 5,
    s: Math.random() * 8 + 4, c: cols[Math.floor(Math.random() * cols.length)], r: Math.random() * 6, vr: (Math.random() - .5) * .4}));
  let t = 0;
  (function frame() {
    ctx.clearRect(0, 0, cv.width, cv.height); t++;
    ps.forEach(p => { p.vy += .42; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(1 - t / 130, 0); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
    if (t < 130) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

/* ---------- theme ---------- */
function applyTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem("theme", t); $("themeBtn").innerHTML = t === "dark" ? SVG.sun : SVG.moon; }
applyTheme(localStorage.getItem("theme") || "dark");

/* ---------- charts (hand-written SVG) ---------- */
function ring(pct, color, size = 150, stroke = 14, grad = false) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(pct, 100)), id = "rg" + Math.random().toString(36).slice(2, 7);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);filter:drop-shadow(0 0 10px ${tint(color, .5)})">
    ${grad ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>` : ""}
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${grad ? `url(#${id})` : color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}">
    <animate attributeName="stroke-dashoffset" from="${c}" to="${c * (1 - p/100)}" dur="1s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/></circle></svg>`;
}
function gauge(score) {
  const col = score >= 85 ? "#10b981" : score >= 70 ? "#22d3ee" : score >= 50 ? "#f59e0b" : "#f43f5e", len = Math.PI * 90;
  return {col, svg: `<svg viewBox="0 0 220 124" style="filter:drop-shadow(0 0 12px ${col}55)"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="${col}" stop-opacity=".5"/><stop offset="1" stop-color="${col}"/></linearGradient></defs>
    <path d="M20 112 A90 90 0 0 1 200 112" fill="none" stroke="var(--track)" stroke-width="16" stroke-linecap="round"/>
    <path d="M20 112 A90 90 0 0 1 200 112" fill="none" stroke="url(#gg)" stroke-width="16" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len}">
    <animate attributeName="stroke-dashoffset" from="${len}" to="${len * (1 - score / 100)}" dur="1.3s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/></path></svg>`};
}
function donut(cats, total) {
  const r = 72, c = 2 * Math.PI * r, gap = cats.length > 1 ? 3 : 0; let off = 0;
  const segs = cats.map(k => {
    const len = Math.max(k.total / total * c - gap, 0.5);
    const s = `<circle class="seg" cx="100" cy="100" r="${r}" fill="none" stroke="${colorFor(k.category)}" stroke-width="22" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)" data-tip="<b>${esc(k.category)}</b><br>${inr(k.total)} · ${k.percent}%"/>`;
    off += k.total / total * c; return s;
  }).join("");
  return `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--track)" stroke-width="22"/>${segs}
    <text x="100" y="94" text-anchor="middle" style="font-size:11px">Total spent</text><text x="100" y="117" text-anchor="middle" style="font-size:21px;font-weight:800;fill:var(--text)">${inr(total)}</text></svg>`;
}
function smooth(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i-1] || pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2] || p2, t = 0.18;
    d += ` C${p1[0] + (p2[0]-p0[0])*t},${p1[1] + (p2[1]-p0[1])*t} ${p2[0] - (p3[0]-p1[0])*t},${p2[1] - (p3[1]-p1[1])*t} ${p2[0]},${p2[1]}`;
  }
  return d;
}
function areaChart(daily, month) {
  const W = 640, H = 250, L = 44, R = 12, T = 14, B = 28, n = daysIn(month);
  const map = Object.fromEntries(daily.map(x => [+x.day.slice(8), x.total]));
  const vals = Array.from({length: n}, (_, i) => map[i+1] || 0);
  const max = Math.max(...vals, 1), nice = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / nice * 1.1) * nice;
  const x = i => L + (W - L - R) * (i / (n - 1)), y = v => T + (H - T - B) * (1 - v / top);
  const pts = vals.map((v, i) => [x(i), y(v)]), line = smooth(pts), area = line + ` L${x(n-1)},${H-B} L${x(0)},${H-B} Z`;
  let grid = ""; for (let k = 0; k <= 4; k++) { const v = top * k / 4, yy = y(v); grid += `<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-dasharray="${k ? 4 : 0}"/><text x="${L-8}" y="${yy+3}" text-anchor="end">${compact(v)}</text>`; }
  let xl = ""; [1, 5, 10, 15, 20, 25, n].forEach(d => xl += `<text x="${x(d-1)}" y="${H-8}" text-anchor="middle">${d}</text>`);
  const pk = vals.indexOf(max), step = (W - L - R) / (n - 1);
  const hits = vals.map((v, i) => `<rect x="${x(i) - step/2}" y="${T}" width="${step}" height="${H-T-B}" fill="transparent" data-tip="<b>${i+1} ${monthShort(month)}</b><br>${v ? inr(v) : "No spending"}"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".45"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient>
    <linearGradient id="al" x1="0" x2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>
    ${grid}${xl}<path d="${area}" fill="url(#ag)"/><path d="${line}" fill="none" stroke="url(#al)" stroke-width="3" stroke-linecap="round"/>
    ${max > 1 ? `<circle cx="${x(pk)}" cy="${y(max)}" r="5.5" fill="var(--card-solid)" stroke="#ec4899" stroke-width="3"/>` : ""}${hits}</svg>`;
}
function barChart(months, selected) {
  const W = 420, H = 230, B = 30, T = 26, max = Math.max(...months.map(m => m.total), 1);
  const list = months.slice(-6), bw = Math.min(46, (W - 20) / list.length - 14), gap = (W - bw * list.length) / (list.length + 1);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ec4899"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>` +
    list.map((m, i) => {
      const h = Math.max((H - B - T) * m.total / max, 4), x = gap + i * (bw + gap), y = H - B - h, sel = m.month === selected;
      return `<g class="bar" data-month="${m.month}" data-tip="<b>${monthLabel(m.month)}</b><br>${inr(m.total)}${m.change_pct != null ? `<br>${m.change_pct > 0 ? "▲" : "▼"} ${Math.abs(m.change_pct)}% vs prev` : ""}">
        <rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="10" fill="${sel ? "url(#bg)" : "var(--track)"}"><animate attributeName="height" from="0" to="${h}" dur=".7s" fill="freeze"/><animate attributeName="y" from="${H-B}" to="${y}" dur=".7s" fill="freeze"/></rect>
        <text x="${x+bw/2}" y="${y-8}" text-anchor="middle" style="font-weight:700;fill:${sel ? "var(--text)" : "var(--faint)"}">${compact(m.total)}</text>
        <text x="${x+bw/2}" y="${H-10}" text-anchor="middle" style="font-weight:${sel ? 700 : 500}">${monthShort(m.month)}</text></g>`;
    }).join("") + `</svg>`;
}
function weekdayChart(w) {
  const W = 420, H = 210, B = 28, T = 26, max = Math.max(...w.map(x => x.total), 1), bw = 36, gap = (W - bw * 7) / 8, hi = w.findIndex(x => x.total === max);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ec4899"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>` + w.map((d, i) => {
    const h = Math.max((H - B - T) * d.total / max, 4), x = gap + i * (bw + gap), y = H - B - h, on = i === hi && max > 0;
    return `<g data-tip="<b>${d.day}</b><br>${inr(d.total)} · ${d.count} transaction${d.count === 1 ? "" : "s"}"><rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="10" fill="${on ? "url(#wg)" : "var(--track)"}"><animate attributeName="height" from="0" to="${h}" dur=".7s" fill="freeze"/><animate attributeName="y" from="${H-B}" to="${y}" dur=".7s" fill="freeze"/></rect>
      <text x="${x+bw/2}" y="${y-8}" text-anchor="middle" style="font-weight:700;fill:${on ? "var(--text)" : "var(--faint)"}">${d.total ? compact(d.total) : ""}</text><text x="${x+bw/2}" y="${H-9}" text-anchor="middle" style="font-weight:${on ? 700 : 500}">${d.day}</text></g>`;
  }).join("") + `</svg>`;
}
function heatmap(daily, month) {
  const n = daysIn(month), [y, m] = month.split("-").map(Number), first = (new Date(y, m - 1, 1).getDay() + 6) % 7, today = todayStr();
  const map = Object.fromEntries(daily.map(x => [+x.day.slice(8), x.total])), max = Math.max(...Object.values(map), 1);
  let h = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => `<div class="dow">${d}</div>`).join("");
  h += '<div class="cell-d blank"></div>'.repeat(first);
  for (let d = 1; d <= n; d++) {
    const t = map[d] || 0, lv = t ? Math.min(4, Math.ceil(t / max * 4)) : 0, iso = `${month}-${pad(d)}`;
    h += `<div class="cell-d l${lv} ${iso > today ? "future" : ""} ${iso === today ? "today" : ""}" data-tip="<b>${d} ${monthShort(month)}</b><br>${t ? inr(t) : "No spending"}">${d}</div>`;
  }
  return `<div class="cal">${h}</div><div class="legend-scale">Less ${[0,1,2,3,4].map(l => `<i class="cell-d l${l}" style="width:14px;height:14px;border-radius:5px"></i>`).join("")} More</div>`;
}
function sparkline(daily, month, elapsed) {
  const n = daysIn(month), map = Object.fromEntries(daily.map(x => [+x.day.slice(8), x.total]));
  let run = 0; const cum = Array.from({length: elapsed}, (_, i) => (run += map[i+1] || 0));
  if (cum.length < 2) return "";
  const W = 400, H = 150, max = Math.max(...cum, 1), pts = cum.map((v, i) => [W * i / (n - 1), H - 12 - (H - 34) * v / max]);
  const line = smooth(pts), last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${last[0]},${H} L0,${H} Z" fill="url(#sg)"/><path d="${line}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ---------- derived numbers ---------- */
function stats() {
  const d = S.d, m = S.month, total = d.summary.total, cats = d.summary.categories;
  const isCur = m === todayStr().slice(0, 7), n = daysIn(m);
  const elapsed = isCur ? new Date().getDate() : (m > todayStr().slice(0, 7) ? 0 : n);
  const idx = d.monthly.findIndex(x => x.month === m), cur = d.monthly[idx];
  const budgetTotal = d.budgets.reduce((a, b) => a + b.budget, 0), budgetSpent = d.budgets.reduce((a, b) => a + b.spent, 0);
  const biggest = d.expenses.reduce((a, b) => (!a || b.amount > a.amount) ? b : a, null);
  return {total, cats, isCur, n, elapsed, change: cur ? cur.change_pct : null, prev: idx > 0 ? d.monthly[idx-1] : null, avg: elapsed ? total / elapsed : 0,
          proj: isCur && elapsed >= 5 ? total / elapsed * n : null, budgetTotal, budgetSpent, budgetPct: budgetTotal ? budgetSpent / budgetTotal * 100 : 0,
          over: d.budgets.filter(b => b.over_budget).length, biggest, count: d.expenses.length};
}

/* ---------- views ---------- */
function emptyState() {
  return `<div class="card empty"><div class="art">${SVG.wallet}</div><h3>Start tracking your money</h3>
    <p>Type an expense in the bar above, add one manually, or load a few months of realistic sample data to explore the dashboard, health score, goals and AI assistant.</p>
    <div class="btns"><button class="btn" data-act="demo">✨ Load sample data</button><button class="btn ghost" data-act="add">Add an expense</button></div></div>`;
}
function quickAdd() {
  return `<div class="qa"><div class="qa-in"><div class="qa-row"><div class="qa-ic">⚡</div>
    <input id="qa" placeholder="Type an expense: 450 uber to office yesterday" autocomplete="off" spellcheck="false">
    <button class="btn" data-act="qaSubmit">Add <kbd>↵</kbd></button></div>
    <div class="qa-prev" id="qaPrev"><span>Try</span>${["450 uber to office yesterday","1.2k groceries on 12th","199 netflix","250 lunch with team"].map(x => `<button class="pill" data-act="qaEx" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div></div></div>`;
}
function txRow(e) {
  const c = colorFor(e.category);
  return `<div class="row-item"><div class="cat-ic" style="background:${tint(c)}">${iconFor(e.category)}</div>
    <div class="t"><b>${esc(e.description || e.category)}</b><span>${esc(e.category)} · ${prettyDate(e.expense_date)}</span></div><div class="amt">${inr2(e.amount)}</div></div>`;
}
function kpi(icon, label, value, sub, color) {
  return `<div class="card kpi"><div class="ic" style="background:${tint(color)}">${icon}</div><div><div class="lbl">${label}</div><div class="val">${value}</div><div class="sub">${sub}</div></div></div>`;
}
function healthCard() {
  const h = S.a && S.a.health; if (!h) return "";
  const g = gauge(h.score);
  return `<div class="card"><h2>Financial health <small>explainable score</small></h2><div class="gauge"><div class="g">${g.svg}<div class="gv"><b data-count="${h.score}" data-fmt="int">${h.score}</b><span style="color:${g.col}">${esc(h.label)}</span></div></div>
    <div class="factors">${h.factors.map(f => `<div class="factor"><div class="fh"><span>${esc(f.name)}</span><b>${f.points}/${f.max}</b></div><div class="ft"><i style="width:${f.points / f.max * 100}%"></i></div><small>${esc(f.note)}</small></div>`).join("")}</div></div></div>`;
}
function subscriptionsCard() {
  const r = S.a && S.a.recurring; if (!r) return "";
  const items = r.items.slice(0, 5);
  return `<div class="card"><h2>Subscriptions <small>${items.length ? `≈ ${inr(r.monthly_total * 12)} / year` : "auto-detected"}</small></h2>` + (items.length ? items.map(i => {
    const c = colorFor(i.category);
    return `<div class="row-item"><div class="cat-ic" style="background:${tint(c)}">${iconFor(i.category)}</div><div class="t"><b>${esc(i.description)}</b><span>Next ≈ ${prettyDate(i.next_expected)}</span></div><div class="amt">${inr(i.amount)}</div></div>`;
  }).join("") + `<p class="note">Found <b>${r.items.length}</b> repeating payments totalling <b>${inr(r.monthly_total)}</b> a month.</p>` : `<div class="mini-empty">No repeating payments found yet. They show up once the same expense appears in 2+ months.</div>`) + `</div>`;
}
function budgetMini() {
  const s = stats(), b = S.d.budgets;
  if (!b.length) return `<div class="card"><h2>Budgets</h2><div class="mini-empty">No budgets for ${monthLabel(S.month)}.<br><br><a class="btn sm" href="#/budgets" style="text-decoration:none">Set a budget</a></div></div>`;
  const rc = s.budgetPct > 100 ? "#f43f5e" : s.budgetPct > 80 ? "#f59e0b" : "#10b981";
  return `<div class="card"><h2>Budgets <a href="#/budgets" style="font-size:12.5px;color:var(--brand2);text-decoration:none;font-weight:650">Manage →</a></h2>
    <div style="display:flex;gap:18px;align-items:center;margin-bottom:14px"><div style="position:relative;width:104px;height:104px;flex:none">${ring(s.budgetPct, rc, 104, 11)}<div style="position:absolute;inset:0;display:grid;place-content:center;text-align:center"><b style="font-size:22px;letter-spacing:-.8px">${Math.round(s.budgetPct)}%</b></div></div>
    <div style="font-size:13px;color:var(--muted);line-height:1.6"><b style="color:var(--text);font-size:15px">${inr(s.budgetSpent)}</b> of ${inr(s.budgetTotal)}<br>${s.over ? `<span style="color:var(--bad);font-weight:650">${s.over} over budget</span>` : `<span style="color:var(--good);font-weight:650">All on track</span>`}</div></div>
    ${b.slice(0, 4).map(x => { const p = x.spent / x.budget * 100, c = p > 100 ? "var(--bad)" : p >= 80 ? "var(--warn)" : colorFor(x.category);
      return `<div style="margin-top:11px"><div class="bnums" style="margin-bottom:5px"><span style="font-weight:600;color:var(--text)">${iconFor(x.category)} ${esc(x.category)}</span><span>${inr(x.spent)} / ${inr(x.budget)}</span></div><div class="bar-track" style="height:7px"><div class="bar-fill" style="width:${Math.min(p, 100)}%;background:${c}"></div></div></div>`; }).join("")}</div>`;
}
function overview() {
  if (!S.meta.has_data) return quickAdd() + emptyState();
  const s = stats(), d = S.d;
  if (!s.count) return quickAdd() + `<div class="card mini-empty">No expenses in ${monthLabel(S.month)} yet. Pick another month or add one above.</div>`;
  const delta = s.change == null ? "" : `<span class="chip-pill">${s.change > 0 ? "▲" : "▼"} ${Math.abs(s.change)}% vs ${monthShort(s.prev.month)}</span>`;
  const proj = s.proj ? `<span class="chip-pill">📈 Projected ${inr(s.proj)}</span>` : "";
  const top = s.cats[0], wd = S.a ? S.a.weekdays : [], wmax = wd.length ? wd.reduce((a, b) => b.total > a.total ? b : a) : null;
  const FULL = {Mon:"Mondays",Tue:"Tuesdays",Wed:"Wednesdays",Thu:"Thursdays",Fri:"Fridays",Sat:"Saturdays",Sun:"Sundays"};
  return `${quickAdd()}
  <div class="grid g-hero">
    <div class="card hero"><div class="left"><div class="lbl">Total spent · ${monthLabel(S.month)}</div><div class="big" data-count="${s.total}" data-fmt="inr">${inr(s.total)}</div>
      <div class="meta">${delta}${proj}<span class="chip-pill">${s.count} transactions</span></div></div>${sparkline(d.daily, S.month, s.elapsed)}</div>
    ${healthCard()}
  </div>
  <div class="grid g-4">
    ${kpi("🧾", "Transactions", `<span data-count="${s.count}" data-fmt="int">${s.count}</span>`, "this month", "#818cf8")}
    ${kpi("📆", "Daily average", `<span data-count="${s.avg}" data-fmt="inr">${inr(s.avg)}</span>`, `over ${s.elapsed} day${s.elapsed === 1 ? "" : "s"}`, "#22d3ee")}
    ${kpi(iconFor(top.category), "Top category", esc(top.category), `${inr(top.total)} · ${top.percent}%`, colorFor(top.category))}
    ${kpi("🔥", "Biggest expense", `<span data-count="${s.biggest.amount}" data-fmt="inr">${inr(s.biggest.amount)}</span>`, esc(s.biggest.description || s.biggest.category), "#f43f5e")}
  </div>
  <div class="card ai-card"><h2><span>✨ Smart insights</span><span class="badge plain" id="aiBadge">Analysing…</span></h2><div id="insightsBox"><div class="skel" style="width:90%"></div><div class="skel" style="width:70%"></div></div></div>
  <div class="grid g-2">
    <div class="card"><h2>Spending by category <small>${monthLabel(S.month)}</small></h2>
      <div class="donut-wrap">${donut(s.cats, s.total)}<div class="legend">${s.cats.map(k => `<div class="lg"><span class="dot" style="background:${colorFor(k.category)}"></span><span class="nm">${esc(k.category)}</span><b>${inr(k.total)}</b><span class="pc">${k.percent}%</span></div>`).join("")}</div></div></div>
    <div class="card"><h2>Daily spending <small>${s.count} transactions</small></h2>${areaChart(d.daily, S.month)}</div>
  </div>
  <div class="grid g-eq">
    <div class="card"><h2>Spending calendar <small>darker = more spent</small></h2>${heatmap(d.daily, S.month)}</div>
    <div class="card"><h2>Weekday pattern <small>${monthLabel(S.month)}</small></h2>${wd.length ? weekdayChart(wd) : ""}${wmax && wmax.total ? `<p class="note">You spend the most on <b>${FULL[wmax.day]}</b> (${inr(wmax.total)} across ${wmax.count} transaction${wmax.count === 1 ? "" : "s"}).</p>` : ""}</div>
  </div>
  <div class="grid g-3">
    ${budgetMini()}
    <div class="card"><h2>Monthly trend <small>click a bar</small></h2>${barChart(d.monthly, S.month)}</div>
    ${subscriptionsCard()}
  </div>
  <div class="card"><h2>Recent transactions <a href="#/transactions" style="font-size:12.5px;color:var(--brand2);text-decoration:none;font-weight:650">View all →</a></h2>${d.expenses.slice(0, 6).map(txRow).join("")}</div>`;
}

function filteredTx() {
  let rows = S.txs.slice();
  if (S.cat !== "All") rows = rows.filter(r => r.category === S.cat);
  if (S.q) { const q = S.q.toLowerCase(); rows = rows.filter(r => (r.description + " " + r.category).toLowerCase().includes(q)); }
  const by = {date_desc:(a,b)=>b.expense_date.localeCompare(a.expense_date)||b.id-a.id, date_asc:(a,b)=>a.expense_date.localeCompare(b.expense_date)||a.id-b.id, amt_desc:(a,b)=>b.amount-a.amount, amt_asc:(a,b)=>a.amount-b.amount};
  return rows.sort(by[S.sort]);
}
function transactions() {
  if (!S.meta.has_data) return emptyState();
  const cats = ["All", ...new Set(S.txs.map(r => r.category))].sort((a, b) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b));
  return `<div class="card"><div class="toolbar">
      <div class="search">${SVG.search}<input id="q" placeholder="Search description or category…" value="${esc(S.q)}"></div>
      <select class="sel" id="sort"><option value="date_desc">Newest first</option><option value="date_asc">Oldest first</option><option value="amt_desc">Highest amount</option><option value="amt_asc">Lowest amount</option></select>
      <div class="pills"><button class="pill ${S.allTime ? "" : "on"}" data-act="scope" data-v="month">${monthLabel(S.month)}</button><button class="pill ${S.allTime ? "on" : ""}" data-act="scope" data-v="all">All time</button></div>
      <button class="btn ghost sm" data-act="export" style="margin-left:auto">${SVG.download} Export CSV</button></div>
    <div class="pills" style="margin-bottom:14px">${cats.map(c => `<button class="pill ${S.cat === c ? "on" : ""}" data-act="cat" data-v="${esc(c)}">${c === "All" ? "All categories" : iconFor(c) + " " + esc(c)}</button>`).join("")}</div>
    <div id="txTable"></div></div>`;
}
function txTable() {
  const rows = filteredTx(), shown = rows.slice(0, S.limit), sum = rows.reduce((a, r) => a + r.amount, 0);
  if (!rows.length) return `<div class="mini-empty">No transactions match your filters.</div>`;
  return `<div class="scroll"><table><thead><tr><th>Description</th><th class="hide-m">Category</th><th class="hide-m">Date</th><th class="r">Amount</th><th></th></tr></thead><tbody>` +
    shown.map(e => { const c = colorFor(e.category); return `<tr>
      <td><div class="cell"><div class="cat-ic" style="background:${tint(c)}">${iconFor(e.category)}</div><b style="font-weight:600">${esc(e.description || "—")}</b></div></td>
      <td class="hide-m"><span class="cat-tag" style="background:${tint(c)};color:${c}">${esc(e.category)}</span></td>
      <td class="hide-m" style="color:var(--muted)">${prettyDate(e.expense_date)}</td><td class="r amt">${inr2(e.amount)}</td>
      <td><div class="acts"><button class="ib" data-act="edit" data-id="${e.id}" aria-label="Edit" title="Edit">${SVG.edit}</button><button class="ib del" data-act="del" data-id="${e.id}" aria-label="Delete" title="Delete">${SVG.trash}</button></div></td></tr>`; }).join("") +
    `</tbody></table></div><div class="foot"><span>Showing ${shown.length} of ${rows.length} · Total <b style="color:var(--text)">${inr2(sum)}</b></span>${rows.length > shown.length ? `<button class="btn ghost sm" data-act="more">Show more</button>` : ""}</div>`;
}

function budgets() {
  if (!S.meta.has_data) return emptyState();
  const b = S.d.budgets, withBudget = new Set(b.map(x => x.category)), unbudgeted = S.d.summary.categories.filter(c => !withBudget.has(c.category));
  const allCats = [...new Set([...DEFAULT_CATS, ...S.cats])].sort();
  const card = x => {
    const pct = x.budget ? x.spent / x.budget * 100 : 0, c = colorFor(x.category);
    const st = pct > 100 ? ["over", "Over budget"] : pct >= 80 ? ["near", "Almost used"] : ["ok", "On track"], fill = pct > 100 ? "var(--bad)" : pct >= 80 ? "var(--warn)" : c;
    return `<div class="card bcard"><div class="bhead"><div class="cat-ic" style="background:${tint(c)}">${iconFor(x.category)}</div><div><b>${esc(x.category)}</b><span>${Math.round(pct)}% used</span></div><span class="st ${st[0]}">${st[1]}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(pct, 100)}%;background:${fill}"></div></div>
      <div class="bnums"><span><b>${inr(x.spent)}</b> spent</span><span>${x.remaining >= 0 ? `<b>${inr(x.remaining)}</b> left` : `<b style="color:var(--bad)">${inr(-x.remaining)}</b> over`} of ${inr(x.budget)}</span></div>
      <button class="btn ghost sm" data-act="editBudget" data-cat="${esc(x.category)}" data-limit="${x.budget}" style="align-self:flex-start">Edit limit</button></div>`;
  };
  return `<div class="card"><h2>Set a budget <small>${monthLabel(S.month)}</small></h2><div class="formrow">
      <div><label for="bCat">Category</label><input id="bCat" list="catList2" placeholder="e.g. Food"><datalist id="catList2">${allCats.map(c => `<option value="${esc(c)}">`).join("")}</datalist></div>
      <div><label for="bLim">Monthly limit (₹)</label><input id="bLim" type="number" min="1" placeholder="5000"></div>
      <button class="btn" data-act="saveBudget" style="height:44px">Save budget</button></div><div class="err" id="bErr" style="margin-top:8px"></div></div>
    ${b.length ? `<div class="b-grid">${b.map(card).join("")}</div>` : `<div class="card mini-empty">No budgets for ${monthLabel(S.month)} yet. Set one above to start tracking.</div>`}
    ${unbudgeted.length ? `<div class="card"><h2>Spending without a budget <small>${unbudgeted.length} categor${unbudgeted.length > 1 ? "ies" : "y"}</small></h2>${unbudgeted.map(c => `<div class="row-item"><div class="cat-ic" style="background:${tint(colorFor(c.category))}">${iconFor(c.category)}</div><div class="t"><b>${esc(c.category)}</b><span>${c.count} transaction${c.count > 1 ? "s" : ""}</span></div><div class="amt">${inr(c.total)}</div><button class="btn ghost sm" data-act="editBudget" data-cat="${esc(c.category)}" data-limit="">Set budget</button></div>`).join("")}</div>` : ""}`;
}

function goalEta(g) {
  if (g.completed) return "Goal reached 🎉";
  if (!g.deadline) return "No deadline";
  const days = Math.ceil((new Date(g.deadline) - new Date(todayStr())) / 864e5);
  if (days < 0) return `Deadline passed ${-days}d ago`;
  const need = (g.target_amount - g.saved_amount) / Math.max(days / 30, 1);
  return `${days} days left · save ${inr(need)}/mo`;
}
function goals() {
  const list = S.goals, saved = list.reduce((a, g) => a + g.saved_amount, 0), target = list.reduce((a, g) => a + g.target_amount, 0);
  const head = `<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap"><div><h2 style="margin:0 0 6px">Savings goals</h2><span style="color:var(--muted);font-size:14px">${list.length ? `<b style="color:var(--text)">${inr(saved)}</b> saved of ${inr(target)} across ${list.length} goal${list.length > 1 ? "s" : ""}` : "Turn a wish into a plan. Create your first goal."}</span></div><button class="btn" data-act="newGoal">+ New goal</button></div>`;
  if (!list.length) return head + `<div class="card empty"><div class="art" style="font-size:40px">🎯</div><h3>No goals yet</h3><p>Set a target, add money as you save, and watch the ring fill up. You even get confetti when you get there.</p><div class="btns"><button class="btn" data-act="newGoal">Create a goal</button></div></div>`;
  return head + `<div class="b-grid">${list.map(g => {
    const col = g.completed ? "#10b981" : "#8b5cf6";
    return `<div class="card goal ${g.completed ? "done" : ""}"><div class="gr">${ring(g.percent, col, 132, 12, !g.completed)}<div>${esc(g.emoji)}</div></div>
      <h3>${esc(g.name)}</h3><div class="gn"><b>${inr(g.saved_amount)}</b> of ${inr(g.target_amount)} · <b>${Math.round(g.percent)}%</b></div><span class="eta">${esc(goalEta(g))}</span>
      <div class="quick">${g.completed ? "" : [500, 1000, 5000].map(v => `<button class="btn ghost sm" data-act="fund" data-id="${g.id}" data-v="${v}">+${inr(v)}</button>`).join("")}
      <button class="btn ghost sm" data-act="fundCustom" data-id="${g.id}">Custom</button><button class="ib del" data-act="delGoal" data-id="${g.id}" aria-label="Delete goal" title="Delete">${SVG.trash}</button></div></div>`; }).join("")}</div>`;
}

const SUGGESTIONS = ["How much did I spend on food last month?", "What is my biggest expense?", "Am I over budget?", "Compare with last month", "Show my subscriptions", "How can I save more?"];
function assistant() {
  const msgs = S.chat.length ? S.chat.map(m => `<div class="msg ${m.role === "user" ? "u" : "a"}">${m.typing ? '<span class="typing"><i></i><i></i><i></i></span>' : esc(m.text)}${m.source === "ai" ? "<small>✨ AI</small>" : ""}</div>`).join("") :
    `<div class="welcome"><div class="orb">✨</div><h3>Ask Spendwise anything</h3><p>I answer questions about your own data: totals, categories, budgets, trends and subscriptions. No setup needed.</p></div>`;
  return `<div class="card chat"><div class="msgs" id="msgs">${msgs}</div>
    <div class="suggest-row">${SUGGESTIONS.map(s => `<button class="pill" data-act="askEx" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <div class="chat-in"><input id="chatIn" placeholder="Ask about your spending…" autocomplete="off"><button class="btn" data-act="send">Send</button></div></div>`;
}
async function sendChat(q) {
  q = (q || "").trim(); if (!q || S.busy) return;
  S.busy = true; S.chat.push({role: "user", text: q}, {role: "assistant", typing: true}); paintChat();
  try {
    const r = await api("/api/ask", "POST", {question: q, month: S.month}); await new Promise(r => setTimeout(r, 450));
    S.chat.pop(); const m = {role: "assistant", text: "", source: r.source}; S.chat.push(m);
    const words = r.answer.split(" ");
    for (let i = 1; i <= words.length; i++) { m.text = words.slice(0, i).join(" "); paintChat(); await new Promise(r => setTimeout(r, 22)); }
  } catch (e) { S.chat.pop(); S.chat.push({role: "assistant", text: "Sorry, something went wrong: " + e.message}); paintChat(); }
  S.busy = false;
}
function paintChat() {
  const box = $("msgs"); if (!box) return;
  box.innerHTML = S.chat.map(m => `<div class="msg ${m.role === "user" ? "u" : "a"}">${m.typing ? '<span class="typing"><i></i><i></i><i></i></span>' : esc(m.text)}${m.source === "ai" && !m.typing ? "<small>✨ AI</small>" : ""}</div>`).join("");
  box.scrollTop = box.scrollHeight; const inp = $("chatIn"); if (inp && document.activeElement !== inp) inp.focus();
}

/* ---------- render & data ---------- */
let placeholderTimer;
function render() {
  const v = S.view, label = S.month ? monthLabel(S.month) : "…";
  const meta = {overview:["Overview", `A clear picture of your spending in ${label}`], transactions:["Transactions", "Search, filter, edit and export every expense"],
    budgets:["Budgets", "Set monthly limits and stay in control"], goals:["Goals", "Save for what matters, one milestone at a time"], assistant:["Assistant", "Ask questions about your money in plain English"]}[v];
  $("pageTitle").textContent = meta[0]; $("pageSub").textContent = meta[1];
  const nav = Object.entries(VIEWS).map(([k, x]) => `<a href="#/${k}" class="${k === v ? "active" : ""}">${SVG[x.icon]}${x.label}${x.badge ? `<span class="new">${x.badge}</span>` : ""}</a>`).join("");
  document.querySelector(".monthbox").style.display = v === "goals" ? "none" : "";
  $("nav").innerHTML = nav; $("bottomNav").innerHTML = Object.entries(VIEWS).map(([k, x]) => `<a href="#/${k}" class="${k === v ? "active" : ""}">${SVG[x.icon]}${x.label}</a>`).join("");
  $("view").innerHTML = {overview, transactions, budgets, goals, assistant}[v]();
  if (v === "transactions" && $("sort")) { $("sort").value = S.sort; $("txTable").innerHTML = txTable(); }
  if (v === "overview" && S.insights) paintInsights();
  if (v === "assistant") { const b = $("msgs"); if (b) b.scrollTop = b.scrollHeight; }
  clearInterval(placeholderTimer);
  const qa = $("qa"); if (qa) { const ex = ["450 uber to office yesterday","1.2k groceries on 12th","199 netflix","250 lunch with team","rs 80 chai 2 days ago"]; let i = 0;
    placeholderTimer = setInterval(() => { if (!qa.value) qa.placeholder = "Type an expense: " + ex[++i % ex.length]; }, 3200); }
  animateCounts($("view"));
  document.title = meta[0] + " · Expense Tracker · Spendwise";
}
function fillMonths() {
  const list = [...new Set([...S.months, todayStr().slice(0, 7), S.month])].sort().reverse();
  $("monthSel").innerHTML = list.map(m => `<option value="${m}" ${m === S.month ? "selected" : ""}>${monthLabel(m)}</option>`).join("");
}
async function load() {
  const m = S.month;
  const [summary, daily, monthly, bud, expenses, cats, analytics, goalsList] = await Promise.all([
    api(`/api/summary?month=${m}`), api(`/api/daily?month=${m}`), api("/api/monthly"), api(`/api/budgets/${m}`), api(`/api/expenses?month=${m}`),
    api("/api/categories"), api(`/api/analytics?month=${m}`), api("/api/goals")]);
  S.d = {summary, daily, monthly, budgets: bud, expenses}; S.cats = cats; S.a = analytics; S.goals = goalsList;
  S.txs = S.allTime ? await api("/api/expenses") : expenses;
  fillMonths(); render();
  if (S.view === "overview" && S.meta.has_data && expenses.length) loadInsights(m);
}
async function loadInsights(m) {
  S.insights = null;
  try { const r = await api(`/api/insights?month=${m}`); if (m !== S.month) return; S.insights = r; paintInsights(); } catch (e) { /* non-critical */ }
}
function paintInsights() {
  const box = $("insightsBox"); if (!box || !S.insights) return;
  const r = S.insights, glyph = {good:"✓", warn:"!", bad:"!", info:"i"};
  $("aiBadge").textContent = r.summary_source === "ai" ? "AI summary" : "Smart summary";
  if (r.summary_source === "ai") $("aiBadge").classList.remove("plain");
  box.innerHTML = `<p class="summary">${esc(r.summary)}</p><div class="chips">${r.insights.map(i => `<div class="chip ${i.level}"><div class="i">${glyph[i.level] || "i"}</div><div><b>${esc(i.title)}</b><span>${esc(i.text)}</span></div></div>`).join("")}</div>`;
}
async function refreshMeta() {
  S.meta = await api("/api/meta"); S.months = S.meta.months;
  $("aiDot").classList.toggle("off", !S.meta.ai_enabled);
  $("aiTitle").textContent = S.meta.ai_enabled ? "AI features on" : "Smart insights";
  $("aiText").textContent = S.meta.ai_enabled ? "Gemini is writing your summaries and answering open questions." : "Rule-based analysis is active. Add a GEMINI_API_KEY to enable AI summaries.";
}
async function afterMutation(month) { await refreshMeta(); if (month && month !== S.month) S.month = month; await load(); }

/* ---------- expense modal ---------- */
function openModal(e, pre) {
  S.editing = e || null; pre = pre || {}; S.catTouched = !!e || !!pre.category;
  $("mTitle").textContent = e ? "Edit expense" : "Add expense"; $("saveBtn").textContent = e ? "Save changes" : "Save expense";
  $("fAmount").value = e ? e.amount : (pre.amount || ""); $("fDesc").value = e ? e.description : (pre.description || ""); $("fCat").value = e ? e.category : (pre.category || "");
  $("fDate").value = e ? e.expense_date : (pre.expense_date || (S.month === todayStr().slice(0, 7) ? todayStr() : S.month + "-01")); $("fErr").textContent = ""; $("suggest").textContent = "";
  $("catList").innerHTML = [...new Set([...DEFAULT_CATS, ...(S.cats || [])])].sort().map(c => `<option value="${esc(c)}">`).join("");
  if (!$("modal").open) $("modal").showModal(); setTimeout(() => $((pre.amount || e) ? "fCat" : "fAmount").focus(), 30);
}
const onDesc = debounce(async () => {
  const d = $("fDesc").value.trim(); if (d.length < 3) { $("suggest").textContent = ""; return; }
  const r = await api("/api/suggest-category?description=" + encodeURIComponent(d)).catch(() => ({}));
  if (!r.category) { $("suggest").textContent = ""; return; }
  if (!S.catTouched) { $("fCat").value = r.category; $("suggest").textContent = `✨ Category suggested: ${r.category}${r.source === "ai" ? " (AI)" : ""}`; }
  else if ($("fCat").value !== r.category) $("suggest").innerHTML = `✨ Looks like <button type="button" data-act="applySuggest" data-v="${esc(r.category)}">${esc(r.category)}</button>`;
}, 350);
async function saveExpense() {
  const body = {amount: $("fAmount").value, category: $("fCat").value, description: $("fDesc").value, expense_date: $("fDate").value};
  try {
    if (S.editing) { await api(`/api/expenses/${S.editing.id}`, "PUT", body); toast("Expense updated"); } else { await api("/api/expenses", "POST", body); toast("Expense added"); }
    $("modal").close(); await afterMutation(S.editing ? null : (body.expense_date || "").slice(0, 7));
  } catch (e) { $("fErr").textContent = e.message; }
}

/* ---------- quick add (natural language) ---------- */
let qaParsed = null;
const qaPreview = debounce(async () => {
  const el = $("qa"), prev = $("qaPrev"); if (!el || !prev) return; const text = el.value.trim();
  if (!text) { qaParsed = null; prev.innerHTML = `<span>Try</span>` + ["450 uber to office yesterday","1.2k groceries on 12th","199 netflix","250 lunch with team"].map(x => `<button class="pill" data-act="qaEx" data-v="${esc(x)}">${esc(x)}</button>`).join(""); return; }
  const p = await api("/api/parse?text=" + encodeURIComponent(text)).catch(() => null); if (!p || el.value.trim() !== text) return; qaParsed = p;
  prev.innerHTML = (p.amount ? `<span class="tag amt">${inr2(p.amount)}</span>` : `<span class="tag">⚠️ add an amount</span>`) +
    (p.description ? `<span class="tag">${esc(p.description)}</span>` : "") +
    (p.category ? `<span class="tag" style="color:${colorFor(p.category)}">${iconFor(p.category)} ${esc(p.category)}</span>` : (p.amount ? `<span class="tag">🏷️ category: we'll ask</span>` : "")) +
    `<span class="tag">📅 ${prettyDate(p.expense_date)}${p.date_found ? "" : " (today)"}</span>`;
}, 220);
async function addParsed(p) {
  if (!p || !p.amount) { const q = $("qa"); if (q) { q.parentElement.classList.remove("shake"); void q.offsetWidth; q.parentElement.classList.add("shake"); } toast("Include an amount, like “450 uber yesterday”"); return false; }
  if (!p.category) { openModal(null, p); return false; }
  await api("/api/expenses", "POST", {amount: p.amount, category: p.category, description: p.description, expense_date: p.expense_date});
  toast(`Added ${inr2(p.amount)} · ${p.category}`); await afterMutation(p.expense_date.slice(0, 7)); return true;
}
async function submitQuickAdd() {
  const el = $("qa"); if (!el || !el.value.trim()) { toast("Type an expense first, like “450 uber yesterday”"); return; }
  const p = await api("/api/parse?text=" + encodeURIComponent(el.value.trim())); await addParsed(p);
}

/* ---------- goals ---------- */
function openGoalModal() {
  S.emoji = "🎯"; ["gName", "gTarget", "gSaved", "gDeadline"].forEach(i => $(i).value = ""); $("gErr").textContent = "";
  $("emojiRow").innerHTML = GOAL_EMOJI.map(e => `<button type="button" class="${e === S.emoji ? "on" : ""}" data-act="emoji" data-v="${e}">${e}</button>`).join("");
  $("goalModal").showModal(); setTimeout(() => $("gName").focus(), 30);
}
async function saveGoal() {
  try {
    const r = await api("/api/goals", "POST", {name: $("gName").value, target_amount: $("gTarget").value, saved_amount: $("gSaved").value || 0, deadline: $("gDeadline").value, emoji: S.emoji});
    $("goalModal").close(); toast("Goal created 🎯"); await load();
  } catch (e) { $("gErr").textContent = e.message; }
}
async function contribute(id, amount) {
  const before = S.goals.find(g => g.id === id), g = await api(`/api/goals/${id}/contribute`, "POST", {amount});
  await load(); if (g.completed && before && !before.completed) { confetti(); toast(`🎉 You reached your “${g.name}” goal!`); } else toast(`${amount > 0 ? "Added" : "Withdrew"} ${inr(Math.abs(amount))}`);
}

/* ---------- command palette ---------- */
const PAL = {items: [], idx: 0, dyn: [], q: ""};
function baseCommands() {
  const go = k => () => { location.hash = "#/" + k; };
  const list = [
    {g: "Actions", i: "➕", t: "Add expense", k: "add new expense", s: "N", run: () => openModal()},
    {g: "Actions", i: "🎯", t: "New savings goal", k: "goal create target", run: () => { location.hash = "#/goals"; setTimeout(openGoalModal, 120); }},
    {g: "Actions", i: "✨", t: "Ask the assistant", k: "ask assistant ai chat question", run: go("assistant")},
    {g: "Actions", i: "⬇️", t: "Export CSV", k: "export download csv", run: () => { location.href = "/api/export" + (S.allTime ? "" : "?month=" + S.month); }},
    {g: "Actions", i: document.documentElement.dataset.theme === "dark" ? "☀️" : "🌙", t: "Toggle light / dark mode", k: "theme dark light mode", run: () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")},
    ...Object.entries(VIEWS).map(([k, v]) => ({g: "Go to", i: {overview:"📊", transactions:"🧾", budgets:"🎯", goals:"🏁", assistant:"✨"}[k], t: v.label, k: k, run: go(k)})),
    ...S.months.slice(-6).reverse().map(m => ({g: "Jump to month", i: "📅", t: monthLabel(m), k: "month " + m, run: () => { S.month = m; load(); }}))
  ];
  if (!S.meta.has_data) list.unshift({g: "Actions", i: "✨", t: "Load sample data", k: "demo sample data", run: () => document.querySelector("[data-act=demo]") ? document.querySelector("[data-act=demo]").click() : api("/api/demo", "POST").then(async () => { await refreshMeta(); S.month = S.meta.default_month; await load(); })});
  return list;
}
function palRender() {
  const q = PAL.q.toLowerCase(), base = baseCommands().filter(c => !q || (c.t + " " + c.k).toLowerCase().includes(q));
  PAL.items = [...PAL.dyn, ...base]; PAL.idx = Math.min(PAL.idx, Math.max(PAL.items.length - 1, 0)); let last = "", html = "";
  PAL.items.forEach((c, n) => { if (c.g !== last) { html += `<div class="pal-group">${c.g}</div>`; last = c.g; }
    html += `<div class="pal-item ${n === PAL.idx ? "sel" : ""}" data-n="${n}"><div class="pi">${c.i}</div><span>${esc(c.t)}</span>${c.s ? `<small>${c.s}</small>` : ""}</div>`; });
  $("palList").innerHTML = html || `<div class="mini-empty">No results</div>`;
  const sel = $("palList").querySelector(".sel"); if (sel) sel.scrollIntoView({block: "nearest"});
}
const palDyn = debounce(async () => {
  const q = PAL.q.trim(); PAL.dyn = []; if (q.length < 3) { palRender(); return; }
  if (/\d/.test(q)) { const p = await api("/api/parse?text=" + encodeURIComponent(q)).catch(() => null);
    if (p && p.amount && $("palInput").value.trim() === q) PAL.dyn.push({g: "Quick add", i: "⚡", t: `Add ${inr2(p.amount)} · ${p.description || "Expense"} · ${p.category || "choose category"} · ${prettyDate(p.expense_date)}`, run: () => addParsed(p)}); }
  PAL.dyn.push({g: "Ask Spendwise", i: "✨", t: `Ask: “${q}”`, run: () => { location.hash = "#/assistant"; setTimeout(() => sendChat(q), 150); }});
  palRender();
}, 160);
function openPalette() { PAL.q = ""; PAL.dyn = []; PAL.idx = 0; $("palInput").value = ""; palRender(); if (!$("palette").open) $("palette").showModal(); setTimeout(() => $("palInput").focus(), 20); }
function runPalette(n) { const c = PAL.items[n]; if (!c) return; $("palette").close(); setTimeout(() => c.run(), 60); }

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const pi = e.target.closest(".pal-item"); if (pi) { runPalette(+pi.dataset.n); return; }
  const b = e.target.closest("[data-act]");
  if (!b) { const bar = e.target.closest("[data-month]"); if (bar) { S.month = bar.dataset.month; load(); } return; }
  const act = b.dataset.act, id = +b.dataset.id;
  try {
    if (act === "add") { e.preventDefault(); openModal(); }
    else if (act === "close") b.closest("dialog").close();
    else if (act === "save") await saveExpense();
    else if (act === "palette") openPalette();
    else if (act === "theme") applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    else if (act === "prev" || act === "next") { S.month = stepMonth(S.month, act === "next" ? 1 : -1); await load(); }
    else if (act === "demo") { await api("/api/demo", "POST"); toast("Sample data loaded ✨"); await refreshMeta(); S.month = S.meta.default_month; await load(); }
    else if (act === "edit") openModal(S.txs.find(x => x.id === id));
    else if (act === "del") { const x = S.txs.find(r => r.id === id); await api(`/api/expenses/${id}`, "DELETE"); S.undo = {kind: "expense", data: x}; toast("Expense deleted", "Undo"); await afterMutation(); }
    else if (act === "undo") { const u = S.undo; if (u) { S.undo = null;
      if (u.kind === "expense") await api("/api/expenses", "POST", u.data); else await api("/api/goals", "POST", {name: u.data.name, emoji: u.data.emoji, target_amount: u.data.target_amount, saved_amount: u.data.saved_amount, deadline: u.data.deadline});
      toast("Restored"); await afterMutation(); } }
    else if (act === "cat") { S.cat = b.dataset.v; S.limit = 20; render(); }
    else if (act === "scope") { S.allTime = b.dataset.v === "all"; S.cat = "All"; await load(); }
    else if (act === "more") { S.limit += 20; $("txTable").innerHTML = txTable(); }
    else if (act === "export") location.href = "/api/export" + (S.allTime ? "" : "?month=" + S.month);
    else if (act === "applySuggest") { $("fCat").value = b.dataset.v; $("suggest").textContent = ""; }
    else if (act === "editBudget") { $("bCat").value = b.dataset.cat; $("bLim").value = b.dataset.limit; $("bLim").focus(); scrollTo({top: 0, behavior: "smooth"}); }
    else if (act === "saveBudget") { $("bErr").textContent = ""; try { await api("/api/budgets", "POST", {category: $("bCat").value, month: S.month, limit: $("bLim").value}); toast("Budget saved"); await load(); } catch (err) { $("bErr").textContent = err.message; } }
    else if (act === "qaEx") { $("qa").value = b.dataset.v; $("qa").focus(); qaPreview(); }
    else if (act === "qaSubmit") await submitQuickAdd();
    else if (act === "newGoal") openGoalModal();
    else if (act === "emoji") { S.emoji = b.dataset.v; document.querySelectorAll("#emojiRow button").forEach(x => x.classList.toggle("on", x.dataset.v === S.emoji)); }
    else if (act === "saveGoal") await saveGoal();
    else if (act === "fund") await contribute(id, +b.dataset.v);
    else if (act === "fundCustom") { S.fundId = id; $("fTitle").textContent = "Add to “" + S.goals.find(g => g.id === id).name + "”"; $("fundAmt").value = ""; $("fundErr").textContent = ""; $("fundModal").showModal(); setTimeout(() => $("fundAmt").focus(), 30); }
    else if (act === "saveFund") { try { const v = +$("fundAmt").value; if (!v) throw new Error("Enter an amount."); $("fundModal").close(); await contribute(S.fundId, v); } catch (err) { $("fundErr").textContent = err.message; } }
    else if (act === "delGoal") { const g = S.goals.find(x => x.id === id); await api(`/api/goals/${id}`, "DELETE"); S.undo = {kind: "goal", data: g}; toast("Goal deleted", "Undo"); await load(); }
    else if (act === "askEx") sendChat(b.dataset.v);
    else if (act === "send") { const i = $("chatIn"); const v = i.value; i.value = ""; sendChat(v); }
  } catch (err) { toast(err.message); }
});
document.addEventListener("input", e => {
  if (e.target.id === "fDesc") onDesc();
  if (e.target.id === "fCat") S.catTouched = true;
  if (e.target.id === "q") { S.q = e.target.value; S.limit = 20; $("txTable").innerHTML = txTable(); }
  if (e.target.id === "qa") qaPreview();
  if (e.target.id === "palInput") { PAL.q = e.target.value; PAL.idx = 0; palRender(); palDyn(); }
});
document.addEventListener("change", e => {
  if (e.target.id === "sort") { S.sort = e.target.value; $("txTable").innerHTML = txTable(); }
  if (e.target.id === "monthSel") { S.month = e.target.value; load(); }
});
document.addEventListener("keydown", e => {
  const tag = document.activeElement.tagName, typing = /INPUT|SELECT|TEXTAREA/.test(tag);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("palette").open ? $("palette").close() : openPalette(); return; }
  if ($("palette").open) {
    if (e.key === "ArrowDown") { e.preventDefault(); PAL.idx = (PAL.idx + 1) % Math.max(PAL.items.length, 1); palRender(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); PAL.idx = (PAL.idx - 1 + PAL.items.length) % Math.max(PAL.items.length, 1); palRender(); }
    else if (e.key === "Enter") { e.preventDefault(); runPalette(PAL.idx); }
    return;
  }
  if (e.key === "Enter" && e.target.id === "qa") { e.preventDefault(); submitQuickAdd(); return; }
  if (e.key === "Enter" && e.target.id === "chatIn") { e.preventDefault(); const v = e.target.value; e.target.value = ""; sendChat(v); return; }
  if (e.key === "Enter" && $("modal").open && tag === "INPUT") { e.preventDefault(); saveExpense(); return; }
  if (e.key === "Enter" && $("goalModal").open && tag === "INPUT") { e.preventDefault(); saveGoal(); return; }
  if (e.key === "Enter" && $("fundModal").open) { e.preventDefault(); document.querySelector("[data-act=saveFund]").click(); return; }
  if (!typing && !e.metaKey && !e.ctrlKey && !document.querySelector("dialog[open]")) {
    if (e.key.toLowerCase() === "n") { e.preventDefault(); openModal(); }
    else if (e.key === "/" && S.view === "overview" && $("qa")) { e.preventDefault(); $("qa").focus(); }
  }
});
["modal", "goalModal", "fundModal", "palette"].forEach(id => $(id).addEventListener("click", e => { if (e.target === $(id)) $(id).close(); }));
$("palList").addEventListener("mousemove", e => { const it = e.target.closest(".pal-item"); if (it && +it.dataset.n !== PAL.idx) { PAL.idx = +it.dataset.n; document.querySelectorAll(".pal-item").forEach(x => x.classList.toggle("sel", +x.dataset.n === PAL.idx)); } });
addEventListener("hashchange", () => { const v = location.hash.replace("#/", ""); if (VIEWS[v]) { S.view = v; scrollTo(0, 0); if (S.d.summary) { render(); if (v === "overview" && S.meta.has_data && S.d.expenses.length) loadInsights(S.month); } } });

/* ---------- boot ---------- */
(async function init() {
  const v = location.hash.replace("#/", ""); if (VIEWS[v]) S.view = v;
  try { await refreshMeta(); S.month = S.meta.default_month || todayStr().slice(0, 7); await load(); }
  catch (e) { $("view").innerHTML = `<div class="card mini-empty">Could not reach the server: ${esc(e.message)}</div>`; }
})();
