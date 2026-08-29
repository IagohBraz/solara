import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solara OS",
  description: "Solara OS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
