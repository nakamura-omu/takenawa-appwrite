import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "宴会ゲーム - Takenawa",
  description: "幹事進行型の宴会ゲームアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
