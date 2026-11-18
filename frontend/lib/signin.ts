// Sign-in and joining by invitation (screens/SignIn.html, screens/SignInJoin.html): the parts with
// no React and no network, so node tests can load them. How authentication works is docs/AUTH.md.
import { inviteFromHash, type AuthStatus } from "./session.ts";

// The backend's own rule for a passphrase or member password (backend/app/auth/credentials.py).
export const MIN_SECRET_LENGTH = 10;
export const MAX_SECRET_LENGTH = 1024;

// Which state the sign-in page is in.
//   redirect: already signed in, or the desktop app (which never signs in): the page moves on.
//   setup: no owner passphrase yet, and this browser may set it (it is on the server itself).
//   setupServerOnly: no owner passphrase yet, and it can only be set with the command on the server.
export type LoginView = "loading" | "unreachable" | "redirect" | "setup" | "setupServerOnly" | "signIn";

export function loginView(status: AuthStatus | null, unreachable: boolean): LoginView {
  if (unreachable) return "unreachable";
  if (!status) return "loading";
  if (status.signed_in || status.desktop) return "redirect";
  if (!status.owner_configured) return status.setup_allowed ? "setup" : "setupServerOnly";
  return "signIn";
}

// A message to show: a key in the catalog with its placeholders, or the server's own words when it
// gave a reason this page has no copy for.
export type SignInMessage = { key: string; params?: Record<string, string | number> } | { text: string };

// The error codes the sign-in and join routes answer with (backend/app/auth/routes.py, people_routes.py, people.py).
export const ERROR_KEYS: Readonly<Record<string, string>> = {
  wrong_passphrase: "signin.error.wrongPassphrase",
  wrong_credentials: "signin.error.wrongCredentials",
  rate_limited: "signin.error.rateLimited",
  owner_exists: "signin.error.ownerExists",
  owner_not_configured: "signin.error.ownerNotConfigured",
  setup_local_only: "signin.error.setupLocalOnly",
  invite_invalid: "signin.error.inviteInvalid",
  name_required: "signin.error.nameRequired",
  email_invalid: "signin.error.emailInvalid",
  already_member: "signin.error.alreadyMember",
  managed_by_workspace_owner: "signin.error.managedElsewhere",
  people_unavailable: "signin.error.peopleUnavailable",
};

export type ApiFailure = { status: number; code: string | null; message: string };

// What to say when signing in or joining fails. `err` is null when the request never got an answer
// (the network, a blocked origin): then the page's own fallback.
export function signInError(err: ApiFailure | null, fallbackKey: string): SignInMessage {
  if (!err) return { key: fallbackKey };
  if (err.code === "locked_out") {
    const seconds = /(\d+)\s*seconds?/.exec(err.message)?.[1];
    return seconds ? { key: "signin.error.lockedOut", params: { seconds: Number(seconds) } } : textOr(err.message, fallbackKey);
  }
  if (err.code === "weak_passphrase" || err.code === "weak_password") {
    const rule = /at (least|most) (\d+)/.exec(err.message);
    if (rule) return { key: rule[1] === "least" ? "signin.passwordRule" : "signin.error.tooLong", params: { count: Number(rule[2]) } };
    return textOr(err.message, fallbackKey);
  }
  const key = err.code ? ERROR_KEYS[err.code] : undefined;
  return key ? { key } : textOr(err.message, fallbackKey);
}

function textOr(text: string, fallbackKey: string): SignInMessage {
  return text.trim() ? { text } : { key: fallbackKey };
}

export type PastedInvite =
  | { ok: true; token: string; email: string }
  | { ok: false; reason: "empty" | "notInvite" }
  | { ok: false; reason: "otherSite"; host: string };

// Reads an invitation link someone pasted (…/join/#token=…&email=…), or just its fragment. A link to
// another address is not used here: its token belongs to that server, so the person should open it there.
export function inviteFromLink(text: string, currentOrigin: string): PastedInvite {
  const raw = text.trim();
  if (!raw) return { ok: false, reason: "empty" };
  let fragment = raw.includes("#") ? raw.slice(raw.indexOf("#")) : raw;
  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { ok: false, reason: "notInvite" };
    }
    if (url.origin !== originOf(currentOrigin)) return { ok: false, reason: "otherSite", host: url.host };
    fragment = url.hash;
  }
  const invite = inviteFromHash(fragment);
  return invite ? { ok: true, ...invite } : { ok: false, reason: "notInvite" };
}

function originOf(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

export function pastedInviteMessage(result: PastedInvite): SignInMessage | null {
  if (result.ok) return null;
  if (result.reason === "otherSite") return { key: "signin.linkOtherSite", params: { host: result.host } };
  return { key: result.reason === "empty" ? "signin.linkEmpty" : "signin.linkNotInvite" };
}
