// המחשבון: פתיחה → 9 שאלות → פרטים → שיקוף. הכול בדף אחד, בלי ספריות.
import {
  BUSINESS_TYPES, CHOICES, CHOICE_ORDER, LEAK_COPY, LIMITS, SEVERITY_LABEL,
  calculate, firstNameOf, money, roundNice, validate,
} from "./engine.js";

const CONFIG = window.DR_CONFIG || {};
const STORAGE_KEY = "dr-calc-v1";
const QUESTION_STEPS = ["type", "numbers", ...CHOICE_ORDER];
const DEFAULTS = { leads: 60, closeRate: 20, dealValue: 3000 };

const app = document.getElementById("app");
const store = {
  get() { try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || null; } catch { return null; } },
  set(v) { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* מצב פרטי */ } },
};

let state = store.get() || { step: "landing", answers: { ...DEFAULTS }, firstName: "" };
if (state.step === "results" && validate(state.answers).length) state.step = "landing";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── מדידה ──────────────────────────────────────────────────────
function captureAttribution() {
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem("dr-attr")) || {}; } catch { return {}; } })();
  const params = new URLSearchParams(location.search);
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]) {
    if (params.get(k)) saved[k] = params.get(k).slice(0, 200);
  }
  try { sessionStorage.setItem("dr-attr", JSON.stringify(saved)); } catch { /* מצב פרטי */ }
  return saved;
}

function initPixel() {
  const id = CONFIG.metaPixelId;
  if (!id) return;
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq("init", id);
  window.fbq("track", "PageView");
}
const track = (name, data) => { try { window.fbq?.(name === "Lead" ? "track" : "trackCustom", name, data); } catch { /* בלי פיקסל */ } };

// ── ניווט ───────────────────────────────────────────────────────
function go(step) {
  state.step = step;
  store.set(state);
  render();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}
function next(from) {
  const i = QUESTION_STEPS.indexOf(from);
  go(i < QUESTION_STEPS.length - 1 ? QUESTION_STEPS[i + 1] : "gate");
}
function back(from) {
  if (from === "gate") return go(QUESTION_STEPS.at(-1));
  const i = QUESTION_STEPS.indexOf(from);
  go(i <= 0 ? "landing" : QUESTION_STEPS[i - 1]);
}

function render() {
  const { step } = state;
  if (step === "landing") return renderLanding();
  if (step === "type") return renderType();
  if (step === "numbers") return renderNumbers();
  if (step === "gate") return renderGate();
  if (step === "results") return renderResults();
  return renderChoice(step);
}

// ── פתיחה ──────────────────────────────────────────────────────
function renderLanding() {
  app.innerHTML = `
    <section class="screen landing">
      <img class="logo" src="/assets/logo.jpg" alt="Daniel Rom · Business | Growth | Excellence" width="720" height="388">
      <div class="eyebrow">מחשבון לבעלי עסקים</div>
      <h1>כמה כסף נשאר לכם <span class="gold">על הרצפה</span> כל חודש?</h1>
      <p class="lead">פניות נכנסות, אבל לא כולן הופכות ללקוחות. בשתי דקות תראו כמה זה עולה לכם, איפה בדיוק הכסף בורח, ומה עושים כדי לעצור את זה.</p>
      <ul class="gets">
        <li><span class="n gold">1</span><span><b>הסכום החודשי</b> שאפשר להחזיר מהפניות שכבר נכנסות, בלי עוד פרסום.</span></li>
        <li><span class="n gold">2</span><span><b>מפה של הדליפות</b>: מהירות תגובה, פולואפ, תהליך מכירה, הנחות ועוד.</span></li>
        <li><span class="n gold">3</span><span><b>מה עושים</b>: צעדים מעשיים לכל נקודה, לפי סדר עדיפות.</span></li>
      </ul>
      <button class="btn wide" id="start">בואו נבדוק ←</button>
      <p class="trust"><b>דניאל רום</b> · ליווי וייעוץ לבעלי עסקים, מעל 10 שנים</p>
    </section>`;
  app.querySelector("#start").onclick = () => { track("CalculatorStarted"); go("type"); };
}

