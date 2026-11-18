"use client";

// One agent's access to one connected app: off, read only, or read and change, and the exact connected
// accounts it may use (the backend grants accounts by id; an app with none chosen gives the agent
// nothing). Saved with the rest of the matrix as one update of the agent.
import type { Agent } from "@/lib/api";
import { levelOf, type ComposioAccount, type Level } from "@/lib/connected-apps";
import { accessOf, type MatrixItem, type MatrixState } from "@/lib/permissions-matrix";
import { useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/Select";
import { StatusText } from "@/components/ui/StatusPill";
import { usePlural } from "./shared";

export function AppCell({
  item,
  agent,
  desired,
  accounts,
  editable,
  disabled,
  onLevel,
  onAccount,
  className,
}: {
  item: MatrixItem;
  agent: Agent;
  desired: MatrixState;
  accounts: ComposioAccount[] | null;
  editable: boolean;
  disabled: boolean;
  onLevel: (level: Level) => void;
  onAccount: (accountId: string, allowed: boolean) => void;
  className?: string;
}) {
  const t = useT();
  const plural = usePlural();
  const access = accessOf(desired, agent.id);
  const level = levelOf(access.scopes, item.id);
  const chosen = access.accounts[item.id] ?? [];
  const active = (accounts ?? []).filter((account) => account.toolkit === item.id && account.status === "ACTIVE");
  // A chosen account that is no longer connected stays listed so it can be unticked.
  const gone = chosen.filter((id) => !active.some((account) => account.id === id));
  const levelWord = (value: Level) => t(value === "off" ? "permissions.apps.off" : value === "read" ? "permissions.apps.read" : "permissions.apps.write");

  if (!editable) {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <span className="text-label text-ink">{levelWord(level)}</span>
        {level !== "off" ? <span className="text-small text-muted">{plural("permissions.apps.accountCount", chosen.length)}</span> : null}
      </div>
    );
  }

  const options = [
    { value: "off", label: levelWord("off") },
    { value: "read", label: levelWord("read") },
    ...(item.canWrite || level === "write" ? [{ value: "write", label: levelWord("write") }] : []),
  ];
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Select
        aria-label={t("permissions.apps.access", { app: item.label, name: agent.name })}
        value={level}
        options={options}
        disabled={disabled}
        onChange={(event) => onLevel(event.target.value as Level)}
        className="h-control text-label touch:h-touch"
      />
      {level !== "off" ? (
        <div role="group" aria-label={t("permissions.apps.accounts", { app: item.label, name: agent.name })} className="flex flex-col">
          {active.map((account) => (
            <label key={account.id} className="flex min-h-7 cursor-pointer items-center gap-2 text-small text-ink has-[:disabled]:cursor-not-allowed touch:min-h-11">
              <input
                type="checkbox"
                className="size-4 shrink-0 cursor-pointer accent-(--accent) disabled:cursor-not-allowed"
                checked={chosen.includes(account.id)}
                disabled={disabled}
                onChange={(event) => onAccount(account.id, event.target.checked)}
              />
              {/* By its id when it has no alias, as the agent's Tools tab does, so two accounts never read the same. */}
              <span className="min-w-0 truncate" title={account.alias ? `${account.alias} (${account.id})` : account.id}>{account.alias || account.id}</span>
            </label>
          ))}
          {gone.map((id) => (
            <label key={id} className="flex min-h-7 cursor-pointer items-center gap-2 text-small text-muted touch:min-h-11">
              <input
                type="checkbox"
                className="size-4 shrink-0 cursor-pointer accent-(--accent)"
                checked
                disabled={disabled}
                onChange={() => onAccount(id, false)}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate" title={id}>{id}</span>{" "}
                <span>{t("permissions.apps.gone")}</span>
              </span>
            </label>
          ))}
          {active.length === 0 && gone.length === 0 ? (
            <StatusText status="waiting">{t("permissions.apps.noAccount")}</StatusText>
          ) : chosen.length === 0 ? (
            <StatusText status="waiting">{t("permissions.apps.chooseAccount")}</StatusText>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
