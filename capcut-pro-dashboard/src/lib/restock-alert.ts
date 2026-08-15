import { prisma } from "@/lib/db";

const RESTOCK_ALERT_EMAIL = process.env.RESTOCK_ALERT_EMAIL || "a.r.kurami01@gmail.com";

const RESTOCK_THRESHOLDS: Record<string, { label: string; threshold: number }> = {
  mobile: { label: "HP", threshold: 2 },
  desktop: { label: "PC", threshold: 1 },
};

/**
 * Kirim peringatan restok saat stok jual menyentuh ambang batas.
 * Dipanggil hanya setelah satu slot stok berhasil digunakan agar email
 * tidak terkirim hanya karena dashboard/endpoint stok dibuka.
 */
export async function notifyRestockIfNeeded(productType: string | null | undefined) {
  const type = (productType || "").toLowerCase();
  const config = RESTOCK_THRESHOLDS[type];
  if (!config) return;

  const accounts = await prisma.stockAccount.findMany({
    where: {
      productType: type,
      usageType: "sale",
    },
    select: {
      usedSlots: true,
      maxSlots: true,
      product: { select: { maxSlots: true } },
    },
  });

  const defaultMaxSlots = type === "desktop" ? 2 : 3;
  const remaining = accounts.reduce((total, account) => {
    const maxSlots = account.maxSlots ?? account.product?.maxSlots ?? defaultMaxSlots;
    return total + Math.max(0, maxSlots - (account.usedSlots ?? 0));
  }, 0);

  // Hanya kirim tepat saat stok menyentuh threshold, bukan setiap request
  // selama stok berada di bawah threshold.
  if (remaining !== config.threshold) return;

  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) {
    console.error(`[restock-alert] BREVO_API_KEY belum tersedia. Alert ${config.label} tidak terkirim.`);
    return;
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || "dorizztim@gmail.com";
  const senderName = process.env.BREVO_SENDER_NAME || "Tim Dorizz";
  const subject = `⚠️ Perlu Restok: Stok Produk ${config.label} Tinggal ${remaining}`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: RESTOCK_ALERT_EMAIL, name: "Dorizz Store" }],
      subject,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
          <h2 style="margin-bottom:8px">⚠️ Stok Produk ${config.label} Menipis</h2>
          <p>Stok jual produk <strong>${config.label}</strong> saat ini tersisa <strong>${remaining}</strong> slot.</p>
          <p>Segera lakukan restok agar pesanan berikutnya tidak masuk kondisi stok kosong / pre-order.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
          <p style="font-size:13px;color:#6b7280">Notifikasi otomatis Dorizz Store • Threshold ${config.label}: ${config.threshold}</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[restock-alert] Gagal kirim alert ${config.label}: ${response.status} ${detail}`);
  } else {
    console.log(`[restock-alert] Alert ${config.label} terkirim ke ${RESTOCK_ALERT_EMAIL}. Sisa: ${remaining}`);
  }
}
