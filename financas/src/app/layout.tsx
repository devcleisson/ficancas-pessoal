import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "next-themes";
import { ThemedToaster } from "@/components/themed-toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Finanças — Controle financeiro pessoal", template: "%s · Finanças" },
  description: "Controle de receitas, despesas, cartões, orçamento e metas.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070708" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f7" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
