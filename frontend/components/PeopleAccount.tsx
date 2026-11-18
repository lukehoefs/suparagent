"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { people, type Person } from "@/lib/people";
import type { SessionInfo } from "@/lib/session";
import { useT } from "@/lib/use-i18n";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

function failure(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// The signed-in person's own name and password (Settings › Account & privacy, "Your account"). The
// owner of an install that predates people has no email or password yet: they set both once,
// confirmed with the owner passphrase, so they can sign in as an ordinary member (and hand the
// workspace over under Members).
export function YourAccount({ session, me, onChanged }: { session: SessionInfo; me: Person | null; onChanged: () => void }) {
  const t = useT();
  const [name, setName] = useState(session.display_name ?? "");
  const [email, setEmail] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (session.person_id == null || !me) return null;
  const needsSetup = me.role === "owner" && !me.email;

  const run = async (work: () => Promise<void>, done: string, fallback: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await work();
      setNote(done);
      onChanged();
    } catch (err) {
      setError(failure(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => { await people.rename(name); }, t("yourAccount.nameSaved"), t("yourAccount.nameFailed"));
  };

  const savePassword = (event: FormEvent) => {
    event.preventDefault();
    if (next !== repeat) { setNote(null); setError(t("yourAccount.passwordsDiffer")); return; }
    void run(async () => {
      await people.changePassword(needsSetup
        ? { new_password: next, email, passphrase }
        : { new_password: next, current_password: current });
      setCurrent(""); setNext(""); setRepeat(""); setPassphrase("");
    }, needsSetup ? t("yourAccount.setUpDone") : t("yourAccount.passwordChanged"), t("yourAccount.passwordFailed"));
  };

  return (
    <SettingsCard title={t("yourAccount.title")} description={t("yourAccount.description")}>
      {error && <Banner tone="danger">{error}</Banner>}
      {note && <Banner tone="success">{note}</Banner>}
      <form onSubmit={saveName} className="flex flex-wrap items-end gap-3">
        <Field label={t("yourAccount.name")} className="min-w-0 flex-[1_1_220px]">
          {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" data-setting-focus="setting-account-your-account" />}
        </Field>
        <Button type="submit" disabled={busy || !name.trim() || name.trim() === session.display_name}>{t("yourAccount.saveName")}</Button>
      </form>
      <form onSubmit={savePassword} className="flex flex-col gap-3 border-t border-line pt-3.5">
        <p className="text-small text-muted">{needsSetup ? t("yourAccount.setUpIntro") : t("yourAccount.changeIntro")}</p>
        {needsSetup ? (
          <>
            <Field label={t("yourAccount.email")}>{(props) => <Input {...props} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />}</Field>
            <Field label={t("yourAccount.ownerPassphrase")}>{(props) => <Input {...props} type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="current-password" required />}</Field>
          </>
        ) : (
          <Field label={t("yourAccount.currentPassword")}>{(props) => <Input {...props} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />}</Field>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
          <Field label={t("yourAccount.newPassword")} hint={t("yourAccount.newPasswordHint")}>{(props) => <Input {...props} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required minLength={10} />}</Field>
          <Field label={t("yourAccount.repeatPassword")}>{(props) => <Input {...props} type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />}</Field>
        </div>
        <div>
          <Button type="submit" disabled={busy}>{needsSetup ? t("yourAccount.setUp") : t("yourAccount.changePassword")}</Button>
        </div>
      </form>
    </SettingsCard>
  );
}