// ── מסגרת לשאלה ─────────────────────────────────────────────────
function shell(step, { title, hint = "", body, showNext = false, nextLabel = "המשך ←" }) {
  const i = QUESTION_STEPS.indexOf(step);
  const pct = Math.round(((i + 1) / (QUESTION_STEPS.length + 1)) * 100);
  app.innerHTML = `
    <section class="screen step">
      <div class="top">
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        <img src="/assets/mark.jpg" alt="DR" width="53" height="30">
      </div>
      <div class="eyebrow">שאלה ${i + 1} מתוך ${QUESTION_STEPS.length}</div>
      <h2>${title}</h2>
      ${hint ? `<p class="hint">${hint}</p>` : ""}
      <div class="body">${body}</div>
      <div class="actions">
        <button class="btn-ghost" id="back">→ חזרה</button>
        ${showNext ? `<button class="btn" id="next">${nextLabel}</button>` : ""}
      </div>
    </section>`;
  app.querySelector("#back").onclick = () => back(step);
}

function bindOptions(step, key) {
  app.querySelectorAll(".opt").forEach((b) => {
    b.onclick = () => {
      state.answers[key] = b.dataset.id;
      app.querySelectorAll(".opt").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      store.set(state);
      setTimeout(() => next(step), 220);
    };
  });
}

function renderType() {
  const cur = state.answers.businessType;
  shell("type", {
    title: "איזה עסק יש לכם?",
    hint: "כדי שנדבר באותה שפה",
    body: `<div class="options grid2">${Object.entries(BUSINESS_TYPES).map(([id, label]) =>
      `<button class="opt" data-id="${id}" aria-pressed="${cur === id}">${esc(label)}</button>`).join("")}</div>`,
  });
  bindOptions("type", "businessType");
}

function renderChoice(key) {
  const q = CHOICES[key];
  const cur = state.answers[key];
  shell(key, {
    title: esc(q.question),
    hint: esc(q.hint || ""),
    body: `<div class="options">${q.options.map((o) =>
      `<button class="opt" data-id="${o.id}" aria-pressed="${cur === o.id}">${esc(o.label)}</button>`).join("")}</div>`,
  });
  bindOptions(key, key);
}

// ── המספרים ────────────────────────────────────────────────────
const NUMBER_FIELDS = [
  { key: "leads", label: "כמה פניות חדשות נכנסות בחודש?", sub: "מכל המקורות: טלפון, וואטסאפ, טפסים, הפניות", range: [5, 300, 5], suffix: "" },
  { key: "closeRate", label: "כמה אחוז מהן הופכות ללקוחות?", sub: "אם מתוך 10 פונים 2 קונים, זה 20%", range: [1, 80, 1], suffix: "%" },
  { key: "dealValue", label: "כמה שווה עסקה ממוצעת?", sub: "בשקלים, כמה לקוח משלם בממוצע", range: [200, 30000, 100], suffix: "₪" },
];

