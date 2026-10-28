// מקבל את התשובות והפרטים, מחשב מחדש בשרת, ושולח לדניאל מייל אישי עם התוצאות.
// השליחה עצמה דרך Webhook של Make (מודול Gmail), כדי שלא יהיו סיסמאות בקוד.
import {
  BUSINESS_TYPES, CHOICES, CHOICE_ORDER, LEAK_COPY, SEVERITY_LABEL,
  calculate, firstNameOf, money, roundNice, validate,
} from "../../docs/engine.js";

export const config = { path: "/api/submit" };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function normalizePhone(raw) {
  const d = String(raw || "").replace(/[\s\-().]/g, "").replace(/^\+?972/, "0");
  return /^05\d{8}$/.test(d) ? d : null;
}

export function validateLead(lead) {
  const bad = [];
  const fullName = String(lead?.fullName || "").trim();
  if (fullName.length < 2 || fullName.length > 80 || !/\p{L}{2,}/u.test(fullName)) bad.push("fullName");
  if (!normalizePhone(lead?.phone)) bad.push("phone");
  const email = String(lead?.email || "").trim();
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) bad.push("email");
  return bad;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false });
  let body;
  try { body = await req.json(); } catch { return json(400, { ok: false, reason: "json" }); }

  // מלכודת בוטים: עונים "הצליח" ולא שולחים כלום
  if (body?.lead?.website) return json(200, { ok: true });

  const bad = [...validateLead(body?.lead), ...validate(body?.answers)];
  if (bad.length) return json(400, { ok: false, reason: "invalid", fields: bad });

  const lead = {
    fullName: String(body.lead.fullName).trim(),
    phone: normalizePhone(body.lead.phone),
    email: String(body.lead.email || "").trim(),
  };
  const result = calculate(body.answers);
  const attribution = pickAttribution(body.attribution);
  const email = buildEmail({ lead, answers: body.answers, result, attribution });

  const hook = process.env.RESULTS_WEBHOOK_URL;
  if (!hook) {
    console.warn("RESULTS_WEBHOOK_URL חסר: המייל לא נשלח", lead.phone);
    return json(200, { ok: true, delivered: false });
  }
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dr-secret": process.env.RESULTS_WEBHOOK_SECRET || "" },
      body: JSON.stringify({
        to: process.env.DANIEL_EMAIL || "",
        subject: email.subject,
        html: email.html,
        lead,
        monthly: Math.round(result.monthly),
        yearly: Math.round(result.yearly),
        topLeak: result.leaks[0] ? LEAK_COPY[result.leaks[0].key].title : "",
        attribution,
        submittedAt: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
    return json(200, { ok: true, delivered: true });
  } catch (err) {
    // בעל העסק עדיין רואה את התוצאות. הכישלון נשאר בלוג של Netlify
    console.error("שליחת המייל לדניאל נכשלה", lead.phone, err);
    return json(200, { ok: true, delivered: false });
  }
};

function pickAttribution(raw) {
  const out = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]) {
    if (raw && typeof raw[k] === "string" && raw[k]) out[k] = raw[k].slice(0, 200);
  }
  return out;
}

// ── המייל לדניאל ────────────────────────────────────────────────

const OPENERS = {
  reach: "כמה מהפונים בחודש האחרון לא הצלחת לתפוס בכלל? מה קורה איתם?",
  speed: "מי עונה לפנייה חדשה כשהיא נכנסת, ומה קורה כשאתה באמצע עבודה?",
  followup: "כמה פונים אמרו לך \"אחשוב על זה\" בחודש האחרון? חזרת אליהם?",
  process: "תאר לי שיחת מכירה טיפוסית מהרגע שהלקוח עונה.",
  tracking: "אם אשאל אותך עכשיו כמה פניות נכנסו בחודש שעבר וכמה נסגרו, איפה תבדוק?",
  discount: "באיזה רגע בשיחה ההנחה עולה? מי מעלה אותה, אתה או הלקוח?",
  upsell: "מה הלקוח המרוצה שלך קונה ממך אחרי העסקה הראשונה?",
};

