import type { Metadata } from "next";
import { Space_Grotesk, Chakra_Petch } from "next/font/google";
import "./globals.css";

// Space Grotesk ships a variable font (wght 300–700). Omitting `weight` loads
// that single file instead of one static file per weight, so the body font costs
// one preload rather than four.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Chakra Petch has no variable version, so the weights stay listed. All four are
// in use: 400 as the default, plus font-medium/semibold/bold on display text.
const chakraPetch = Chakra_Petch({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Turnier-App",
  description: "Esports-Turniere verwalten: Anmeldung, Check-in, Brackets, Live-Board",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`dark ${spaceGrotesk.variable} ${chakraPetch.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
