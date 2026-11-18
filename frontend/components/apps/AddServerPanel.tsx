"use client";

// Add a server (design: Apps.html), three steps on the custom MCP endpoints:
//   1 Details: name, address, sign-in. Continue saves it as a draft (POST, or PATCH when going back).
//   2 Test: sign in when it uses OAuth, then POST /test; shows the name the server reports and its tools.
//   3 Turn on and grant: POST /enable, then exact per-agent tool grants.
// A draft stays off and no agent can use it until it is tested, turned on and granted.
import { Check, X } from "lucide-react";
import { useCallback, useState, type RefObject } from "react";
import { api } from "@/lib/api";
import {
  canGrant, createBody, EMPTY_SERVER_FORM, formFor, formReady, problemOf, serverStart, shownTools, testPassed,
  type Problem, type ServerForm as Form,
} from "@/lib/apps-page";
import { buildUpdate, DIRECT_TOOL_LIMIT, type CustomMcpConnection, type CustomMcpTool } from "@/lib/custom-mcp";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { useLeaveGuard } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import { ServerForm } from "./ServerForm";
import { ToolGrants, useDiscardGuard } from "./ToolGrants";
import { ProblemBanner, WithStrong, useCount, type AgentOption } from "./shared";
import type { CustomServers } from "./useServers";

type Step = 0 | 1 | 2;
const STEP_KEYS = ["apps.add.step.details", "apps.add.step.test", "apps.add.step.grant"] as const;
const NAME_MARK = "\u0000";

// POST /test, then the tools that test found.
async function testAndList(server: CustomMcpConnection): Promise<{ next: CustomMcpConnection; found: CustomMcpTool[] }> {
  const next = await api.testCustomMcp(server.id, server.revision);
  return { next, found: await api.getCustomMcpTools(next.id) };
}

