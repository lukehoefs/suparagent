// Copy for the /agents pages (UI redesign, phase 3). Every key needs all 13 locales: tsc checks
// each table against `en`. Registered in lib/i18n.ts (supplementalCatalogs).
const en = {
} as const;
type Keys = keyof typeof en;

const de: Record<Keys, string> = {
};
const es: Record<Keys, string> = {
};
const fr: Record<Keys, string> = {
};
const it: Record<Keys, string> = {
};
const ja: Record<Keys, string> = {
};
const ko: Record<Keys, string> = {
};
const nl: Record<Keys, string> = {
};
const pl: Record<Keys, string> = {
};
const pt: Record<Keys, string> = {
};
const ru: Record<Keys, string> = {
};
const tr: Record<Keys, string> = {
};
const zh: Record<Keys, string> = {
};

export const agentsRosterMessages = { en, de, es, fr, it, ja, ko, nl, pl, pt, ru, tr, zh };
