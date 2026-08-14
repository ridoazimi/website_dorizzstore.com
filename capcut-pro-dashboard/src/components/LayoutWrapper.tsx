"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AffiliateSidebar from "@/components/AffiliateSidebar";
import BulkTransactionLauncher from "@/components/BulkTransactionLauncher";
import { AuthProvider } from "@/context/AuthContext";
import { AffiliateAuthProvider } from "@/context/AffiliateAuthContext";
import { PrivacyProvider } from "@/context/PrivacyContext";
import { MobileNavProvider } from "@/context/MobileNavContext";
import { ReactNode } from "react";

const PUBLIC_PAGES = ["/", "/checkout", "/login", "/register", "/affiliate/login", "/affiliate/setup", "/sales-portal", "/sales-portal/login", "/sales-portal/dashboard", "/payment", "/terms", "/privacy", "/warranty", "/testimoni"];

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PAGES.some(p => pathname === p || pathname.startsWith(p + "?") || pathname.startsWith(p + "/"));
  const isAffiliatePage = pathname === "/affiliate" || pathname.startsWith("/affiliate/");

  // Auth pages and marketplace — no layout
  if (isPublicPage) {
    return <>{children}</>;
  }

  // Affiliate portal — different sidebar, different context
  if (isAffiliatePage) {
    return (
      <AffiliateAuthProvider>
        <div className="flex min-h-screen">
          <AffiliateSidebar />
          <main className="flex-1 lg:ml-[260px] ml-0 min-h-screen min-w-0">
            {children}
          </main>
        </div>
      </AffiliateAuthProvider>
    );
  }

  // Admin dashboard — existing layout
  return (
    <AuthProvider>
      <MobileNavProvider>
        <PrivacyProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <BulkTransactionLauncher />
            <main className="flex-1 lg:ml-[260px] ml-0 min-h-screen min-w-0">
              {children}
            </main>
          </div>
        </PrivacyProvider>
      </MobileNavProvider>
    </AuthProvider>
  );
}
