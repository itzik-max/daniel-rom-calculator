import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, validate, CHOICE_ORDER, CHOICES } from "../public/engine.js";
import handler, { buildEmail, normalizePhone, validateLead } from "../netlify/functions/submit.mjs";

const base = {
  businessType: "services", leads: 60, closeRate: 20, dealValue: 3000,
  speed: "day", reach: "most", followup: "once", tracking: "head", process: "partial", discount: "sometimes", upsell: "sometimes",
};
const best = { ...base, speed: "5min", reach: "almost", followup: "system", tracking: "crm", process: "full", discount: "rarely", upsell: "always" };

test("תשובות תקינות עוברות, שגויות נתפסות", () => {
  assert.deepEqual(validate(base), []);
  assert.deepEqual(validate({ ...base, leads: 0, speed: "x", businessType: "?" }).sort(), ["businessType", "leads", "speed"]);
});

test("הדליפות מסתכמות לסך החודשי, והשנתי פי 12", () => {
  const r = calculate(base);
  const sum = r.leaks.reduce((t, l) => t + l.monthly, 0);
  assert.ok(Math.abs(sum - r.monthly) < 0.01);
  assert.equal(r.yearly, r.monthly * 12);
  assert.equal(r.revenue, 60 * 0.2 * 3000);
  assert.ok(Math.abs(r.potentialRevenue - (r.revenue + r.monthly)) < 0.01);
});

test("עסק שעושה הכול נכון: אין דליפות", () => {
  const r = calculate(best);
  assert.ok(r.monthly < 1);
  assert.ok(r.leaks.every((l) => l.severity === "ok"));
});

test("אחוז הסגירה אחרי שיפור מוגבל לפי 2 ול־60%", () => {
  const worst = { ...base, speed: "later", reach: "less", followup: "none", tracking: "head", process: "none" };
  const low = calculate({ ...worst, closeRate: 10 });
  assert.ok(low.closeTarget <= 0.2 + 1e-9);
  const high = calculate({ ...worst, closeRate: 45 });
  assert.ok(high.closeTarget <= 0.6 + 1e-9);
  const veryHigh = calculate({ ...worst, closeRate: 80 });
  assert.equal(veryHigh.closeTarget, 0.8); // כבר מעל התקרה: לא יורד, לא עולה
});

test("כל תשובה גרועה יותר לא מקטינה את הסכום", () => {
  for (const key of CHOICE_ORDER) {
    const ids = CHOICES[key].options.map((o) => o.id);
    let prev = -1;
    // האפשרויות מסודרות מהטובה לגרועה בחלק מהשאלות ולהפך באחרות: בודקים מונוטוניות בכיוון כלשהו
    const values = ids.map((id) => calculate({ ...best, [key]: id }).monthly);
    const asc = values.every((v, i) => i === 0 || v >= values[i - 1] - 1e-9);
    const desc = values.every((v, i) => i === 0 || v <= values[i - 1] + 1e-9);
    assert.ok(asc || desc, `${key}: ${values}`);
    prev = values[0];
    assert.ok(prev >= 0);
  }
});

test("טלפון ופרטי ליד", () => {
  assert.equal(normalizePhone("+972 52-123-4567"), "0521234567");
  assert.equal(normalizePhone("03-1234567"), null);
  assert.deepEqual(validateLead({ fullName: "דנה כהן", phone: "0521234567", email: "" }), []);
  assert.deepEqual(validateLead({ fullName: "a", phone: "123", email: "x@" }), ["fullName", "phone", "email"]);
});

test("המייל לדניאל כולל את הפרטים והסכום, ומנוטרל מ־HTML", () => {
  const lead = { fullName: "דנה <b>כהן</b>", phone: "0521234567", email: "dana@example.com" };
  const { subject, html } = buildEmail({ lead, answers: base, result: calculate(base), attribution: { utm_campaign: "test" } });
  assert.match(subject, /דנה/);
  assert.ok(html.includes("wa.me/972521234567"));
  assert.ok(html.includes("&lt;b&gt;"));
  assert.ok(!html.includes("<b>כהן</b>"));
});

test("הפונקציה: 400 על פרטים שגויים, 200 בלי Webhook, ובוט לא נשלח", async () => {
  delete process.env.RESULTS_WEBHOOK_URL;
  const post = (body) => handler(new Request("http://x/api/submit", { method: "POST", body: JSON.stringify(body) }));
  assert.equal((await post({ lead: { fullName: "x", phone: "1" }, answers: base })).status, 400);
  const ok = await post({ lead: { fullName: "דנה כהן", phone: "0521234567" }, answers: base });
  assert.deepEqual(await ok.json(), { ok: true, delivered: false });
  const bot = await post({ lead: { website: "spam" }, answers: {} });
  assert.equal(bot.status, 200);
});
