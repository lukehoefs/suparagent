"use client";

// Export agent file… in the agent settings More menu (admin only, like GET /agents/{id}/export):
// downloads the agent as a .agent.json file, optionally with its notes and skills, and says what
// the file holds, what was replaced as a secret and what did not fit.
import { useState } from "react";
import { api, type Agent } from "@/lib/api";
import { agentFileText } from "@/lib/agents";
import { joinList } from "@/lib/agent-profile-extras";
import { LANGUAGE_TAGS, resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog } from "@/components/ui/Dialog";

// The parts the server names in `redacted` (services/agent_package.py).
const PART_KEYS: Record<string, string> = {
  title: "agentProfile.field.title",
  description: "agentProfile.field.description",
  instructions: "agentProfile.field.instructions",
  conversational_style: "agentProfile.field.conversational_style",
  notes: "agentProfile.export.partNotes",
  "topic notes": "agentProfile.export.partTopicNotes",
  skills: "agentProfile.export.partSkills",
};

function saveFile(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useT();
  const tag = LANGUAGE_TAGS[resolveLocale(useLanguageChoice())];
  const [notes, setNotes] = useState(false);
  const [skills, setSkills] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ file: string; redacted: string[]; skipped: string[] } | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await api.exportAgentFile(agent.id, { notes, skills });
      saveFile(result.file_name, agentFileText(result.document));
      setDone({ file: result.file_name, redacted: result.redacted, skipped: result.skipped ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agentSettings.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const parts = (names: string[]) => joinList(tag, names.map((name) => (PART_KEYS[name] ? t(PART_KEYS[name]) : name)));

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      title={t("agentProfile.export.title", { name: agent.name })}
      description={t("agentProfile.export.body", { name: agent.name })}
      footer={
        <>
          <Button disabled={busy} onClick={onClose}>{done ? t("common.close") : t("common.cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={() => void download()}>{t("agentProfile.export.download")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-small text-ink">{t("agentProfile.export.contains")}</p>
        <div className="flex flex-col gap-3">
          <Checkbox
            label={t("agentProfile.export.notes")}
            description={t("agentProfile.export.notesHint")}
            checked={notes}
            disabled={busy}
            onChange={(event) => { setNotes(event.target.checked); setDone(null); }}
          />
          <Checkbox
            label={t("agentProfile.export.skills")}
            description={t("agentProfile.export.skillsHint", { name: agent.name })}
            checked={skills}
            disabled={busy}
            onChange={(event) => { setSkills(event.target.checked); setDone(null); }}
          />
        </div>
        <p className="text-small text-muted">{t("agentProfile.export.secrets")}</p>
        {done && (
          <Banner tone="success" title={t("agentProfile.export.done", { file: done.file })}>
            {[
              done.redacted.length > 0 ? t("agentProfile.export.redacted", { parts: parts(done.redacted) }) : "",
              done.skipped.length > 0 ? t("agentProfile.export.skipped", { items: done.skipped.join(", ") }) : "",
            ].filter(Boolean).join(" ") || null}
          </Banner>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </Dialog>
  );
}
