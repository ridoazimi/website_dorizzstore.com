"use client";

import { usePathname, useRouter } from "next/navigation";
import { UsersRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function BulkTransactionLauncher() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission, isDeveloper } = useAuth();

  const onTransactions = pathname === "/transactions";
  const allowed = isDeveloper || hasPermission("page_transactions");
  if (!onTransactions || !allowed) return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/transactions/bulk")}
      className="fixed right-4 md:right-6 bottom-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold text-white shadow-2xl transition-transform hover:-translate-y-0.5 active:translate-y-0"
      style={{
        background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
        border: "1px solid rgba(165,180,252,.35)",
        boxShadow: "0 14px 40px rgba(79,70,229,.35)",
      }}
      title="Input banyak customer dan transaksi sekaligus"
    >
      <UsersRound size={17} />
      Input Massal
    </button>
  );
}
