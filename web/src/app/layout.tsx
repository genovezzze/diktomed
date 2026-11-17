import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";

// Fonts are self-hosted (no requests to Google Fonts: the hospital server may
// have no internet). Poppins, for everything but timestamps, is declared in
// globals.css; JetBrains Mono shows times and codes.
const jetBrainsMono = localFont({
  src: "../../public/fonts/JetBrainsMono-Regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-mono",
  preload: false,
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

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
      className={jetBrainsMono.variable}
      suppressHydrationWarning
    >
      <body className="font-sans">
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
