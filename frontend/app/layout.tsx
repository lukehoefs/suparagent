import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { LANGUAGE_INIT_SCRIPT } from "@/lib/i18n";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { SettingsShortcutMount } from "@/lib/use-settings-shortcut";
import "./globals.css";

// Inter throughout (design tokens); code uses the system monospace stack in globals.css.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "lukethomas",
  description: "A workspace of AI agents that work on your computer.",
};

// Lets pages use the full phone screen; the shell pads for the notch with safe-area insets.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by the inline script before React hydrates, hence suppressHydrationWarning.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LANGUAGE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col"><ToastProvider><SettingsShortcutMount />{children}</ToastProvider></body>
    </html>
  );
}