export function buildEmail({ lead, answers, result: r, attribution }) {
  const first = firstNameOf(lead.fullName);
  const open = r.leaks.filter((l) => l.severity !== "ok");
  const intl = `972${lead.phone.slice(1)}`;
  const label = (key) => CHOICES[key].options.find((o) => o.id === answers[key])?.label ?? "";
  const pct = (x) => `${Math.round(x * 100)}%`;

  const subject = `ליד חדש מהמחשבון: ${lead.fullName} · ${money(roundNice(r.monthly))} בחודש על הרצפה`;

  const row = (k, v) => `<tr><td style="padding:6px 0;color:#6b7280;width:46%">${esc(k)}</td><td style="padding:6px 0;font-weight:700">${v}</td></tr>`;
  const card = (inner) => `<div style="background:#ffffff;border:1px solid #e7e1d3;border-radius:14px;padding:18px 20px;margin:0 0 14px">${inner}</div>`;
  const h = (t) => `<h3 style="margin:0 0 10px;font-size:17px;color:#0a1324">${esc(t)}</h3>`;
  const color = { high: "#c2412d", medium: "#b7791f", ok: "#2f855a" };

  const leaksRows = r.leaks.map((l) => `
    <tr>
      <td style="padding:8px 0;border-top:1px solid #f0ebe0"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color[l.severity]};margin-left:6px"></span>${esc(LEAK_COPY[l.key].title)}</td>
      <td style="padding:8px 0;border-top:1px solid #f0ebe0;color:${color[l.severity]};font-size:13px">${SEVERITY_LABEL[l.severity]}</td>
      <td style="padding:8px 0;border-top:1px solid #f0ebe0;font-weight:700;text-align:left;direction:ltr">${l.severity === "ok" ? "—" : money(l.monthly)}</td>
    </tr>`).join("");

  const html = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f6f3ec;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div dir="rtl" style="max-width:620px;margin:0 auto;padding:20px 14px;text-align:right">
  <div style="background:#050a14;border-radius:16px;padding:22px 20px;margin:0 0 14px;color:#f4f1ea">
    <div style="color:#d6b25e;font-weight:700;font-size:13px;letter-spacing:.04em">DANIEL ROM · מחשבון הכסף שנשאר על הרצפה</div>
    <div style="font-size:22px;font-weight:700;margin:8px 0 4px">${esc(lead.fullName)} סיים/ה את המחשבון</div>
    <div style="font-size:15px;color:#c9ced8">${esc(BUSINESS_TYPES[answers.businessType])}</div>
    <div style="font-size:40px;font-weight:800;color:#f1d488;margin:14px 0 0;direction:ltr;text-align:right">${money(roundNice(r.monthly))}</div>
    <div style="font-size:14px;color:#c9ced8">בחודש על הרצפה, לפי התשובות · ${money(roundNice(r.yearly))} בשנה</div>
  </div>

  ${card(`${h("פרטי קשר")}
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      ${row("שם", esc(lead.fullName))}
      ${row("נייד", `<a href="tel:${lead.phone}" style="color:#0a1324;direction:ltr">${lead.phone}</a>`)}
      ${lead.email ? row("אימייל", `<a href="mailto:${esc(lead.email)}" style="color:#0a1324">${esc(lead.email)}</a>`) : ""}
    </table>
    <div style="margin-top:14px">
      <a href="https://wa.me/${intl}?text=${encodeURIComponent(`היי ${first}, כאן דניאל רום. ראיתי את התוצאות שלך במחשבון, יש לך 10 דקות לעבור עליהן ביחד?`)}" style="display:inline-block;background:#d6b25e;color:#1a1205;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px">לכתוב ל${esc(first)} בוואטסאפ</a>
      <a href="tel:${lead.phone}" style="display:inline-block;color:#0a1324;font-weight:700;padding:11px 12px">להתקשר</a>
    </div>`)}

  ${card(`${h("המספרים")}
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      ${row("פניות בחודש", r.leads.toLocaleString("he-IL"))}
      ${row("אחוז סגירה", `${pct(r.closeNow)} (≈${r.deals.toLocaleString("he-IL", { maximumFractionDigits: 1 })} עסקאות)`)}
      ${row("שווי עסקה ממוצעת", money(answers.dealValue))}
      ${row("הכנסה מפניות היום", money(r.revenue))}
      ${row("אחרי סגירת הדליפות", `${money(r.potentialRevenue)} (סגירה ${pct(r.closeTarget)})`)}
      ${row("שווי כל הפניות שלא נסגרו", money(r.unclosedValue))}
    </table>`)}

  ${card(`${h("הדליפות")}
    <table style="width:100%;border-collapse:collapse;font-size:15px">${leaksRows}</table>`)}

  ${card(`${h("מה ענה/תה")}
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${CHOICE_ORDER.map((k) => row(CHOICES[k].question, esc(label(k)))).join("")}
    </table>`)}

  ${open.length ? card(`${h("לשיחה: שאלות פתיחה")}
    <ol style="margin:0;padding-right:18px;font-size:15px;line-height:1.6">
      ${open.slice(0, 3).map((l) => `<li><b>${esc(LEAK_COPY[l.key].title)}:</b> ${esc(OPENERS[l.key])}</li>`).join("")}
    </ol>
    <div style="margin-top:10px;font-size:14px;color:#6b7280">הדליפה הגדולה: ${esc(LEAK_COPY[open[0].key].title)} (${money(open[0].monthly)} בחודש). כדאי להתחיל ממנה.</div>`) : ""}

  ${Object.keys(attribution).length ? `<div style="font-size:12px;color:#9ca3af;margin-top:6px">מקור: ${Object.entries(attribution).map(([k, v]) => `${esc(k)}=${esc(v)}`).join(" · ")}</div>` : ""}
  <div style="font-size:12px;color:#9ca3af;margin-top:6px">גרסת חישוב ${esc(r.modelVersion)} · ההערכה שמרנית ומבוססת על תשובות הליד בלבד</div>
</div></body></html>`;

  return { subject, html };
}
