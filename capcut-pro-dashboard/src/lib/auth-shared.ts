// ─── Shared auth constants & types (safe for client AND server) ──────────────
// JANGAN import server-only modules di sini (bcrypt, jose, cookies, NextResponse)

export const ALL_PERMISSIONS = {
  page_ai: "AI Business Copilot",
  page_transactions: "Halaman Transaksi",
  page_customers: "Halaman Pelanggan",
  page_stock: "Halaman Stok Akun",
  page_followup: "Halaman Follow-Up",
  page_retention: "Analisis Retensi",
  page_members: "Halaman Member",
  // Legacy key retained temporarily so existing admin permission records remain readable.
  page_affiliates: "Halaman Afiliator (Legacy)",
  page_sales: "Halaman Tim Sales",
  page_messages: "Riwayat Pesan",
  page_settings: "Halaman Settings",
  page_absensi: "Halaman Absensi",
  page_warranty: "Halaman Klaim Garansi",
  page_marketplace: "Katalog Produk",
  page_testimonials: "Kelola Testimoni",
  page_vouchers: "Manajemen Voucher",
  export_data: "Export CSV",
  import_data: "Import CSV/Excel",
  delete_data: "Hapus Data",
} as const;

export type PermissionKey = keyof typeof ALL_PERMISSIONS;

export const DEFAULT_ADMIN_PERMISSIONS: Record<PermissionKey, boolean> = {
  page_ai: false,
  page_transactions: true,
  page_customers: true,
  page_stock: false,
  page_followup: true,
  page_retention: true,
  page_members: false,
  page_affiliates: false,
  page_sales: true,
  page_messages: true,
  page_settings: false,
  page_absensi: true,
  page_warranty: true,
  page_marketplace: true,
  page_testimonials: true,
  page_vouchers: false,
  export_data: true,
  import_data: false,
  delete_data: false,
};
