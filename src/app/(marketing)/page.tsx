import type { Metadata } from "next";
import { PAGE_META } from "@/components/marketing/content";
import { Hero } from "@/components/marketing/hero";
import { Features, How, Security, StartCta } from "@/components/marketing/sections";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: PAGE_META.title },
  description: PAGE_META.description,
  alternates: { canonical: PAGE_META.canonical },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ko_KR",
    url: PAGE_META.canonical,
    title: PAGE_META.title,
    description: PAGE_META.description,
  },
  twitter: { card: "summary", title: PAGE_META.title, description: PAGE_META.description },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <Features />
      <How />
      <Security />
      <StartCta />
    </>
  );
}
