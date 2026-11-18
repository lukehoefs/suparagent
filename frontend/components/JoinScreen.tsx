"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { withBase } from "@/lib/paths";
import { inviteFromHash } from "@/lib/session";
import {
  inviteFromLink,
  MAX_SECRET_LENGTH,
  MIN_SECRET_LENGTH,
  pastedInviteMessage,
  signInError,
  type SignInMessage,
} from "@/lib/signin";
import { useT } from "@/lib/use-i18n";
import { SecretInput } from "./signin/SecretInput";
import { SIGNIN_LINK, SignInFooter, SignInHeading, SignInLayout } from "./signin/SignInLayout";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";
import { Field, Input } from "./ui/Input";
import { Skeleton } from "./ui/Skeleton";

type Invite = { token: string; email: string };
type JoinField = "email" | "name" | "password";
const JOIN_FIELDS: readonly JoinField[] = ["email", "name", "password"];

// Joins a shared workspace from an invitation link (screens/SignInJoin.html), POST /auth/invites/accept.
// The secret arrives in the URL fragment (#token=…&email=…), which never reaches a server log, and is
// removed from the address bar once read. Opened without one, the page takes a pasted link instead.
export function JoinScreen() {
  const t = useT();
  // Undefined until the fragment has been read, so the first paint does not flash "no invitation";
  // null when there is none.
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  // Asked for only when the link did not carry the address; otherwise the link's address is shown.
  const [typedEmail, setTypedEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<SignInMessage | null>(null);
  const [error, setError] = useState<SignInMessage | null>(null);
  // What is missing or too short, shown under its field when Join is pressed. The button is never
  // disabled, so the one primary action always reads as the next step and says why it cannot go on.
  const [invalid, setInvalid] = useState<Partial<Record<JoinField, SignInMessage>>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const found = inviteFromHash(window.location.hash);
    if (found) window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInvite(found);
  }, []);

  const linkEmail = invite?.email ?? "";
  const email = linkEmail || typedEmail;

  const say = (message: SignInMessage) => ("key" in message ? t(message.key, message.params) : message.text);

  const acceptPasted = (event: FormEvent) => {
    event.preventDefault();
    const result = inviteFromLink(pasted, window.location.origin);
    if (!result.ok) {
      setPasteError(pastedInviteMessage(result));
      return;
    }
    setPasteError(null);
    setPasted("");
    setInvite({ token: result.token, email: result.email });
  };

  const fix = (field: JoinField) => setInvalid((current) => (current[field] ? { ...current, [field]: undefined } : current));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invite) return;
    const problems: Partial<Record<JoinField, SignInMessage>> = {};
    if (!linkEmail && !/^[^\s@]+@[^\s@]+$/.test(typedEmail.trim())) problems.email = { key: "signin.error.emailInvalid" };
    if (!name.trim()) problems.name = { key: "signin.error.nameRequired" };
    if (password.length < MIN_SECRET_LENGTH) problems.password = { key: "signin.passwordRule", params: { count: MIN_SECRET_LENGTH } };
    setInvalid(problems);
    const first = JOIN_FIELDS.find((field) => problems[field]);
    if (first) {
      const control = event.currentTarget.elements.namedItem(first);
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await auth.acceptInvite({ token: invite.token, email, display_name: name, password });
      setDone(true);
      window.location.replace(withBase("/chat/"));
    } catch (err) {
      setError(signInError(err instanceof ApiError ? { status: err.status, code: err.code, message: err.message } : null, "signin.joinFailed"));
      setBusy(false);
    }
  };

  // Back to the paste step, for a link that turned out dead (expired, used, revoked) or not the newest.
  const pasteOtherLink = () => {
    setInvite(null);
    setError(null);
    setInvalid({});
    setPassword("");
    setTypedEmail("");
  };

  const signInLine = (
    <p>
      {t("signin.alreadyMember")} <Link href="/login/" className={SIGNIN_LINK}>{t("signin.signInAction")}</Link>
    </p>
  );
  const footer = <SignInFooter>{signInLine}</SignInFooter>;

  if (invite === undefined) {
    return (
      <SignInLayout>
        <SignInHeading title={t("signin.joinTitle")} />
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">{t("auth.loading")}</span>
          <Skeleton className="h-touch" />
          <Skeleton className="h-touch" />
        </div>
      </SignInLayout>
    );
  }

  if (done) {
    return (
      <SignInLayout>
        <SignInHeading title={t("signin.joinTitle")} />
        <Banner tone="success" title={t("signin.welcome")}>{t("signin.openingChats")}</Banner>
      </SignInLayout>
    );
  }

  if (invite === null) {
    return (
      <SignInLayout>
        <SignInHeading title={t("signin.findTitle")} subtitle={t("signin.findSubtitle")} />
        <form onSubmit={acceptPasted} className="flex flex-col gap-5" noValidate>
          <Field label={t("signin.inviteLink")} error={pasteError ? say(pasteError) : undefined}>
            {(props) => (
              <Input {...props} type="text" inputMode="url" className="h-touch" value={pasted}
                onChange={(e) => { setPasted(e.target.value); setPasteError(null); }}
                autoComplete="off" autoCapitalize="off" spellCheck={false} autoFocus />
            )}
          </Field>
          <Button type="submit" variant="primary" className="h-touch w-full text-sm">{t("signin.continue")}</Button>
        </form>
        {footer}
      </SignInLayout>
    );
  }

  // A dead invitation (expired, used, revoked, or for another address) offers the paste step again.
  const inviteRejected = error !== null && "key" in error && error.key === "signin.error.inviteInvalid";

  return (
    <SignInLayout>
      <div className="flex flex-col gap-3">
        {linkEmail && (
          <div className="flex items-center gap-2.5 rounded-card bg-inset px-3 py-2.5 text-[13px] text-ink">
            <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-hover text-muted">
              <Mail size={14} />
            </span>
            <span className="min-w-0 break-words">{t("signin.invitedAs", { email: linkEmail })}</span>
          </div>
        )}
        <SignInHeading title={t("signin.joinTitle")} subtitle={t("signin.joinSubtitle")} />
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {linkEmail ? (
          // Lets a password manager save the new password under the right address.
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        ) : (
          <Field label={t("signin.email")} hint={t("signin.inviteEmailHint")} error={invalid.email ? say(invalid.email) : undefined}>
            {(props) => (
              <Input {...props} type="email" name="email" className="h-touch" value={typedEmail} onChange={(e) => { setTypedEmail(e.target.value); fix("email"); }} autoComplete="email" required />
            )}
          </Field>
        )}
        <Field label={t("signin.name")} error={invalid.name ? say(invalid.name) : undefined}>
          {(props) => (
            <Input {...props} name="name" className="h-touch" value={name} onChange={(e) => { setName(e.target.value); fix("name"); }} autoComplete="name" required maxLength={80} autoFocus />
          )}
        </Field>
        <Field label={t("signin.password")} hint={t("signin.passwordRule", { count: MIN_SECRET_LENGTH })} error={invalid.password ? say(invalid.password) : undefined}>
          {(props) => (
            <SecretInput {...props} name="password" showLabel={t("signin.showPassword")} hideLabel={t("signin.hidePassword")} value={password}
              onChange={(e) => { setPassword(e.target.value); fix("password"); }} autoComplete="new-password" required minLength={MIN_SECRET_LENGTH} maxLength={MAX_SECRET_LENGTH} />
          )}
        </Field>
        {error && <Banner tone="danger">{say(error)}</Banner>}
        <Button type="submit" variant="primary" className="h-touch w-full text-sm" loading={busy}>
          {busy ? t("signin.joining") : t("signin.joinAction")}
        </Button>
      </form>
      <SignInFooter>
        {inviteRejected && (
          <p>
            <button type="button" className={cn(SIGNIN_LINK, "disabled:cursor-not-allowed disabled:opacity-50")} onClick={pasteOtherLink} disabled={busy}>
              {t("signin.otherLink")}
            </button>
          </p>
        )}
        {signInLine}
      </SignInFooter>
    </SignInLayout>
  );
}
