import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

// 라틴 글자·숫자용 글꼴. next/font 가 빌드 때 내려받아 같은 출처(/_next/static)에서 제공하므로 외부 요청이 없다(CSP font-src 'self').
// 한글은 globals.css 의 --sans 뒤쪽 시스템 글꼴로 이어진다.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#07090f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-scroll-behavior="smooth" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        <a href="#main" className="skip-link">
          본문 바로가기
        </a>
        {children}
      </body>
    </html>
  );
}
