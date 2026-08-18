"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import BulkTransactionLauncher from "@/components/BulkTransactionLauncher";
import { AuthProvider } from "@/context/AuthContext";
import { PrivacyProvider } from "@/context/PrivacyContext";
import { MobileNavProvider } from "@/context/MobileNavContext";
import { ReactNode } from "react";

const PUBLIC_PAGES = ["/", "/checkout", "/login", "/register", "/member", "/sales-portal", "/sales-portal/login", "/sales-portal/dashboard", "/payment", "/terms", "/privacy", "/warranty", "/testimoni"];

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PAGES.some(p => pathname === p || pathname.startsWith(p + "?") || pathname.startsWith(p + "/"));

  if (isPublicPage) return <>{children}</>;

  return (
    <AuthProvider>
      <MobileNavProvider>
        <PrivacyProvider>
          <div className="admin-shell flex min-h-screen">
            <Sidebar />
            <BulkTransactionLauncher />
            <main className="flex-1 lg:ml-[260px] ml-0 min-h-screen min-w-0">{children}</main>
          </div>
        </PrivacyProvider>
      </MobileNavProvider>
    </AuthProvider>
  );
}
