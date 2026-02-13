import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TAKENAWA",
  description: "宴会進行補助サービス",
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
