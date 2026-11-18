"use client";

// The routine's connected-app grants: exact actions, each bound to one connected account the
// agent may already use. Reads, and the few writes the backend authorizes per routine, each one
// chosen on purpose. Nothing is granted by default.
import type { Agent, ConnectedAppGrant } from "@/lib/api";
import type { ComposioAccount } from "@/lib/connected-apps";
import {
  appScope,
  clearAllGrants,
  groupAccount,
  hasAppGrants,
  ROUTINE_APP_TOOLS,
  routineAppAccounts,
  selectAllGrants,
  selectableTools,
  setGroupAccount,
  toggleGrant,
  toolLabelKey,
  type RoutineAppGroup,
} from "@/lib/routines-page";
import { useT } from "@/lib/use-i18n";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, Select } from "@/components/ui/Input";

export function AppAccessFields({
  grants,
  agent,
  accounts,
  onChange,
}: {
  grants: ConnectedAppGrant[];
  agent: Agent | undefined;
  // null while the connected accounts load.
  accounts: ComposioAccount[] | null;
  onChange: (next: ConnectedAppGrant[]) => void;
}) {
  const t = useT();
  const selectable = selectableTools(agent, accounts);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-muted">{t("knowledgeRoutines.connectedAppAccessHelp")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={selectable.size === 0} onClick={() => onChange(selectAllGrants(grants, agent, accounts))}>
          {t("knowledgeRoutines.selectAllActions")}
        </Button>
        <Button size="sm" variant="ghost" disabled={!hasAppGrants(grants)} onClick={() => onChange(clearAllGrants(grants))}>
          {t("knowledgeRoutines.clearAllActions")}
        </Button>
      </div>
      {accounts === null ? (
        <p role="status" className="text-small text-muted">{t("routines.apps.loading")}</p>
      ) : (
        ROUTINE_APP_TOOLS.map((group) => (
          <AppGroup key={group.app} group={group} grants={grants} agent={agent} accounts={accounts} onChange={onChange} />
        ))
      )}
    </div>
  );
}

function AppGroup({
  group,
  grants,
  agent,
  accounts,
  onChange,
}: {
  group: RoutineAppGroup;
  grants: ConnectedAppGrant[];
  agent: Agent | undefined;
  accounts: ComposioAccount[];
  onChange: (next: ConnectedAppGrant[]) => void;
}) {
  const t = useT();
  const available = routineAppAccounts(agent, accounts, group.app);
  const tools = new Set<string>([...group.reads, ...group.writes]);
  const inGroup = grants.filter((grant) => tools.has(grant.tool));
  const current = inGroup[0];
  const selected = groupAccount(grants, group, available);
  const canWrite = appScope(agent, group.app) === "write";
  const accountOptions = [
    ...available.map((account) => ({ value: account.id, label: account.alias ?? account.id })),
    ...(current && !available.some((account) => account.id === current.account_id)
      ? [{ value: current.account_id, label: t("routines.apps.unavailableAccount", { id: current.account_id }) }]
      : []),
  ];

  const row = (tool: string, write: boolean) => {
    const grant = grants.find((item) => item.tool === tool);
    const usable = available.some((account) => account.id === selected);
    const disabled = !grant && (!usable || (write && !canWrite));
    const notes = [
      grant && grant.account_id !== selected ? t("routines.apps.accountUnavailable") : "",
      write && !canWrite && !grant ? t("routines.apps.needsWrite") : "",
    ].filter(Boolean);
    return (
      <Checkbox
        key={tool}
        checked={Boolean(grant)}
        disabled={disabled}
        onChange={() => onChange(toggleGrant(grants, tool, grant?.account_id ?? selected))}
        label={t(toolLabelKey(tool))}
        description={
          <>
            <span className="break-all font-mono">{tool}</span>
            {notes.length > 0 && <span className="block text-warning">{notes.join(" · ")}</span>}
          </>
        }
      />
    );
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 border-t border-line pt-3">
      <legend className="float-left mb-1 w-full text-label font-semibold text-ink">{group.label}</legend>
      <Field label={t("knowledgeRoutines.connectedAccount")}>
        {(ids) => (
          <Select
            {...ids}
            value={available.length === 0 && !current ? "" : selected}
            options={accountOptions.length > 0 ? accountOptions : [{ value: "", label: t("routines.apps.noAccount") }]}
            disabled={available.length === 0 || inGroup.length === 0}
            onChange={(event) => onChange(setGroupAccount(grants, group, event.target.value))}
            className="h-control touch:h-touch"
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-2">{group.reads.map((tool) => row(tool, false))}</div>
      {group.writes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-field bg-inset p-3">
          <p className="text-small font-semibold text-ink">{t("knowledgeRoutines.writeActions")}</p>
          <p className="text-small text-muted">{t("knowledgeRoutines.writeActionsHelp")}</p>
          <div className="grid grid-cols-1 gap-2">{group.writes.map((tool) => row(tool, true))}</div>
        </div>
      )}
    </fieldset>
  );
}