function renderNumbers() {
  const a = state.answers;
  shell("numbers", {
    title: "המספרים של החודש",
    hint: "הערכה מספיקה. אפשר להקליד או להזיז",
    showNext: true,
    body: NUMBER_FIELDS.map((f) => `
      <div class="field">
        <label for="n-${f.key}">${f.label}</label>
        <div class="sub">${f.sub}</div>
        <div class="row">
          <input type="range" id="r-${f.key}" min="${f.range[0]}" max="${f.range[1]}" step="${f.range[2]}" value="${Math.min(a[f.key], f.range[1])}" aria-label="${f.label}">
          <input class="num" id="n-${f.key}" type="text" inputmode="numeric" value="${fmtField(f, a[f.key])}">
        </div>
        <div class="err" id="e-${f.key}" hidden></div>
      </div>`).join("") + `<div class="readout" id="readout"></div>`,
  });

  const update = () => {
    const { leads, closeRate, dealValue } = state.answers;
    const deals = (leads * closeRate) / 100;
    app.querySelector("#readout").innerHTML =
      `<span>בערך <b>${deals.toLocaleString("he-IL", { maximumFractionDigits: 1 })}</b> עסקאות בחודש</span>` +
      `<span>הכנסה מפניות: <b>${money(deals * dealValue)}</b></span>`;
  };

  for (const f of NUMBER_FIELDS) {
    const range = app.querySelector(`#r-${f.key}`);
    const num = app.querySelector(`#n-${f.key}`);
    const err = app.querySelector(`#e-${f.key}`);
    range.oninput = () => {
      state.answers[f.key] = Number(range.value);
      num.value = fmtField(f, state.answers[f.key]);
      err.hidden = true;
      update();
    };
    num.onfocus = () => { num.value = String(state.answers[f.key]); num.select(); };
    num.oninput = () => {
      const v = Number(num.value.replace(/[^\d.]/g, ""));
      if (Number.isFinite(v) && v > 0) {
        state.answers[f.key] = v;
        range.value = String(Math.min(v, f.range[1]));
        update();
      }
    };
    num.onblur = () => { num.value = fmtField(f, state.answers[f.key]); };
  }
  update();

  app.querySelector("#next").onclick = () => {
    let ok = true;
    for (const f of NUMBER_FIELDS) {
      const { min, max } = LIMITS[f.key];
      const v = state.answers[f.key];
      const err = app.querySelector(`#e-${f.key}`);
      if (!(v >= min && v <= max)) {
        err.textContent = `צריך מספר בין ${min.toLocaleString("he-IL")} ל־${max.toLocaleString("he-IL")}`;
        err.hidden = false;
        ok = false;
      }
    }
    if (ok) { store.set(state); next("numbers"); }
  };
}

function fmtField(f, v) {
  const n = Number(v).toLocaleString("he-IL");
  return f.suffix === "%" ? `${n}%` : f.suffix === "₪" ? `₪${n}` : n;
}

// ── פרטים לפני התוצאות ─────────────────────────────────────────
function renderGate() {
  const r = calculate(state.answers);
  const leaksFound = r.leaks.filter((l) => l.severity !== "ok").length;
  app.innerHTML = `
    <section class="screen step">
      <div class="top">
        <div class="progress"><i style="width:${Math.round((QUESTION_STEPS.length / (QUESTION_STEPS.length + 1)) * 100)}%"></i></div>
        <img src="/assets/mark.jpg" alt="DR" width="53" height="30">
      </div>
      <div class="teaser">
        <div class="eyebrow">התוצאה מוכנה</div>
        <div class="big gold" aria-hidden="true">${money(roundNice(r.monthly))}</div>
        <p>מצאנו <b>${leaksFound} נקודות</b> שבהן כסף בורח לכם כל חודש.</p>
      </div>
      <h2>רגע לפני התוצאות</h2>
      <p class="hint">השאירו פרטים, והשיקוף המלא יופיע מיד כאן במסך.</p>
      <form id="gate" novalidate>
        <div class="text-field">
          <label for="g-name">שם מלא</label>
          <input id="g-name" name="fullName" autocomplete="name" required>
          <div class="err" hidden></div>
        </div>
        <div class="text-field">
          <label for="g-phone">טלפון נייד</label>
          <input id="g-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" required>
          <div class="err" hidden></div>
        </div>
        <div class="text-field">
          <label for="g-email">אימייל <small>(לא חובה)</small></label>
          <input id="g-email" name="email" type="email" inputmode="email" autocomplete="email" dir="ltr">
          <div class="err" hidden></div>
        </div>
        <div class="hp" aria-hidden="true"><label>אתר <input name="website" tabindex="-1" autocomplete="off"></label></div>
        <button class="btn wide" type="submit">להציג את התוצאות ←</button>
        <div class="alert" id="g-fail" hidden></div>
        <p class="privacy">הפרטים מגיעים לדניאל רום בלבד, כדי לחזור אליכם בנוגע לתוצאות.${CONFIG.privacyUrl ? ` <a href="${esc(CONFIG.privacyUrl)}" target="_blank" rel="noopener">מדיניות פרטיות</a>` : ""}</p>
      </form>
      <div class="actions"><button class="btn-ghost" id="back">→ חזרה</button></div>
    </section>`;
  app.querySelector("#back").onclick = () => back("gate");

  const form = app.querySelector("#gate");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errors = {
      fullName: /\p{L}{2,}/u.test(data.fullName.trim()) ? "" : "מה השם שלכם?",
      phone: isIsraeliMobile(data.phone) ? "" : "צריך מספר נייד, למשל 050-1234567",
      email: !data.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()) ? "" : "כתובת המייל לא נראית תקינה",
    };
    for (const [name, msg] of Object.entries(errors)) {
      const el = form.querySelector(`[name="${name}"]`).parentElement.querySelector(".err");
      el.textContent = msg;
      el.hidden = !msg;
    }
    if (Object.values(errors).some(Boolean)) return;

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "מכינים את השיקוף...";
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead: data, answers: state.answers, attribution: captureAttribution() }),
      });
      if (res.status === 400) {
        btn.disabled = false;
        btn.textContent = "להציג את התוצאות ←";
        const fail = app.querySelector("#g-fail");
        fail.textContent = "משהו בפרטים לא תקין. בדקו את השם והנייד ונסו שוב.";
        fail.hidden = false;
        return;
      }
    } catch {
      // גם אם השליחה נכשלה, בעל העסק רואה את התוצאות. הכישלון נרשם בצד השרת כשיש.
    }
    track("Lead", { content_name: "money-on-the-floor", value: Math.round(r.monthly), currency: "ILS" });
    state.firstName = firstNameOf(data.fullName);
    go("results");
  };
}

