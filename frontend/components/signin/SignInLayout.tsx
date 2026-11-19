"use client";

import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { useT } from "@/lib/use-i18n";
import { SignInLanguage } from "./SignInLanguage";

// The sample team on the brand panel (design: SignIn.html): fixed initials and colours, decoration only.
const SAMPLE_TEAM = [
  ["PR", "#6d28d9"],
  ["VE", "#0f766e"],
  ["FL", "#0e7490"],
  ["LE", "#9d174d"],
  ["SC", "#475569"],
] as const;
const SAMPLE_AGENT = "Atlas";
const SAMPLE_TOOL = "searxng_web_search";

// The frame of the sign-in and join pages (screens/SignIn.html, SignInJoin.html): a dark brand panel
// and the form panel, side by side on a wide screen and stacked, brand first, on a narrow one. The
// brand panel stays dark in both themes: ink with surface text in light, the raised ground in dark.
// On a wide screen it holds the wordmark, the headline (centred) and a picture of the product: a
// team and an approval waiting. That picture is aria-hidden and built from spans, so nothing in it
// looks clickable to a screen reader or does nothing when pressed; it is left out on a phone.
// People still took the solid "Allow once" for a live prompt, so the picture now says what it is: a
// figure with a caption, dimmed, whose two "buttons" are outlined chips that take no pointer.
export function SignInLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const [requestBefore, requestAfter] = t("approval.wantsToUse", { name: SAMPLE_AGENT }).split("{tool}");
  return (
    <div className="flex min-h-dvh flex-wrap bg-surface text-ink">
      <header className="flex min-w-0 flex-[1_1_420px] flex-col justify-between gap-8 bg-ink px-4 py-8 text-surface sm:min-h-70 sm:gap-10 sm:px-12 sm:py-10 dark:bg-raised dark:text-ink">
        {/* 22 px on the page's 1.5 line height (a 33 px line), as in SignIn.html: the panel's
            space-between then puts the headline and the sample team where the design has them. */}
        <Wordmark className="text-[22px] leading-normal text-surface dark:text-ink" />
        <div className="flex flex-col gap-3.5">
          <p className="max-w-[440px] text-[32px] font-light leading-[1.05] tracking-[-0.03em] sm:text-[44px]">{t("signin.heroTitle")}</p>
          <p className="max-w-[400px] text-[15px] leading-normal text-[#ababab] sm:text-[17px] dark:text-muted">{t("signin.heroBody")}</p>
        </div>
        {/* The caption sits above the picture so it is read first. The whole figure stays aria-hidden:
            its caption describes a picture a screen reader does not get, so it would only be noise. */}
        <figure aria-hidden="true" className="m-0 hidden max-w-[420px] flex-col gap-3 sm:flex">
          <figcaption className="text-sm text-[#ababab] dark:text-muted">{t("signin.illustrationCaption")}</figcaption>
          <div className="pointer-events-none flex select-none flex-col gap-4 opacity-75">
            <div className="flex gap-2.5">
              {SAMPLE_TEAM.map(([initials, colour]) => (
                <span
                  key={initials}
                  style={{ backgroundColor: colour }}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white shadow-[0_0_0_2px_#111111,0_0_0_3px_#3b3b3b] dark:shadow-[0_0_0_2px_#1b1b1b,0_0_0_3px_#3b3b3b]"
                >
                  {initials}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-2.5 rounded-2xl border border-[#eec448] bg-[#1b1b1b] px-4 py-3.5 text-white">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(226_182_35/0.24)] px-2 py-0.5 text-small font-medium text-[#eec448]">
                  <span className="size-1.5 rounded-full bg-current" />
                  {t("approval.waiting")}
                </span>
                <span>
                  {requestBefore}
                  <span className="font-mono">{SAMPLE_TOOL}</span>
                  {requestAfter}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="inline-flex h-7 items-center rounded-pill border border-[#6366f1] px-3 text-[13px] font-medium text-[#c7d2fe]">{t("approval.allowOnce")}</span>
                <span className="inline-flex h-7 items-center rounded-pill border border-[#525252] px-3 text-[13px] font-medium text-[#ffaea7]">{t("approval.deny")}</span>
              </div>
            </div>
          </div>
        </figure>
      </header>
      <main className="flex min-w-0 flex-[1_1_420px] flex-col bg-surface px-4 pb-8 pt-5 sm:min-h-130 sm:px-6">
        <div className="flex justify-end">
          <SignInLanguage />
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="flex w-full max-w-[360px] flex-col gap-5">{children}</div>
        </div>
      </main>
    </div>
  );
}

// The page title and the line under it.
export function SignInHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div>
      <h1 className="text-heading leading-9 font-semibold tracking-[-0.02em] text-ink">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
}

// The ruled-off lines under the form that lead to another way in: 14 px like the subtitle, so the
// other ways in read as easily as the form.
export function SignInFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm leading-normal text-muted">{children}</div>;
}

// A link or a link-styled button inside a footer line: the accent (6.3:1 on white; the lighter accent
// text on dark) one weight up from the line, underlined so it never relies on colour alone, and 44 px
// tall on a touch screen. The portal's sign-in (lukehoefs/orbit, features/auth) draws its links the same.
export const SIGNIN_LINK =
  "cursor-pointer rounded-inner font-medium text-accent underline underline-offset-2 hover:no-underline dark:text-accent-text touch:inline-flex touch:min-h-touch touch:items-center";
