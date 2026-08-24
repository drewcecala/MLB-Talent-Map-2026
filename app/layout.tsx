import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://mlb-talent-map-2026.pages.dev"),
  title: {
    default: "The Geography of MLB Talent",
    template: "%s | The Geography of MLB Talent",
  },
  description:
    "Explore every MLB organization roster, including affiliated minor-league players, with conservative U.S. birthplace geography and complete international-origin coverage.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "The Geography of MLB Talent",
    description:
      "An evidence-audited map of MLB and affiliated minor-league roster talent.",
    type: "website",
    url: "/",
    images: [{
      url: "/og.png",
      width: 1731,
      height: 909,
      alt: "The Geography of MLB Talent — 2026 roster atlas",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Geography of MLB Talent",
    description:
      "An evidence-audited map of MLB and affiliated minor-league roster talent.",
    images: ["/og.png"],
  },
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