function isIsraeliMobile(raw) {
  const d = String(raw || "").replace(/[\s\-().]/g, "").replace(/^\+?972/, "0");
  return /^05\d{8}$/.test(d);
}

// ── השיקוף ─────────────────────────────────────────────────────
const SEVERITY_COLOR = { high: "var(--red)", medium: "var(--amber)", ok: "var(--green)" };
const pct = (x) => `${Math.round(x * 100)}%`;

function renderResults() {
  const a = state.answers;
  const r = calculate(a);
  const name = state.firstName;
  const open = r.leaks.filter((l) => l.severity !== "ok");
  const fine = r.leaks.filter((l) => l.severity === "ok");

  app.innerHTML = `
    <section class="screen">
      <div class="hero">
        <div class="eyebrow">${name ? `${esc(name)}, זה` : "זה"} השיקוף שלכם</div>
        <h1>כל חודש נשארים על הרצפה בערך</h1>
        <div class="amount gold" id="amount">${money(0)}</div>
        <div class="per">מהפניות שכבר נכנסות, בלי שקל נוסף על פרסום</div>
        <div class="yearly">זה ${money(roundNice(r.yearly))} בשנה</div>
      </div>

      <div class="compare">
        <div class="stat"><div class="k">הכנסה מפניות היום</div><div class="v">${money(r.revenue)}</div><div class="s">${fmtNum(r.deals)} עסקאות בחודש</div></div>
        <div class="stat hl"><div class="k">אחרי שסוגרים את הדליפות</div><div class="v gold">${money(r.potentialRevenue)}</div><div class="s">${fmtNum(r.dealsTarget)} עסקאות בחודש</div></div>
        <div class="stat"><div class="k">אחוז סגירה</div><div class="v">${pct(r.closeNow)} → ${pct(r.closeTarget)}</div><div class="s">היום ← אחרי השיפור</div></div>
        <div class="stat"><div class="k">פניות שלא נסגרות</div><div class="v">${fmtNum(r.leads - r.deals)}</div><div class="s">בחודש, בשווי ${money(r.unclosedValue)}</div></div>
      </div>

      <h2 class="section-title">איפה הכסף בורח</h2>
      <p class="section-sub">${open.length ? `${open.length} נקודות, מהיקרה לזולה. לחצו על כל אחת כדי לראות מה עושים.` : "לא מצאנו דליפות משמעותיות. העסק שלכם מתנהל מצוין בצד המכירות."}</p>
      ${open.length ? `<div class="bar" aria-hidden="true">${open.map((l) => `<i style="flex:${l.monthly};background:${SEVERITY_COLOR[l.severity]}"></i>`).join("")}</div>` : ""}
      ${open.map((l, i) => leakCard(l, a, i === 0)).join("")}
      ${fine.map((l) => leakCard(l, a, false)).join("")}

      ${open.length ? `
      <h2 class="section-title">מאיפה מתחילים</h2>
      <p class="section-sub">שלושה צעדים לשבועיים הקרובים, לפי מה שיחזיר הכי הרבה:</p>
      <ol class="plan">${open.slice(0, 3).map((l) => `<li><span><b>${esc(LEAK_COPY[l.key].title)}</b>${esc(LEAK_COPY[l.key].fix[0])}</span></li>`).join("")}</ol>` : ""}

      <div class="cta">
        <h3>רוצים שנעבור על זה ביחד?</h3>
        <p>בשיחת אבחון קצרה נבדוק את המספרים האמיתיים שלכם, נמצא את צוואר הבקבוק ונבנה תוכנית מסודרת לסגור אותו.</p>
        <a class="btn wide" id="cta" href="${esc(CONFIG.whatsappUrl || "#")}" target="_blank" rel="noopener">לשיחת אבחון עם דניאל ←</a>
        <div class="who"><img src="/assets/mark.jpg" alt="" width="60" height="34"><span>דניאל רום · ליווי וייעוץ לבעלי עסקים</span></div>
      </div>

      <details class="method">
        <summary>איך חישבנו?</summary>
        <ul>
          <li>ההערכה שמרנית: היא לא סופרת את כל הפניות שלא נסגרו (${money(r.unclosedValue)} בחודש), אלא רק את מה שאפשר להחזיר באופן סביר.</li>
          <li>כל נקודה מחושבת אחרי התיקון של הקודמת, כך שאותו שקל לא נספר פעמיים.</li>
          <li>אחוז הסגירה אחרי השיפור מוגבל לפי 2 מהיום ולא יותר מ־60%.</li>
          <li>מבין הפונים שלא מגיעים לשיחה, מניחים שאפשר להגיע לחצי.</li>
          <li>זו הערכה לפי התשובות שלכם, לא התחייבות לתוצאה. המספרים האמיתיים נבדקים בשיחת האבחון.</li>
        </ul>
      </details>
      <div class="footer-actions"><button class="btn-ghost" id="edit">לשנות תשובות</button></div>
    </section>`;

  app.querySelector("#edit").onclick = () => go("numbers");
  app.querySelector("#cta").onclick = () => track("ConsultationClicked");
  countUp(app.querySelector("#amount"), roundNice(r.monthly));
}

function leakCard(l, a, openFirst) {
  const c = LEAK_COPY[l.key];
  if (l.severity === "ok") {
    return `<details class="leak ok"><summary><span class="dot"></span><span class="t">${esc(c.title)}<span class="badge">${SEVERITY_LABEL.ok}</span></span><span></span></summary></details>`;
  }
  return `
    <details class="leak ${l.severity}"${openFirst ? " open" : ""}>
      <summary>
        <span class="dot"></span>
        <span class="t">${esc(c.title)}<span class="badge">${SEVERITY_LABEL[l.severity]}</span></span>
        <span class="m">${money(roundNice(l.monthly))} <small>לחודש</small></span>
      </summary>
      <div class="content">
        <p>${esc(c.seen(a))}</p>
        <h4>מה עושים</h4>
        <ul>${c.fix.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      </div>
    </details>`;
}

const fmtNum = (n) => n.toLocaleString("he-IL", { maximumFractionDigits: 1 });

function countUp(el, target) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = money(target); return; }
  const start = performance.now();
  const dur = 1400;
  const tick = (t) => {
    const p = Math.min(1, (t - start) / dur);
    el.textContent = money(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

captureAttribution();
initPixel();
render();
