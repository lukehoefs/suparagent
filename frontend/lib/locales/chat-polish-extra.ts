// The Usage panel's month arrows, beside the chat (components/chat/UsagePanel.tsx): icon-only
// buttons, so these are their names and tooltips.
// Every key needs all 13 locales: tsc checks each table against `en`. Registered in lib/i18n.ts.

const en = {
  "usage.previousMonth": "Previous month",
  "usage.nextMonth": "Next month",
};

type Keys = keyof typeof en;

const de: Record<Keys, string> = {
  "usage.previousMonth": "Vorheriger Monat",
  "usage.nextMonth": "Nächster Monat",
};

const es: Record<Keys, string> = {
  "usage.previousMonth": "Mes anterior",
  "usage.nextMonth": "Mes siguiente",
};

const fr: Record<Keys, string> = {
  "usage.previousMonth": "Mois précédent",
  "usage.nextMonth": "Mois suivant",
};

const it: Record<Keys, string> = {
  "usage.previousMonth": "Mese precedente",
  "usage.nextMonth": "Mese successivo",
};

const ja: Record<Keys, string> = {
  "usage.previousMonth": "前の月",
  "usage.nextMonth": "次の月",
};

const ko: Record<Keys, string> = {
  "usage.previousMonth": "이전 달",
  "usage.nextMonth": "다음 달",
};

const nl: Record<Keys, string> = {
  "usage.previousMonth": "Vorige maand",
  "usage.nextMonth": "Volgende maand",
};

const pl: Record<Keys, string> = {
  "usage.previousMonth": "Poprzedni miesiąc",
  "usage.nextMonth": "Następny miesiąc",
};

const pt: Record<Keys, string> = {
  "usage.previousMonth": "Mês anterior",
  "usage.nextMonth": "Próximo mês",
};

const ru: Record<Keys, string> = {
  "usage.previousMonth": "Предыдущий месяц",
  "usage.nextMonth": "Следующий месяц",
};

const tr: Record<Keys, string> = {
  "usage.previousMonth": "Önceki ay",
  "usage.nextMonth": "Sonraki ay",
};

const zh: Record<Keys, string> = {
  "usage.previousMonth": "上个月",
  "usage.nextMonth": "下个月",
};

export const chatPolishMessages = { en, de, es, fr, it, ja, ko, nl, pl, pt, ru, tr, zh };
