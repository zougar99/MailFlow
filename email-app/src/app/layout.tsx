import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Email Control",
  description: "Newsletter, tri, libellés multi-e-mails — application séparée",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
