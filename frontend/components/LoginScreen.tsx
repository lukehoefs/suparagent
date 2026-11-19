"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { BASE_PATH } from "@/lib/paths";
import { safeNextPath, type AuthStatus } from "@/lib/session";
import { loginView, MAX_SECRET_LENGTH, MIN_SECRET_LENGTH, signInError, type SignInMessage } from "@/lib/signin";
import { useT } from "@/lib/use-i18n";
import { SecretInput } from "./signin/SecretInput";
import { SIGNIN_LINK, SignInFooter, SignInHeading, SignInLayout } from "./signin/SignInLayout";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";
import { Field, Input } from "./ui/Input";
import { Skeleton } from "./ui/Skeleton";

// The field labels one step up from the app's 12 px form label: on the sign-in page they are the only
// words beside empty boxes, and the portal's sign-in uses the same 13 px.
const LABEL = "text-label";

function nextPath(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"), BASE_PATH);
}

function failure(err: unknown) {
  return err instanceof ApiError ? { status: err.status, code: err.code, message: err.message } : null;
}

// Sign-in (screens/SignIn.html), or first-run setup of the owner passphrase (docs/AUTH.md). Two ways in:
// the owner passphrase (POST /auth/login) and, for a member of a shared workspace, email and password
// (POST /auth/people/login). Pairing with a code and joining by invitation have their own pages.
export function LoginScreen() {
  const t = useT();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [problem, setProblem] = useState<SignInMessage | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<SignInMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  // A member of a shared workspace signs in with email and password instead of the owner passphrase.
  const [member, setMember] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    auth.status().then((value) => {
      if (cancelled) return;
      // Already signed in, or the desktop app (which never signs in): go on.
      if (value.signed_in || value.desktop) window.location.replace(nextPath());
      setStatus(value);
    }).catch((err: unknown) => {
      if (cancelled) return;
      setProblem(err instanceof ApiError ? { text: err.message } : { key: "signin.unreachable", params: { origin: window.location.origin } });
    });
    return () => { cancelled = true; };
  }, [attempt]);

  const say = (message: SignInMessage) => ("key" in message ? t(message.key, message.params) : message.text);
  const view = loginView(status, problem !== null);
  const settingUp = view === "setup";

  // Asks the server again: after the backend comes back, or after the passphrase was set on the server.
  const checkAgain = () => {
    setProblem(null);
    setStatus(null);
    setAttempt((n) => n + 1);
  };

  const switchMethod = () => {
    setMember((value) => !value);
    setPassphrase("");
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (settingUp && passphrase !== repeat) {
      setError({ key: "auth.passphrasesDiffer" });
      return;
    }
    setBusy(true);
    try {
      if (settingUp) await auth.setup(passphrase);
      else if (member) await auth.memberLogin(email, passphrase);
      else await auth.login(passphrase);
      setSignedIn(true);
      window.location.replace(nextPath());
    } catch (err) {
      setError(signInError(failure(err), "auth.signInError"));
      setBusy(false);
    }
  };

  const title = view === "setup" || view === "setupServerOnly" ? t("auth.titleSetup") : t("signin.title");
  const subtitle = view === "setup" ? t("auth.setupHelp") : view === "signIn" ? t(member ? "signin.memberSubtitle" : "signin.ownerSubtitle") : undefined;
  const label = signedIn ? t("auth.signedInOpening") : busy ? t("auth.working") : settingUp ? t("auth.setupAndSignIn") : t("signin.signInAction");
  const secretLabels = member
    ? { showLabel: t("signin.showPassword"), hideLabel: t("signin.hidePassword") }
    : { showLabel: t("auth.showPassphrase"), hideLabel: t("auth.hidePassphrase") };

  return (
    <SignInLayout>
      <SignInHeading title={title} subtitle={subtitle} />

      {view === "unreachable" && problem && (
        <Banner tone="danger" action={<Button onClick={checkAgain}>{t("signin.checkAgain")}</Button>}>{say(problem)}</Banner>
      )}

      {(view === "loading" || view === "redirect") && (
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">{view === "redirect" ? t("auth.signedInOpening") : t("auth.loading")}</span>
          <Skeleton className="h-touch" />
          <Skeleton className="h-touch" />
        </div>
      )}

      {view === "setupServerOnly" && (
        <>
          <div className="flex flex-col gap-2 text-sm text-muted">
            <p>{t("auth.setupServerOnly")}</p>
            <pre className="whitespace-pre-wrap break-all rounded-field bg-inset p-3 font-mono text-[13px] text-ink">cd backend{"\n"}uv run python -m app.auth.cli set-passphrase</pre>
            <p>{t("auth.reloadAndSignIn")}</p>
          </div>
          <Button variant="primary" className="h-touch w-full text-sm" onClick={checkAgain}>{t("signin.checkAgain")}</Button>
        </>
      )}

      {(view === "setup" || view === "signIn") && (
        <form onSubmit={submit} className="flex flex-col gap-5">
          {member && !settingUp && (
            <Field label={t("signin.email")} labelClassName={LABEL}>
              {(props) => (
                <Input {...props} type="email" className="h-touch" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
              )}
            </Field>
          )}
          <Field label={member && !settingUp ? t("signin.password") : t("auth.passphrase")} labelClassName={LABEL}>
            {(props) => (
              <SecretInput {...props} {...secretLabels} value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
                autoComplete={settingUp ? "new-password" : "current-password"} required minLength={settingUp ? MIN_SECRET_LENGTH : 1} maxLength={MAX_SECRET_LENGTH} autoFocus={!member} />
            )}
          </Field>
          {settingUp && (
            <Field label={t("auth.repeatPassphrase")} labelClassName={LABEL}>
              {(props) => (
                <SecretInput {...props} {...secretLabels} value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required maxLength={MAX_SECRET_LENGTH} />
              )}
            </Field>
          )}
          {error && <Banner tone="danger">{say(error)}</Banner>}
          <Button type="submit" variant="primary" className="h-touch w-full text-sm" loading={busy || signedIn}>{label}</Button>
          {/* 14 px like the subtitle (the design's 12 px was too small to read at a glance), on the
              page's 1.5 line height. Muted grey is 9.4:1 on the white panel. */}
          {!settingUp && <p className="text-sm leading-normal text-muted">{t(member ? "signin.memberLost" : "signin.ownerLost")}</p>}
        </form>
      )}

      {view === "signIn" && (
        <SignInFooter>
          <p>
            {t(member ? "signin.ownerPrompt" : "signin.memberPrompt")}{" "}
            <button type="button" className={SIGNIN_LINK} onClick={switchMethod}>
              {t(member ? "signin.ownerAction" : "signin.memberAction")}
            </button>
          </p>
          <p>
            {t("signin.invitePrompt")} <Link href="/join/" className={SIGNIN_LINK}>{t("signin.inviteAction")}</Link>
          </p>
          <p>
            {t("auth.pairingPrompt")} <Link href="/pair/" className={SIGNIN_LINK}>{t("auth.pairBrowser")}</Link>
          </p>
        </SignInFooter>
      )}
    </SignInLayout>
  );
}
