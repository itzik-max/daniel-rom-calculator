// כותב את המייל לדניאל לקובץ, כדי לראות אותו בדפדפן: npm run preview-email -- <נתיב>
import { writeFileSync } from "node:fs";
import { calculate } from "../public/engine.js";
import { buildEmail } from "../netlify/functions/submit.mjs";

const answers = {
  businessType: "clinic", leads: 80, closeRate: 18, dealValue: 2500,
  speed: "day", reach: "half", followup: "once", tracking: "head", process: "partial", discount: "sometimes", upsell: "nothing",
};
const lead = { fullName: "דנה כהן", phone: "0521234567", email: "dana@example.com" };
const { subject, html } = buildEmail({ lead, answers, result: calculate(answers), attribution: { utm_source: "facebook", utm_campaign: "money-floor" } });
const out = process.argv[2] || "email-preview.html";
writeFileSync(out, html);
console.log(subject, "→", out);
