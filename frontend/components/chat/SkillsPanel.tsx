"use client";

// An agent's skills: Markdown instructions the person writes, imports or saves from a finished
// conversation, reviews and switches on. A skill only reaches a conversation when the person
// picks it for a message (the Composer's skill picker); nothing here sends or runs anything.
// Shown in the chat's Skills inspector (layout "panel") and as the Skills tab of the agent
// settings page (layout "page": list beside the open editor on wide screens).
import { useCallback, useEffect, useId, useState } from "react";
import { api, type Agent } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import {
  isSkillName,
  parseTriggers,
  skillErrorText,
  skillSkeleton,
  slugSkillName,
  sourceLabel,
  SKILL_NAME_MAX,
  type SkillSource,
  type SkillSummary,
  type SkillLearnSource,
} from "@/lib/skills";
import { LIBRARY_CATEGORIES, LIBRARY_SOURCE, SKILL_LIBRARY, type LibraryCategory, type LibrarySkill } from "@/lib/skill-library";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import { Switch } from "@/components/ui/Switch";

// The backend keeps at most this many skills per agent (agent_skills.MAX_SKILLS).
const MAX_AGENT_SKILLS = 30;

const LABEL = "block text-xs text-muted";

type Draft = {
  // Null while a new skill has no name yet or a name that is still being edited.
  existing: string | null;
  name: string;
  description: string;
  body: string;
  enabled: boolean;
  source: SkillSource;
  warnings: string[];
  redacted: number;
  learnedFrom?: SkillLearnSource;
};

// What the open editor started from, so leaving it can tell whether anything was typed.
type Baseline = { name: string; description: string; body: string; enabled: boolean; triggers: string };

type Import = { text: string; error: string | null };

const baselineOf = (draft: Draft, triggers: string): Baseline => ({
  name: draft.existing ?? draft.name, description: draft.description, body: draft.body, enabled: draft.enabled, triggers,
});

