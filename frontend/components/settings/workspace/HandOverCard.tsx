"use client";

import { useId, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { withBase } from "@/lib/paths";
import { people, type Person } from "@/lib/people";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { SettingsCard } from "../SettingsCard";

// The owner hands the workspace to another member (POST /people/transfer, with the owner passphrase).
// The old owner becomes an admin and the passphrase is replaced, so this signs the owner out; they
// sign back in with their email and password.
export function HandOverCard({ roster, me }: { roster: Person[]; me: Person }) {
  const t = useT();
  const targetId = useId();
  const passphraseId = useId();
  const [target, setTarget] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = roster.filter((person) => !person.is_you && person.role !== "owner");
  const chosen = others.find((person) => String(person.id) === target);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!chosen) return;
    if (!confirming) { setConfirming(true); return; }
    setBusy(true);
    setError(null);
    try {
      await people.transfer(chosen.id, passphrase);
      window.location.replace(withBase("/login/"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("members.handOverFailed"));
      setConfirming(false);
      setBusy(false);
    }
  };

  return (
    <SettingsCard title={t("members.handOverTitle")} description={t("members.handOverDescription")}>
      {!me.email ? (
        <p className="text-small text-muted">{t("members.handOverNeedsEmail")}</p>
      ) : others.length === 0 ? (
        <p className="text-small text-muted">{t("members.handOverNobody")}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
              <label htmlFor={targetId} className="text-small font-medium text-muted">{t("members.newOwner")}</label>
              <Select id={targetId} value={target} disabled={busy} triggerClassName="h-control touch:h-touch"
                onChange={(event) => { setTarget(event.target.value); setConfirming(false); }}>
                <option value="">{t("members.chooseMember")}</option>
                {others.map((person) => <option key={person.id} value={String(person.id)}>{person.email ? `${person.display_name} (${person.email})` : person.display_name}</option>)}
              </Select>
            </div>
            <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
              <label htmlFor={passphraseId} className="text-small font-medium text-muted">{t("members.ownerPassphrase")}</label>
              <Input id={passphraseId} type="password" value={passphrase} disabled={busy} autoComplete="current-password" required
                onChange={(event) => setPassphrase(event.target.value)} />
            </div>
          </div>
          <p className="text-small text-muted">
            {t("members.handOverEffect")}{" "}
            <code className="break-all rounded-inner bg-code px-1 py-0.5 font-mono text-[12px] text-ink">python -m app.auth.cli set-passphrase</code>
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            {confirming && <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>{t("members.cancel")}</Button>}
            <Button type="submit" variant={confirming ? "danger" : "secondary"} loading={busy} disabled={!chosen || !passphrase}>
              {confirming && chosen ? t("members.handOverConfirm", { name: chosen.display_name }) : t("members.handOver")}
            </Button>
          </div>
        </form>
      )}
    </SettingsCard>
  );
}
