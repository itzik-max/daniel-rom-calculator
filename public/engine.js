// מנוע מחשבון "הכסף שנשאר על הרצפה" — פונקציות טהורות.
// רץ גם בדפדפן וגם בפונקציה של Netlify, כך שהמייל לדניאל מחושב מחדש בשרת.
// כל ההנחות כאן. הן שמרניות בכוונה: ההערכה היא מה שאפשר להחזיר, לא כל מה שלא נסגר.

export const MODEL_VERSION = "1.0";

export const BUSINESS_TYPES = {
  services: "נותן/ת שירות או פרילנס",
  clinic: "קליניקה או טיפולים",
  studio: "סטודיו, חוגים או סדנאות",
  b2b: "שירות או מוצר לעסקים",
  retail: "חנות או מסחר",
  other: "אחר",
};

// השאלות עם תשובות בחירה. לכל תשובה: מה שומרים, מה מציגים, וכמה היא "עולה".
// lift = שיפור יחסי באחוז הסגירה שאפשר להחזיר אם מתקנים את הנקודה.
export const CHOICES = {
  speed: {
    question: "פנייה חדשה נכנסה. תוך כמה זמן חוזרים אליה?",
    hint: "בממוצע, לא ביום הכי טוב",
    options: [
      { id: "5min", label: "תוך 5 דקות", lift: 0 },
      { id: "hour", label: "תוך שעה", lift: 0.05 },
      { id: "day", label: "באותו יום", lift: 0.12 },
      { id: "later", label: "למחרת או יותר", lift: 0.2 },
    ],
  },
  reach: {
    question: "לכמה מהפונים מצליחים בכלל לדבר?",
    hint: "שיחה אמיתית, לא רק הודעה שנשלחה",
    options: [
      { id: "almost", label: "כמעט לכולם", share: 0.95 },
      { id: "most", label: "לרובם", share: 0.8 },
      { id: "half", label: "בערך לחצי", share: 0.6 },
      { id: "less", label: "לפחות מחצי", share: 0.4 },
    ],
  },
  followup: {
    question: "מה קורה עם מי שאמר \"אני אחשוב על זה\"?",
    hint: "או שפשוט לא ענה",
    options: [
      { id: "none", label: "מחכים שיחזרו אלינו", lift: 0.25 },
      { id: "once", label: "מתקשרים פעם אחת", lift: 0.15 },
      { id: "few", label: "2–3 ניסיונות, כשיש זמן", lift: 0.07 },
      { id: "system", label: "יש מעקב קבוע עם תאריכים", lift: 0 },
    ],
  },
  tracking: {
    question: "איפה מנוהלות הפניות?",
    options: [
      { id: "head", label: "בראש ובוואטסאפ", lift: 0.1 },
      { id: "notes", label: "במחברת או בפתקים", lift: 0.08 },
      { id: "sheet", label: "באקסל או בגוגל שיטס", lift: 0.04 },
      { id: "crm", label: "במערכת CRM", lift: 0 },
    ],
  },
  process: {
    question: "איך נראית שיחת מכירה אצלכם?",
    options: [
      { id: "none", label: "כל שיחה אחרת, זורמים", lift: 0.1 },
      { id: "partial", label: "יש ראשי פרקים בראש", lift: 0.05 },
      { id: "full", label: "תהליך קבוע: שאלות, הצעה, סגירה", lift: 0 },
    ],
  },
  discount: {
    question: "כמה פעמים נותנים הנחה כדי לסגור?",
    options: [
      { id: "always", label: "כמעט בכל עסקה", lift: 0.1 },
      { id: "sometimes", label: "לפעמים", lift: 0.05 },
      { id: "rarely", label: "כמעט אף פעם", lift: 0 },
    ],
  },
  upsell: {
    question: "לקוח סגר. מציעים לו משהו נוסף?",
    hint: "שדרוג, המשך, חידוש או מוצר משלים",
    options: [
      { id: "nothing", label: "אין לנו מה להציע", lift: 0.1 },
      { id: "sometimes", label: "יש, אבל לא מציעים באופן קבוע", lift: 0.07 },
      { id: "always", label: "יש ומציעים לכל לקוח", lift: 0 },
    ],
  },
};

export const CHOICE_ORDER = ["speed", "reach", "followup", "tracking", "process", "discount", "upsell"];

export const LIMITS = {
  leads: { min: 1, max: 5000 },
  closeRate: { min: 1, max: 90 },
  dealValue: { min: 50, max: 1000000 },
};

/** אחרי שיפור, אחוז הסגירה לא עולה על פי 2 מהיום וגם לא מעבר ל־60% (אלא אם הוא כבר גבוה יותר). */
const MAX_CLOSE_MULTIPLIER = 2;
const MAX_CLOSE_RATE = 0.6;
/** מתוך הפונים שלא מצליחים לדבר איתם, מניחים שאפשר להחזיר חצי. */
const REACH_RECOVERY = 0.5;
const REACH_TARGET = 0.95;