export function SkillsPanel({
  agent,
  learnFrom = null,
  onChanged,
  onDirtyChange,
  layout = "panel",
}: {
  agent: Agent;
  // The server prepares a draft from this completed turn. Nothing is saved on open.
  learnFrom?: SkillLearnSource | null;
  onChanged?: () => void;
  // Told whether an open editor or import holds unsaved text.
  onDirtyChange?: (dirty: boolean) => void;
  layout?: "panel" | "page";
}) {
  const t = useT();
  const headingId = useId();
  const agentId = agent.id;
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [receipt, setReceipt] = useState<{ name: string; revision: string } | null>(null);
  const [importing, setImporting] = useState<Import | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [triggersText, setTriggersText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryCategory, setLibraryCategory] = useState<LibraryCategory | "All">("All");
  const [libraryQuery, setLibraryQuery] = useState("");

  const openDraft = (next: Draft, triggers: string) => {
    setTriggersText(triggers);
    setDraft(next);
    setBaseline(baselineOf(next, triggers));
  };
  const closeDraft = () => {
    setDraft(null);
    setBaseline(null);
  };

  const load = useCallback(async () => {
    try {
      setSkills(await api.listSkills(agentId));
      setError(null);
    } catch (err) {
      setSkills([]);
      setError(skillErrorText(err));
    }
  }, [agentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const sourceThreadId = learnFrom?.thread_id;
  const sourceTurnId = learnFrom?.turn_id;
  useEffect(() => {
    if (sourceThreadId === undefined || sourceTurnId === undefined) return;
    let live = true;
    api.learnSkill(agentId, { thread_id: sourceThreadId, turn_id: sourceTurnId }).then(
      (preview) => {
        if (!live) return;
        const next: Draft = { existing: null, ...preview, enabled: false, source: "learned", learnedFrom: { thread_id: preview.thread_id, turn_id: preview.turn_id } };
        setDraft(next);
        setBaseline(baselineOf(next, ""));
      },
      (err) => { if (live) setError(skillErrorText(err)); },
    );
    return () => { live = false; };
  }, [agentId, sourceThreadId, sourceTurnId]);

  const draftDirty = draft !== null && baseline !== null && JSON.stringify(baselineOf(draft, triggersText)) !== JSON.stringify(baseline);
  const dirty = draftDirty || (importing !== null && importing.text.trim() !== "");
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const undo = async () => {
    if (!receipt) return;
    setBusy(true);
    setError(null);
    try {
      await api.undoLearnedSkill(agentId, receipt.name, receipt.revision);
      if (draft?.existing === receipt.name) closeDraft();
      setReceipt(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(skillErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => {
    setImporting(null);
    openDraft({ existing: null, ...skillSkeleton(), enabled: false, source: "user", warnings: [], redacted: 0 }, "");
  };

  const open = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const doc = await api.getSkill(agentId, name);
      openDraft({ existing: name, ...doc }, (doc.triggers ?? []).join(", "));
    } catch (err) {
      setError(skillErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (skill: SkillSummary) => {
    setBusy(true);
    setError(null);
    try {
      const doc = await api.getSkill(agentId, skill.name);
      await api.saveSkill(agentId, skill.name, { description: doc.description, body: doc.body, enabled: !skill.enabled, source: doc.source });
      // An editor open on this skill follows the switch, so saving it later keeps the new state.
      setDraft((current) => (current?.existing === skill.name ? { ...current, enabled: !skill.enabled } : current));
      setBaseline((current) => (current && current.name === skill.name ? { ...current, enabled: !skill.enabled } : current));
      await load();
      onChanged?.();
    } catch (err) {
      setError(skillErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    const name = draft.existing ?? draft.name;
    setBusy(true);
    setError(null);
    try {
      const learned = draft.existing === null ? draft.learnedFrom : undefined;
      const doc = learned
        ? await api.saveLearnedSkill(agentId, name, { ...learned, description: draft.description.trim(), body: draft.body, reviewed })
        : await api.saveSkill(agentId, name, {
          description: draft.description.trim(), body: draft.body, enabled: draft.enabled, source: draft.source,
          triggers: parseTriggers(triggersText),
        });
      if (learned) setReceipt({ name, revision: doc.revision });
      // What was saved can differ (secrets are removed); show it so the person sees the result.
      openDraft({ existing: name, ...doc }, (doc.triggers ?? []).join(", "));
      await load();
      onChanged?.();
    } catch (err) {
      setError(skillErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteSkill(agentId, name);
      setConfirming(null);
      if (draft?.existing === name) closeDraft();
      await load();
      onChanged?.();
    } catch (err) {
      setError(skillErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  // Adds a library skill to this agent, switched on. It still runs only when picked for a message.
  const addFromLibrary = async (item: LibrarySkill) => {
    setBusy(true);
    setError(null);
    try {
      await api.saveSkill(agentId, item.name, { description: item.description, body: item.body, enabled: true, source: LIBRARY_SOURCE });
      await load();
      onChanged?.();
    } catch (err) {
      setError(skillErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    if (!importing || !importing.text.trim()) return;
    setBusy(true);
    setImporting({ ...importing, error: null });
    try {
      const p = await api.previewSkill(agentId, importing.text);
      // Imported skills always start switched off; the person reviews, then switches one on.
      openDraft({ existing: null, name: p.name, description: p.description, body: p.body, enabled: false, source: "imported", warnings: p.warnings, redacted: 0 }, "");
      setImporting(null);
    } catch (err) {
      setImporting({ ...importing, error: skillErrorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const nameValid = draft ? (draft.existing !== null || isSkillName(draft.name)) : false;
  const taken = draft !== null && draft.existing === null && (skills ?? []).some((s) => s.name === draft.name);
  const canSave = draft !== null && !busy && nameValid && !taken && draft.body.trim() !== "" && draft.description.trim() !== "" && (!draft.learnedFrom || reviewed);
  const page = layout === "page";

  const library = libraryOpen && (() => {
    const owned = new Set((skills ?? []).map((s) => s.name));
    const full = (skills ?? []).length >= MAX_AGENT_SKILLS;
    const q = libraryQuery.trim().toLowerCase();
    const shown = SKILL_LIBRARY.filter((s) =>
      (libraryCategory === "All" || s.category === libraryCategory) &&
      (!q || s.name.includes(q) || s.description.toLowerCase().includes(q)));
    return (
      <Card aria-label="Skill library" className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder={`Search ${SKILL_LIBRARY.length} skills`}
            value={libraryQuery}
            onChange={(e) => setLibraryQuery(e.target.value)}
            aria-label="Search the skill library"
          />
          <Select
            className="w-48"
            value={libraryCategory}
            onChange={(e) => setLibraryCategory(e.target.value as LibraryCategory | "All")}
            aria-label="Skill category"
          >
            <option value="All">All categories</option>
            {LIBRARY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <span className="text-xs text-muted">{(skills ?? []).length}/{MAX_AGENT_SKILLS} skills on {agent.name}</span>
        </div>
        {full && <p className="text-xs text-warning">{agent.name} has the maximum of {MAX_AGENT_SKILLS} skills. Delete one to add another.</p>}
        <ul className={cn("divide-y divide-line overflow-y-auto", page ? "max-h-[32rem]" : "max-h-80")}>
          {shown.map((item) => (
            <li key={item.name} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium"><span className="font-mono">/{item.name}</span> <span className="text-xs font-normal text-muted">· {item.category}</span></div>
                <p className="text-xs text-muted">{item.description}</p>
              </div>
              {owned.has(item.name)
                ? <span className="shrink-0 text-xs text-muted">Added</span>
                : <Button size="sm" disabled={busy || full} onClick={() => void addFromLibrary(item)}>Add</Button>}
            </li>
          ))}
          {shown.length === 0 && <li className="py-2 text-xs text-muted">No skills match.</li>}
        </ul>
      </Card>
    );
  })();

  const importBox = importing && (
    <Card className="space-y-2 p-3">
      <label className={LABEL} htmlFor="skill-import">Paste the contents of a SKILL.md file</label>
      <Textarea
        id="skill-import"
        className="min-h-32 font-mono text-xs"
        value={importing.text}
        onChange={(e) => setImporting({ text: e.target.value, error: null })}
        placeholder={"---\nname: weekly-report\ndescription: Summarise the week\n---\n\nSteps…"}
      />
      {importing.error && <p role="alert" className="text-xs text-danger">{importing.error}</p>}
      <div className="flex gap-2">
        {/* An open editor holds the view's one primary button (Save skill). */}
        <Button variant={draft ? "secondary" : "primary"} onClick={() => void preview()} disabled={busy || !importing.text.trim()}>Review</Button>
        <Button onClick={() => setImporting(null)} disabled={busy}>Cancel</Button>
      </div>
    </Card>
  );

  const editor = draft && (
    <Card className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{draft.existing === null ? "New skill" : "Editing"} · {sourceLabel(draft.source)}</span>
        <span>{draft.enabled ? "On" : "Off"}</span>
      </div>
      {draft.warnings.length > 0 && (
        <ul role="status" className="list-disc space-y-0.5 pl-5 text-xs text-warning">
          {draft.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      {draft.redacted > 0 && (
        <p role="status" className="text-xs text-warning">
          {draft.redacted} secret-like {draft.redacted === 1 ? "value was" : "values were"} removed from the saved text.
        </p>
      )}
      <label className={LABEL} htmlFor="skill-name">Name</label>
      <Input
        id="skill-name"
        className="font-mono"
        value={draft.existing ?? draft.name}
        disabled={draft.existing !== null}
        maxLength={SKILL_NAME_MAX}
        onChange={(e) => setDraft({ ...draft, name: slugSkillName(e.target.value) })}
        placeholder="expense-review"
      />
      {draft.existing === null && draft.name !== "" && taken && <p className="text-xs text-danger">A skill with this name already exists.</p>}
      {draft.existing === null && draft.name === "" && <p className="text-xs text-muted">Lowercase letters, digits and hyphens.</p>}
      <label className={LABEL} htmlFor="skill-description">Description (one line, shown in the picker)</label>
      <Input
        id="skill-description"
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />
      <label className={LABEL} htmlFor="skill-triggers">Trigger phrases (optional, comma separated; suggests this skill when a message contains one)</label>
      <Input
        id="skill-triggers"
        value={triggersText}
        disabled={!!draft.learnedFrom && draft.existing === null}
        onChange={(e) => setTriggersText(e.target.value)}
        placeholder="weekly report, status update"
      />
      <label className={LABEL} htmlFor="skill-body">Instructions (Markdown)</label>
      <Textarea
        id="skill-body"
        className="min-h-64 font-mono text-xs"
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
      />
      {draft.learnedFrom && (
        <>
          <p className="text-xs text-muted">Source: conversation {draft.learnedFrom.thread_id}, turn {draft.learnedFrom.turn_id}. Only the request and result were copied; review the reference and replace the workflow sections.</p>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" className="accent-(--accent)" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
            I reviewed the reusable steps, inputs, validation and approval boundary.
          </label>
        </>
      )}
      <div className="flex items-center gap-2 py-1 text-xs text-muted">
        <Switch
          checked={draft.enabled}
          disabled={!!draft.learnedFrom}
          onChange={(enabled) => setDraft({ ...draft, enabled })}
          label="Available to pick in conversations"
        />
        <span aria-hidden="true">Available to pick in conversations</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void save()} disabled={!canSave} loading={busy}>Save skill</Button>
        <Button onClick={closeDraft} disabled={busy}>Close</Button>
      </div>
    </Card>
  );

  const list = skills === null ? (
    <SkeletonList rows={3} />
  ) : skills.length === 0 ? (
    <p className="text-xs text-muted">{t("agentTeam.skillsEmpty")}</p>
  ) : (
    <ul className="space-y-2">
      {skills.map((skill) => (
        // The command and the row's actions (switch, Edit, Delete) share the top line, actions grouped
        // on the right; the description and source run the card's full width below, so a narrow
        // panel gives the words the room instead of squeezing them beside the buttons. A long
        // command shortens with an ellipsis (its whole name on hover) rather than breaking mid-word.
        <li key={skill.name} className={cn("rounded-card border border-line bg-raised px-3 py-2.5", draft?.existing === skill.name && "border-accent")}>
          <div className="flex min-w-0 items-center gap-2">
            <span title={`/${skill.name}`} className="min-w-0 flex-1 truncate whitespace-nowrap font-mono text-label font-medium text-ink">
              /{skill.name}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <Switch
                checked={skill.enabled}
                disabled={busy}
                onChange={() => void toggle(skill)}
                label={`/${skill.name}`}
                className="mr-1"
              />
              {confirming === skill.name ? (
                <>
                  <Button size="sm" variant="danger" onClick={() => void remove(skill.name)} disabled={busy}>Delete</Button>
                  <Button size="sm" onClick={() => setConfirming(null)} disabled={busy}>Keep</Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => void open(skill.name)} disabled={busy}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(skill.name)} disabled={busy}>Delete…</Button>
                </>
              )}
            </div>
          </div>
          {skill.description && <p className="mt-1 break-words text-small text-muted">{skill.description}</p>}
          <p className="mt-0.5 text-small text-faint">{sourceLabel(skill.source)} · {skill.enabled ? "on" : "off"}</p>
        </li>
      ))}
    </ul>
  );

  const side = library || importBox || editor ? <>{library}{importBox}{editor}</> : null;

  return (
    <section aria-labelledby={headingId} className={cn(page ? "flex flex-col gap-4" : "space-y-3 border-t border-line pt-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {page
            ? <h2 id={headingId} className="text-h3 font-semibold text-ink">Skills</h2>
            : <h3 id={headingId} className="text-sm font-semibold">Skills</h3>}
          <p className={cn("text-muted", page ? "mt-0.5 text-small" : "mt-1 text-xs")}>
            Saved instructions for {agent.name}. A skill is used only when you pick it for a message; it never starts on its own,
            and importing one does not switch it on.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setLibraryOpen((v) => !v)} disabled={busy} aria-expanded={libraryOpen}>
            {libraryOpen ? "Close library" : "Skill library"}
          </Button>
          <Button size="sm" onClick={startNew} disabled={busy}>New skill</Button>
          <Button size="sm" onClick={() => { closeDraft(); setImporting({ text: "", error: null }); }} disabled={busy}>
            Import SKILL.md
          </Button>
        </div>
      </div>
      {receipt && (
        <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Saved /{receipt.name} switched off. Test it on a second input before routine use.</span>
          <Button size="sm" disabled={busy} onClick={() => void undo()}>Undo save</Button>
        </div>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
      {page ? (
        <div className={cn("grid gap-4", side && "lg:grid-cols-2")}>
          <div className="min-w-0">{list}</div>
          {side && <div className="min-w-0 space-y-3">{side}</div>}
        </div>
      ) : (
        <>
          {side}
          {list}
        </>
      )}
    </section>
  );
}