// The design's stepper for this flow: a green tick for a done step, the accent for the current one.
function Steps({ current }: { current: Step }) {
  const t = useT();
  return (
    <ol aria-label={t("apps.add.steps")} className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {STEP_KEYS.map((key, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={key} aria-current={active ? "step" : undefined} className="flex items-center gap-2 text-label font-medium">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-small font-semibold",
                done && "bg-success-bg text-success-on",
                active && "bg-accent text-accent-fg",
                !done && !active && "bg-inset text-muted",
              )}
            >
              {done ? <Check size={13} strokeWidth={2.5} /> : index + 1}
            </span>
            <span className={done || active ? "text-ink" : "text-muted"}>
              {t(key)}
              <span className="sr-only"> {t(done ? "apps.add.stepDone" : active ? "apps.add.stepCurrent" : "apps.add.stepTodo")}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function AddServerPanel({ servers, agents, onClose, headingRef }: {
  servers: CustomServers;
  agents: AgentOption[] | null;
  onClose: () => void;
  // The page scrolls to and focuses the heading when the panel opens.
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const t = useT();
  const count = useCount();
  const { list: serverList, put, reload, signingIn: signingInId, startSignIn } = servers;
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<Form>(EMPTY_SERVER_FORM);
  const [draftId, setDraftId] = useState<string | null>(null);
  const draft = serverList?.find((item) => item.id === draftId) ?? null;
  const [busy, setBusy] = useState<"save" | "test" | "signin" | "on" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [failed, setFailed] = useState(false);
  const [tools, setTools] = useState<CustomMcpTool[] | null>(null);

  const saved = draft ? formFor(draft) : EMPTY_SERVER_FORM;
  const dirty = step === 0 && (Object.keys(form) as (keyof Form)[]).some((key) => form[key] !== saved[key]);
  useLeaveGuard(dirty);
  const passed = draft !== null && testPassed(draft);
  // Closing asks first while the grants have unsaved ticks.
  const guard = useDiscardGuard(onClose);

  const go = (next: Step) => { setProblem(null); setStep(next); };

  const runTest = async (server: CustomMcpConnection) => {
    setBusy("test"); setProblem(null); setFailed(false);
    try {
      const { next, found } = await testAndList(server);
      put(next);
      setTools(found);
    } catch (err) {
      setProblem(problemOf(err, "apps.error.generic"));
      setFailed(true);
      setTools(null);
      // A failed test changes the server's state (and revision): read it again before Test again
      // is offered, or that test would send the old revision.
      await reload().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  // Continue saves the details (POST for a new draft, PATCH when you came back and changed them)
  // and moves to Test. A server that can already sign in is tested at once; one that passed before
  // and did not change keeps its result.
  const saveDetails = async () => {
    setBusy("save"); setProblem(null);
    let next: CustomMcpConnection;
    let changed = true;
    try {
      if (!draft) next = await api.createCustomMcp(createBody(form));
      else {
        const body = buildUpdate(draft, form);
        changed = body !== null;
        next = body ? await api.updateCustomMcp(draft.id, body) : draft;
      }
    } catch (err) {
      setProblem(problemOf(err, "apps.error.generic"));
      setBusy(null);
      return;
    }
    put(next);
    setDraftId(next.id);
    // Once saved, the secret leaves this page: going back shows an empty field that keeps it.
    setForm(formFor(next));
    if (changed) { setTools(null); setFailed(false); }
    setBusy(null);
    go(1);
    if (serverStart(next) !== "test") return;
    if (!testPassed(next)) await runTest(next);
    else if (changed || tools === null) setTools(await api.getCustomMcpTools(next.id).catch(() => null));
  };

  const signIn = async (server: CustomMcpConnection) => {
    setBusy("signin"); setProblem(null);
    const failure = await startSignIn(server);
    if (failure) setProblem(failure);
    setBusy(null);
  };

  const turnOn = async (server: CustomMcpConnection) => {
    setBusy("on"); setProblem(null);
    try {
      const next = await api.setCustomMcpEnabled(server.id, server.revision, true);
      put(next);
      if (!tools) setTools(await api.getCustomMcpTools(next.id));
    } catch (err) {
      setProblem(problemOf(err, "apps.error.generic"));
    } finally {
      setBusy(null);
    }
  };

  const loadGrants = useCallback(async (agentId: number) => {
    if (!draftId) return [];
    return (await api.getCustomMcpGrants(draftId, agentId)).tool_names;
  }, [draftId]);
  // Grants are saved against the server's current revision; the list is read again after.
  const saveGrants = useCallback(async (agentId: number, exact: { name: string; schema_digest: string }[]) => {
    const server = serverList?.find((item) => item.id === draftId);
    if (!server) return;
    await api.saveCustomMcpGrants(server.id, agentId, server.revision, exact);
    await reload();
  }, [draftId, serverList, reload]);

  const start = draft ? serverStart(draft) : null;
  const signingIn = draft !== null && signingInId === draft.id;
  const list = tools ? shownTools(tools) : null;

  return (
    <section aria-labelledby="add-server-title" className="flex w-full max-w-[720px] flex-col gap-4 rounded-card bg-raised p-4 shadow-float sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="add-server-title" ref={headingRef} tabIndex={-1} className="scroll-mt-4 text-h3 font-semibold text-ink outline-none">{t("apps.add.title")}</h2>
        <IconButton label={t("common.close")} onClick={guard.request}><X size={16} aria-hidden="true" /></IconButton>
      </div>
      <Steps current={step} />

      {problem && <ProblemBanner problem={problem} onDismiss={() => setProblem(null)} />}

      {step === 0 && (
        <>
          <ServerForm form={form} onChange={setForm} hasSecret={draft?.credential_configured ?? false} disabled={busy !== null} />
          <p className="text-small text-muted">{t("apps.add.draftNote")}</p>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy !== null} onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" loading={busy === "save"} disabled={!formReady(form) || busy !== null} onClick={() => void saveDetails()}>{t("apps.add.continue")}</Button>
          </div>
        </>
      )}

      {step === 1 && draft && (
        <>
          <div className="flex flex-col gap-2.5 rounded-field bg-inset p-3.5" aria-live="polite" aria-busy={busy === "test" || undefined}>
            {start === "signIn" && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-body text-ink">{t("apps.add.signInFirst", { name: draft.name })}</p>
                <Button loading={busy === "signin"} disabled={signingIn || busy !== null} onClick={() => void signIn(draft)}>
                  {signingIn ? t("apps.servers.waitingSignIn") : t("apps.servers.signIn")}
                </Button>
              </div>
            )}
            {start === "addSecret" && <p className="text-body text-ink">{t("apps.add.secretFirst")}</p>}
            {start === "test" && busy === "test" && (
              <p className="flex items-center gap-2 text-body text-muted"><Spinner size={14} label="" />{t("apps.servers.testing")}</p>
            )}
            {start === "test" && busy !== "test" && passed && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status="done">{t("apps.add.testPassed")}</StatusPill>
                  <span className="text-body text-ink">
                    {draft.server_name
                      ? <WithStrong text={t("apps.add.reportsName", { name: NAME_MARK })} marker={NAME_MARK} value={draft.server_name} />
                      : t("apps.add.noName")}
                  </span>
                </div>
                {draft.server_name && <p className="text-small text-muted">{t("apps.add.claimNote")}</p>}
                <p className="text-small font-medium text-muted">{t("apps.add.toolsFound")} · {count("apps.servers.tools", draft.tool_count ?? tools?.length ?? 0)}</p>
                {list && list.shown.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {list.shown.map((tool) => (
                      <li key={tool.name} title={tool.description || undefined} className="max-w-full truncate rounded-full bg-hover px-2 py-0.5 font-mono text-small text-gray-on">{tool.name}</li>
                    ))}
                    {list.more > 0 && <li className="px-1 py-0.5 text-small text-muted">{t("apps.add.moreTools", { n: list.more })}</li>}
                  </ul>
                )}
                {list && list.shown.length === 0 && <p className="text-small text-muted">{t("apps.grants.noTools")}</p>}
              </>
            )}
            {start === "test" && busy !== "test" && !passed && !failed && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-body text-ink">{t("apps.add.readyToTest")}</p>
                <Button disabled={busy !== null} onClick={() => void runTest(draft)}>{t("apps.servers.test")}</Button>
              </div>
            )}
            {start === "test" && busy !== "test" && !passed && failed && (
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status="denied">{t("apps.add.testFailed")}</StatusPill>
                <span className="text-body text-muted">{t("apps.add.testFailedHint")}</span>
              </div>
            )}
            <p className="break-all font-mono text-small text-muted">{draft.endpoint}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy !== null} onClick={() => go(0)}>{t("apps.add.back")}</Button>
            <div className="flex flex-wrap gap-2">
              {start === "test" && (failed || passed) && (
                <Button disabled={busy !== null} onClick={() => void runTest(draft)}>{t("apps.add.testAgain")}</Button>
              )}
              <Button variant="primary" disabled={!passed || busy !== null} onClick={() => go(2)}>{t("apps.add.continue")}</Button>
            </div>
          </div>
        </>
      )}

      {step === 2 && draft && (
        <>
          {!draft.enabled ? (
            <>
              <p className="text-body text-ink">{t("apps.add.turnOnBody")}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy !== null} onClick={() => go(1)}>{t("apps.add.back")}</Button>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy !== null} onClick={onClose}>{t("apps.add.notNow")}</Button>
                  <Button variant="primary" loading={busy === "on"} disabled={busy !== null || !testPassed(draft)} onClick={() => void turnOn(draft)}>{t("apps.servers.turnOn")}</Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status="done">{t("apps.servers.status.on")}</StatusPill>
                <span className="text-body text-ink">{t("apps.add.isOn")}</span>
              </div>
              <p className="text-small text-muted">{t("apps.grants.intro")} {t("apps.grants.customScope")}</p>
              {canGrant(draft) && tools
                ? <ToolGrants tools={tools} agents={agents} load={loadGrants} save={saveGrants} searchLimit={DIRECT_TOOL_LIMIT} onDirtyChange={guard.onDirtyChange} />
                : busy !== null ? <Spinner size={16} label={t("common.loading")} /> : null}
              <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                <Button onClick={guard.request}>{t("apps.add.done")}</Button>
              </div>
            </>
          )}
        </>
      )}
      {guard.dialog}
    </section>
  );
}
