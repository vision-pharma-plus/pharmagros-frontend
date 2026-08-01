import type { Metadata } from "next";

import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  // `template` puts the company name on every tab: a page that sets its own
  // title renders as "Factures | Vision Pharma plus", while anything that
  // sets none falls back to `default`. Several of these tabs are open at
  // once alongside other systems, so the pharmacy has to be identifiable
  // from the tab strip alone.
  title: {
    default: "Vision Pharma plus",
    template: "%s | Vision Pharma plus",
  },
  description:
    "Vision Pharma plus, grossiste pharmaceutique à Bujumbura, Burundi",
  // The mark in public/ is served as both the tab icon and the iOS home
  // screen icon; it is a square logotype, so it reads at either size.
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "234x234" }],
    apple: [{ url: "/favicon.png", sizes: "234x234" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // lang is set to the default here and updated client-side by LocaleProvider
  // once the stored preference is read; hydration stays stable because the
  // server always renders the same value.
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint. Without this the page
            renders light and then snaps to dark once React hydrates. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pharmagros.theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      {/* Browser extensions (Grammarly and similar) inject attributes onto
          body before React hydrates, which otherwise trips a mismatch warning.
          suppressHydrationWarning only covers one level, so it is needed here
          in addition to the html element above. */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
