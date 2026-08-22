import type { Metadata } from "next";
import "./globals.css";
import "./admin-redesign.css";
import LayoutWrapper from "@/components/LayoutWrapper";
import { ThemeProvider } from "@/context/ThemeContext";
import SalesTracker from "@/components/SalesTracker";


export const metadata: Metadata = {
  metadataBase: new URL("https://dorizzstore.com"),
  title: "Dorizz Store Dashboard",
  description: "Dashboard Pengelola Dorizz Store - Manajemen Transaksi, Pelanggan, dan Stok Akun",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DorizzStore",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>
          <SalesTracker />
          <LayoutWrapper>{children}</LayoutWrapper>
        </ThemeProvider>
      </body>

    </html>
  );
}
