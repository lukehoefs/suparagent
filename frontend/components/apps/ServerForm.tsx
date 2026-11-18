"use client";

// A custom MCP server's details: name, address and how it signs in. Used by the first step of
// Add a server and by Edit. The secret is typed by the owner, sent once and never shown again: the
// field always starts empty and nothing here logs or keeps it.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ServerForm as Form } from "@/lib/apps-page";
import type { CustomMcpAuthMode } from "@/lib/custom-mcp";
import { useT } from "@/lib/use-i18n";
import { Field, Input, Select } from "@/components/ui/Input";

// Where the provider sends the browser back, for an OAuth client registered by hand.
function RedirectHint() {
  const t = useT();
  const [info, setInfo] = useState<{ redirect_uri: string | null; pattern: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    api.getCustomMcpRedirect().then((found) => { if (live) setInfo(found); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  if (!info) return null;
  const address = info.redirect_uri ?? info.pattern;
  if (!address) return null;
  return (
    <p className="text-small text-muted sm:col-span-2">
      {t(info.redirect_uri ? "apps.form.redirectFixed" : "apps.form.redirectLoopback")}{" "}
      <code className="break-all font-mono text-ink">{address}</code>
    </p>
  );
}

export function ServerForm({ form, onChange, hasSecret = false, disabled = false }: {
  form: Form;
  onChange: (next: Form) => void;
  // A secret is already saved: a blank field keeps it.
  hasSecret?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  const oauth = form.auth_mode === "oauth";
  const secretLabel = oauth
    ? t(hasSecret ? "apps.form.clientSecretReplace" : "apps.form.clientSecret")
    : t(hasSecret ? "apps.form.secretReplace" : "apps.form.secret");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("apps.form.name")}>
        {(props) => <Input {...props} value={form.name} maxLength={100} disabled={disabled} autoComplete="off" onChange={(event) => set({ name: event.target.value })} />}
      </Field>
      <Field label={t("apps.form.address")} hint={t("apps.form.addressHint")}>
        {(props) => (
          <Input {...props} type="url" inputMode="url" placeholder="https://example.com/mcp" value={form.endpoint} maxLength={300} disabled={disabled}
            autoComplete="off" spellCheck={false} className="font-mono" onChange={(event) => set({ endpoint: event.target.value })} />
        )}
      </Field>
      <Field label={t("apps.form.auth")}>
        {(props) => (
          <Select
            {...props}
            // 36 px like the inputs beside it, 44 px on touch screens.
            className="h-control py-0 touch:h-touch"
            value={form.auth_mode}
            disabled={disabled}
            options={[
              { value: "none", label: t("apps.form.authNone") },
              { value: "bearer", label: t("apps.servers.auth.bearer") },
              { value: "header", label: t("apps.servers.auth.header") },
              { value: "oauth", label: t("apps.form.authOauth") },
            ]}
            onChange={(event) => set({ auth_mode: event.target.value as CustomMcpAuthMode })}
          />
        )}
      </Field>
      {form.auth_mode === "header" && (
        <Field label={t("apps.form.header")} hint={t("apps.form.headerHint")}>
          {(props) => <Input {...props} value={form.auth_header_name} maxLength={64} disabled={disabled} autoComplete="off" spellCheck={false} onChange={(event) => set({ auth_header_name: event.target.value })} />}
        </Field>
      )}
      {oauth && (
        <>
          <Field label={t("apps.form.clientId")} hint={t("apps.form.clientIdHint")}>
            {(props) => <Input {...props} value={form.oauth_client_id} maxLength={200} disabled={disabled} autoComplete="off" spellCheck={false} onChange={(event) => set({ oauth_client_id: event.target.value })} />}
          </Field>
          <Field label={t("apps.form.scopes")} hint={t("apps.form.scopesHint")}>
            {(props) => <Input {...props} value={form.oauth_scopes} maxLength={500} disabled={disabled} autoComplete="off" spellCheck={false} onChange={(event) => set({ oauth_scopes: event.target.value })} />}
          </Field>
          <RedirectHint />
        </>
      )}
      {form.auth_mode !== "none" && (
        <Field label={secretLabel} hint={t(hasSecret ? "apps.form.secretKeepHint" : "apps.form.secretHint")} className="sm:col-span-2">
          {(props) => (
            <Input {...props} type="password" autoComplete="new-password" spellCheck={false} value={form.credential} disabled={disabled}
              onChange={(event) => set({ credential: event.target.value })} />
          )}
        </Field>
      )}
    </div>
  );
}
