import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { APP_SETTINGS_INIT_SCRIPT, DEFAULT_APP_SETTINGS } from "@/lib/appSettings";
import { DEFAULT_DESIGN_MODE, DESIGN_MODE_INIT_SCRIPT } from "@/lib/designMode";

const appIconPath = "/icons/notedijaco_icon.png?v=20260303-234200";
const sfProDisplay = localFont({
  src: [
    {
      path: "./fonts/sf-pro-display-regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/sf-pro-display-medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/sf-pro-display-bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-app",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Note",
  description: "Note personali con testo ricco, emoji custom e sync cloud opzionale.",
  icons: {
    icon: appIconPath,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      data-design-mode={DEFAULT_DESIGN_MODE}
      data-app-theme={DEFAULT_APP_SETTINGS.theme}
      suppressHydrationWarning
    >
      <body className={sfProDisplay.variable}>
        <script dangerouslySetInnerHTML={{ __html: DESIGN_MODE_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: APP_SETTINGS_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
