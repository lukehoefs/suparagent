"use client";

import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { useT } from "@/lib/use-i18n";
import { SignInLanguage } from "./SignInLanguage";

// The frame of the sign-in and join pages (screens/SignIn.html, SignInJoin.html): a dark brand panel
// and the form panel, side by side on a wide screen and stacked, brand first, on a narrow one. The
// brand panel stays dark in both themes: ink with surface text in light, the raised ground in dark.
export function SignInLayout({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-wrap bg-surface text-ink">
      <header className="flex min-w-0 flex-[1_1_420px] flex-col justify-between gap-8 bg-ink px-4 py-8 text-surface sm:min-h-70 sm:gap-10 sm:px-12 sm:py-10 dark:bg-raised dark:text-ink">
        <Wordmark className="text-[22px] leading-7 text-surface dark:text-ink" />
        <div className="flex flex-col gap-3.5">
          <p className="max-w-[440px] text-[32px] font-light leading-[1.05] tracking-[-0.03em] sm:text-[44px]">{t("signin.heroTitle")}</p>
          <p className="max-w-[400px] text-[15px] leading-normal text-surface/70 sm:text-[17px] dark:text-muted">{t("signin.heroBody")}</p>
        </div>
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
      <h1 className="text-heading font-semibold tracking-[-0.02em] text-ink">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
}

// The ruled-off lines under the form that lead to another way in.
export function SignInFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5 border-t border-line pt-4 text-[13px] text-muted">{children}</div>;
}

// A link or a link-styled button inside a footer line: underlined so it never relies on colour alone,
// and 44 px tall on a touch screen.
export const SIGNIN_LINK =
  "cursor-pointer rounded-inner font-medium text-accent-text underline underline-offset-2 hover:no-underline touch:inline-flex touch:min-h-touch touch:items-center";