const optionOf = (key, id) => CHOICES[key].options.find((o) => o.id === id);

/** בודק את התשובות. מחזיר רשימת שדות שגויים (ריקה = תקין). */
export function validate(a) {
  const bad = [];
  if (!a || typeof a !== "object") return ["answers"];
  if (!(a.businessType in BUSINESS_TYPES)) bad.push("businessType");
  for (const [key, { min, max }] of Object.entries(LIMITS)) {
    const v = Number(a[key]);
    if (!Number.isFinite(v) || v < min || v > max) bad.push(key);
  }
  for (const key of CHOICE_ORDER) if (!optionOf(key, a[key])) bad.push(key);
  return bad;
}

/**
 * החישוב. סדר הדליפות קבוע (מפל): כל דליפה מחושבת על הבסיס אחרי התיקון של הקודמת,
 * כך שהסכומים לא נספרים פעמיים ומסתכמים בדיוק לפוטנציאל.
 */
export function calculate(a) {
  const leads = Number(a.leads);
  const close = Number(a.closeRate) / 100;
  const value = Number(a.dealValue);

  const deals = leads * close;
  const revenue = deals * value;
  const unclosedValue = (leads - deals) * value;

  // אחוז הסגירה: הגעה, מהירות, פולואפ, תהליך ומעקב
  const reachNow = optionOf("reach", a.reach).share;
  const reachNext = reachNow + Math.max(0, REACH_TARGET - reachNow) * REACH_RECOVERY;
  const closeSteps = [
    { key: "reach", factor: reachNext / reachNow },
    { key: "speed", factor: 1 + optionOf("speed", a.speed).lift },
    { key: "followup", factor: 1 + optionOf("followup", a.followup).lift },
    { key: "process", factor: 1 + optionOf("process", a.process).lift },
    { key: "tracking", factor: 1 + optionOf("tracking", a.tracking).lift },
  ];

  const closeCap = Math.max(close, Math.min(close * MAX_CLOSE_MULTIPLIER, MAX_CLOSE_RATE));
  const rawClose = closeSteps.reduce((c, s) => c * s.factor, close);
  const closeTarget = Math.min(rawClose, closeCap);

  // חלוקת השיפור בין הדליפות לפי המשקל (לוגריתמי) של כל אחת, כדי שהתקרה תחול על כולן באופן שווה
  const logTotal = closeSteps.reduce((t, s) => t + Math.log(s.factor), 0);
  const closeGain = (closeTarget - close) * leads * value;
  const leaks = closeSteps.map((s) => ({
    key: s.key,
    monthly: logTotal > 0 ? (closeGain * Math.log(s.factor)) / logTotal : 0,
  }));

  // שווי עסקה: הנחות. ואחרי זה מכירה נוספת ללקוחות שסגרו.
  const dealsTarget = leads * closeTarget;
  const discountLift = optionOf("discount", a.discount).lift;
  leaks.push({ key: "discount", monthly: dealsTarget * value * discountLift });
  const valueTarget = value * (1 + discountLift);
  const upsellLift = optionOf("upsell", a.upsell).lift;
  leaks.push({ key: "upsell", monthly: dealsTarget * valueTarget * upsellLift });

  const monthly = leaks.reduce((t, l) => t + l.monthly, 0);

  for (const l of leaks) {
    const share = monthly > 0 ? l.monthly / monthly : 0;
    l.severity = l.monthly <= 0.5 ? "ok" : share >= 0.2 ? "high" : "medium";
  }
  leaks.sort((x, y) => y.monthly - x.monthly);

  return {
    modelVersion: MODEL_VERSION,
    leads,
    deals,
    revenue,
    unclosedValue,
    monthly,
    yearly: monthly * 12,
    potentialRevenue: revenue + monthly,
    closeNow: close,
    closeTarget,
    dealsTarget,
    reachNow,
    reachNext,
    leaks,
  };
}

// ── הטקסטים של השיקוף ───────────────────────────────────────────

