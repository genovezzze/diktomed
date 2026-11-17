import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";

// The Shadowy platform's faces, self-hosted (no requests to Google Fonts: the
// hospital server may have no internet). Albert Sans, the interface face, is
// declared in globals.css.

const inter = localFont({
  src: [
    { path: "../../public/fonts/Inter-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/Inter-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/Inter-Bold.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/Inter-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const neueHaas = localFont({
  src: [
    { path: "../../public/fonts/NeueHaasDisplayLight.woff2", weight: "300", style: "normal" },
    { path: "../../public/fonts/NeueHaasDisplayMediu.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/NeueHaasDisplayBold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const neueHaasLight = localFont({
  src: "../../public/fonts/NeueHaasDisplayLight.woff2",
  weight: "300",
  style: "normal",
  variable: "--font-accent",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const jetBrainsMono = localFont({
  src: "../../public/fonts/JetBrainsMono-Regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-mono",
  preload: false,
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

// Inline as well as in the generated classes, as in Shadowy: a stale dev
// stylesheet must not drop the font stack back to the browser's serif.
const fontVariables = {
  "--font-sans": inter.style.fontFamily,
  "--font-display": neueHaas.style.fontFamily,
  "--font-accent": neueHaasLight.style.fontFamily,
  "--font-mono": jetBrainsMono.style.fontFamily,
} as React.CSSProperties;

export const metadata: Metadata = {
  title: { default: "DiktoMed", template: "%s | DiktoMed" },
  description: "Ārstu diktātu pārvēršana medicīniskajā dokumentācijā slimnīcas serverī.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="lv"
      className={`${inter.variable} ${neueHaas.variable} ${neueHaasLight.variable} ${jetBrainsMono.variable}`}
      style={fontVariables}
      suppressHydrationWarning
    >
      <body className="font-sans" style={{ fontFamily: inter.style.fontFamily }}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          themes={["light", "dark", "slate"]}
          value={{ light: "light", dark: "dark", slate: "slate" }}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
