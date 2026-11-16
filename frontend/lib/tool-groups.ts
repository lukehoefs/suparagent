// Group a server's tools by the app they act on (Gmail, Google Sheets, Google Drive...), so a big
// Activepieces or Composio server reads as a few clear sections instead of one long list.

const APPS: readonly [label: string, pattern: RegExp][] = [
  ["Gmail", /gmail/i],
  ["Outlook", /outlook|microsoft[_\- ]?mail/i],
  ["Google Sheets", /google[_\- ]?sheets?|(^|[_\-.])sheets?([_\-.]|$)|spreadsheet/i],
  ["Google Drive", /google[_\- ]?drive|(^|[_\-.])drive([_\-.]|$)/i],
  ["Google Calendar", /google[_\- ]?calendar|(^|[_\-.])calendar([_\-.]|$)/i],
  ["Google Docs", /google[_\- ]?docs?|(^|[_\-.])docs?([_\-.]|$)/i],
  ["Slack", /slack/i],
  ["HubSpot", /hubspot/i],
  ["GitHub", /github/i],
  ["Notion", /notion/i],
  ["Airtable", /airtable/i],
  ["Web search", /searx|web[_\- ]?search|web_url_read|search_suggestions/i],
  ["Computer", /^computer_/i],
];

const titleCase = (s: string) => s.replace(/[_\-.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/** The app a tool belongs to: a known app from its name, else its name prefix, else "Other". */
export function appOf(name: string): string {
  for (const [label, pattern] of APPS) if (pattern.test(name)) return label;
  const prefix = name.split(/[_\-.:]/)[0];
  return prefix && prefix.length >= 3 && prefix !== name ? titleCase(prefix) : "Other";
}

/** Tools grouped by app, groups sorted by name with "Other" last; tool order kept within a group. */
export function groupByApp<T extends { name: string }>(tools: readonly T[]): { app: string; tools: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const tool of tools) {
    const app = appOf(tool.name);
    if (!groups.has(app)) groups.set(app, []);
    groups.get(app)!.push(tool);
  }
  return [...groups]
    .map(([app, list]) => ({ app, tools: list }))
    .sort((a, b) => (a.app === "Other" ? 1 : b.app === "Other" ? -1 : a.app.localeCompare(b.app)));
}