/** לכל דליפה: כותרת, מה ראינו בתשובות, ומה עושים. */
export const LEAK_COPY = {
  reach: {
    title: "פונים שלא מגיעים לשיחה",
    seen: (a) => `עונים ל${{ almost: "כמעט כל", most: "רוב", half: "כחצי מה", less: "פחות מחצי מה" }[a.reach]}פונים. מי שלא דיברתם איתו לא יקנה, גם אם הוא הכי מתאים.`,
    fix: [
      "שלושה ניסיונות לפחות בשעות שונות: בוקר, צהריים וערב.",
      "הודעת וואטסאפ קצרה מיד אחרי שיחה שלא נענתה, עם שאלה אחת פשוטה.",
      "שעה קבועה ביום שמוקדשת רק לחזרה לפניות.",
    ],
  },
  speed: {
    title: "זמן התגובה לפנייה",
    seen: (a) => `חוזרים ${{ "5min": "תוך דקות", hour: "תוך שעה", day: "באותו יום", later: "למחרת ויותר" }[a.speed]}. בזמן הזה הפונה כבר פנה גם למתחרים, וההתלהבות שלו יורדת.`,
    fix: [
      "התראה מיידית על כל פנייה, לטלפון של מי שמטפל בה.",
      "הודעה אוטומטית תוך דקה: \"קיבלנו, נחזור אליך עד השעה...\".",
      "יעד ברור: חזרה תוך 15 דקות בשעות העבודה.",
    ],
  },
  followup: {
    title: "פולואפ למי שלא סגר",
    seen: (a) => ({
      none: "מי שלא סגר בשיחה הראשונה נשאר לבד. רוב העסקאות נסגרות אחרי כמה נגיעות, לא בשיחה הראשונה.",
      once: "ניסיון אחד ונגמר. הרבה פונים אומרים \"לא עכשיו\" ולא \"לא\".",
      few: "יש פולואפ, אבל כשיש זמן. בשבוע עמוס הוא הראשון שנעלם.",
      system: "",
    })[a.followup],
    fix: [
      "רצף קבוע של 4–5 נגיעות על פני שבועיים: שיחה, הודעה, ערך, שיחה.",
      "לכל פונה פתוח: תאריך לחזרה הבאה. אין פנייה בלי \"מתי חוזרים\".",
      "שאלה פשוטה בסוף כל שיחה: \"מה צריך לקרות כדי שזה יתאים לך?\"",
    ],
  },
  process: {
    title: "תהליך מכירה לא קבוע",
    seen: (a) => (a.process === "none"
      ? "כל שיחה נראית אחרת. כשאין מבנה, התוצאה תלויה ביום, במצב הרוח ובפונה."
      : "יש כיוון, אבל לא תהליך כתוב. קשה לשפר את מה שלא מוגדר, ואי אפשר להעביר אותו לאחר."),
    fix: [
      "לכתוב את שלבי השיחה: פתיחה, שאלות אבחון, הצגת פתרון, מחיר, סגירה.",
      "רשימה של 5 ההתנגדויות שחוזרות, ותשובה מוכנה לכל אחת.",
      "לסיים כל שיחה בצעד הבא ברור: תשלום, פגישה או מועד חזרה.",
    ],
  },
  tracking: {
    title: "מעקב אחרי הפניות",
    seen: (a) => ({
      head: "הפניות בראש ובוואטסאפ. אין דרך לדעת מי נפל בין הכיסאות, ואין מספרים לשפר.",
      notes: "הפניות במחברת. זה עדיף מכלום, אבל אין תזכורות ואין תמונה של החודש.",
      sheet: "יש טבלה. השאלה אם היא מעודכנת בזמן אמת ואם מישהו עובר עליה כל יום.",
      crm: "",
    })[a.tracking],
    fix: [
      "מקום אחד לכל הפניות, עם סטטוס לכל פונה: חדש, בטיפול, הצעה, נסגר, לא רלוונטי.",
      "חמש דקות כל בוקר: מי צריך לקבל טלפון היום.",
      "פעם בחודש: כמה פניות, כמה עסקאות, ולמה לא סגרו.",
    ],
  },
  discount: {
    title: "הנחות שאוכלות את הרווח",
    seen: (a) => (a.discount === "always"
      ? "הנחה כמעט בכל עסקה. ההנחה יורדת ישר מהרווח, ולרוב היא מכסה על הצגת ערך חלשה."
      : "לפעמים נותנים הנחה כדי לסגור. כדאי לבדוק מתי זה קורה ולמה."),
    fix: [
      "במקום הנחה: תוספת שעולה לכם מעט ושווה ללקוח הרבה.",
      "להציג שתיים–שלוש חבילות, כדי שהשיחה תהיה על \"איזו\" ולא על \"כמה\".",
      "לפני המחיר, לסכם עם הלקוח מה הבעיה עולה לו היום.",
    ],
  },
  upsell: {
    title: "מה קורה אחרי שהלקוח קנה",
    seen: (a) => (a.upsell === "nothing"
      ? "אין הצעה נוספת ללקוח קיים. הלקוח הכי קל למכור לו הוא זה שכבר קנה ומרוצה."
      : "יש מה להציע, אבל רק לפעמים. מה שלא מוצע באופן קבוע, לא נמכר."),
    fix: [
      "מוצר המשך אחד ברור: חבילה, מנוי, חידוש או שדרוג.",
      "רגע קבוע להציע אותו: בסוף השירות, או שבועיים אחרי.",
      "לבקש מכל לקוח מרוצה המלצה או הפניה.",
    ],
  },
};

export const SEVERITY_LABEL = { high: "דליפה גדולה", medium: "דליפה", ok: "תקין" };

/** "₪12,400" */
export function money(n) {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}

/** עיגול לסכום "אנושי" לכותרות: 12,437 → 12,400 */
export function roundNice(n) {
  if (n < 1000) return Math.round(n / 10) * 10;
  if (n < 10000) return Math.round(n / 100) * 100;
  return Math.round(n / 1000) * 1000;
}

export function firstNameOf(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "";
}
