"use client";

import Link from "next/link";
import { agentAppOptions, levelOf, withAccount, withApp, type AccountScopes, type ComposioAccount, type Level, type Scopes } from "@/lib/connected-apps";
import { useT } from "@/lib/use-i18n";
import { SkeletonList } from "@/components/ui/Skeleton";

const SEGMENT = "inline-flex min-h-8 cursor-pointer items-center rounded border border-transparent px-2.5 text-xs font-medium text-muted hover:bg-hover hover:text-ink peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-accent-text peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent touch:min-h-11";

export function ConnectedAppsSection({
  appAccounts,
  connectorScopes,
  connectorAccountScopes,
  busy,
  onScopesChange,
  onAccountScopesChange,
}: {
  appAccounts: ComposioAccount[] | null;
  connectorScopes: Scopes;
  connectorAccountScopes: AccountScopes;
  busy: boolean;
  onScopesChange: (scopes: Scopes) => void;
  onAccountScopesChange: (scopes: AccountScopes) => void;
}) {
  const t = useT();
  const apps = agentAppOptions(appAccounts, connectorScopes);

  return (
    <div className="space-y-4" role="group" aria-label={t("agentTools.apps.group")}>
      {apps.map((app) => {
        const level = levelOf(connectorScopes, app.slug);
        const options: { value: Level; label: string }[] = [
          { value: "off", label: t("agentTools.apps.off") },
          { value: "read", label: t("agentTools.apps.read") },
          ...(app.write ? [{ value: "write" as const, label: t("agentTools.apps.write") }] : []),
        ];
        const helper = level === "off"
          ? t("agentTools.apps.helperOff")
          : level === "read"
            ? `${app.generic ? t("agentTools.apps.lookUp") : t("agentTools.apps.readOnly")} ${app.read}`
            : `${app.generic ? t("agentTools.apps.lookUpRun") : t("agentTools.apps.readChange")} ${app.write ?? ""}`;

        const accounts = appAccounts?.filter((account) => account.toolkit === app.slug && account.status === "ACTIVE") ?? [];
        const selected = connectorAccountScopes[app.slug] ?? [];
        const unavailable = selected.filter((id) => !accounts.some((account) => account.id === id));

        return (
          <fieldset key={app.slug} className="min-w-0 space-y-2 rounded-field border border-line p-3">
            <legend className="px-1 text-sm font-medium text-ink">
              {app.label}
              {app.generic && <span className="ml-2 text-xs font-normal text-muted">{t("agentTools.apps.generic")}</span>}
            </legend>
            <div role="radiogroup" aria-label={t("agentTools.apps.access", { app: app.label })} className="inline-flex max-w-full flex-wrap gap-1 rounded-md border border-line bg-inset p-1">
              {options.map((option) => (
                <label key={option.value} className="relative">
                  <input
                    type="radio"
                    name={`app-${app.slug}`}
                    className="peer sr-only"
                    disabled={busy}
                    checked={level === option.value}
                    onChange={() => onScopesChange(withApp(connectorScopes, app.slug, option.value))}
                  />
                  <span className={SEGMENT}>{option.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs leading-5 text-muted" aria-live="polite">{helper}</p>

            {level !== "off" && (
              <div className="space-y-1 border-l border-line pl-3">
                <p className="text-xs text-muted">{t("agentTools.apps.accounts")}</p>
                {appAccounts === null ? (
                  <SkeletonList rows={1} />
                ) : (
                  <>
                    {accounts.length ? accounts.map((account) => (
                      <label key={account.id} className="flex min-h-8 cursor-pointer items-center gap-2 text-xs touch:min-h-11">
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={selected.includes(account.id)}
                          onChange={(event) => onAccountScopesChange(withAccount(connectorAccountScopes, app.slug, account.id, event.target.checked))}
                        />
                        <span>{account.alias || account.id}</span>
                      </label>
                    )) : (
                      <p className="text-xs text-muted">
                        {t("agentTools.apps.noAccount")}{" "}
                        <Link href="/apps/" className="text-accent-text underline underline-offset-2">{t("agentTools.apps.connectOne")}</Link>
                      </p>
                    )}
                    {unavailable.map((id) => (
                      <label key={id} className="flex min-h-8 cursor-pointer items-center gap-2 text-xs touch:min-h-11">
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked
                          onChange={() => onAccountScopesChange(withAccount(connectorAccountScopes, app.slug, id, false))}
                        />
                        <span>{t("agentTools.apps.unavailable", { id })}</span>
                      </label>
                    ))}
                    {selected.length === 0 && <p className="text-xs text-muted">{t("agentTools.apps.noneSelected")}</p>}
                  </>
                )}
              </div>
            )}
          </fieldset>
        );
      })}
      <p className="text-xs leading-5 text-muted">
        <Link href="/apps/" className="text-accent-text underline underline-offset-2">{t("agentTools.apps.footerLink")}</Link>
        {" "}{t("agentTools.apps.footer")}
      </p>
    </div>
  );
}
