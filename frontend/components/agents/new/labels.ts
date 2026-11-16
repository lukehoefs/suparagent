import { APPROVAL_MODES, approvalModeLabel } from "@/lib/agents";

type Translate = (key: string, params?: Record<string, string | number>) => string;

// The approval modes in the reader's language. lib/agents.ts holds the English originals; a mode this
// table does not know falls back to them.
const MODE_KEYS: Record<string, { label: string; description: string }> = {
  ask: { label: "newAgent.modeAsk", description: "newAgent.modeAskInfo" },
  accept_edits: { label: "newAgent.modeAcceptEdits", description: "newAgent.modeAcceptEditsInfo" },
  approve_for_me: { label: "newAgent.modeApproveForMe", description: "newAgent.modeApproveForMeInfo" },
  plan: { label: "newAgent.modePlan", description: "newAgent.modePlanInfo" },
};

export function approvalModeText(t: Translate, mode: string): { label: string; description: string } {
  const keys = MODE_KEYS[mode];
  if (keys) return { label: t(keys.label), description: t(keys.description) };
  return { label: approvalModeLabel(mode), description: APPROVAL_MODES.find((item) => item.value === mode)?.description ?? "" };
}

// A connected app's access level, as ConnectedAppsSection names it.
export function appLevelText(t: Translate, level: string): string {
  return level === "write" ? t("newAgent.levelWrite") : t("newAgent.levelRead");
}
