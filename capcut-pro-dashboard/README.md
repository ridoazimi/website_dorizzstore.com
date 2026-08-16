This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Shopee / WhatsApp Stock Allocation

Gunakan endpoint `POST /api/webhook/shopee-stock` untuk integrasi bot baru. Endpoint ini membutuhkan header `x-webhook-secret` yang nilainya sama dengan environment variable `SHOPEE_STOCK_WEBHOOK_SECRET`. Setiap order harus mengirim `orderId`, `customerWhatsapp` atau `customerId`, serta `productId` atau `productName`.

Contoh payload:

```json
{
  "orderId": "SPX-ORDER-123",
  "customerName": "Shopee Customer",
  "customerWhatsapp": "081234567890",
  "productName": "JASA CAPCUT PRO 29 HARI",
  "amount": 22768
}
```

Endpoint lama `POST /api/stock/allocate` tetap tersedia untuk kompatibilitas bot yang sudah terpasang, tetapi sekarang juga membuat transaksi `shopee-whatsapp` dan mencatat customer pada akun stok. Kedua endpoint menggunakan `orderId` sebagai kunci idempotensi, sehingga retry order yang sama tidak mengonsumsi slot tambahan. Jalankan `stock_allocation_migration.sql` pada database yang belum memiliki tabel `stock_allocations` sebelum menggunakan endpoint tersebut.

Setiap alokasi yang berhasil harus menghasilkan satu transaksi sukses yang terhubung ke `stockAccountId` dan menaikkan `usedSlots` dalam transaksi database yang sama. Page stock juga merekonsiliasi counter dengan transaksi sukses dan alokasi legacy agar customer dari website dan Shopee dihitung bersama.

## Dorizz Loyalty Member

Halaman `/affiliate` sekarang menjadi portal member Loyalty. Satu customer baru dengan transaksi sukses memberikan `3 poin`, dan setiap poin bernilai `Rp1.000`. Member dapat memakai link referral umum `/r/{inviteToken}`. Kode referral disimpan sementara di cookie agar customer dapat memilih produk terlebih dahulu.

Referral hanya valid untuk customer yang belum ada di database Dorizz berdasarkan email atau nomor WhatsApp yang dinormalisasi. Jika customer lama mencoba melanjutkan checkout dari referral, server mengembalikan status `409` dengan kode `EXISTING_CUSTOMER`; UI menampilkan peringatan dan mengarahkan customer ke checkout general sambil menghapus cookie referral.

Member mengajukan withdraw sendiri dari `/affiliate/payout`. Minimum withdraw adalah `30 poin` atau `Rp30.000`, jumlah harus kelipatan 3, dan satu member hanya boleh memiliki satu pengajuan aktif. Poin dikunci menjadi status `held` saat pengajuan dibuat. Admin memproses pengajuan dari `/affiliates`; status `rejected` mengembalikan poin menjadi `available`, sedangkan status `paid` mengubahnya menjadi `spent`.

Jalankan migration berikut sebelum deploy fitur Loyalty Member ke environment yang memakai database lama:

```bash
psql "$DIRECT_URL" -f loyalty_member_migration.sql
```

Migration menambahkan field tujuan pembayaran pada `affiliate_withdrawals` dan membuat tabel `affiliate_point_ledger` beserta index idempotensi reward. Pastikan migration selesai sebelum member menerima reward pertama.

Member dan admin memakai autentikasi portal yang sudah tersedia. Environment production tidak memerlukan secret baru untuk reward karena proses reward berjalan di dalam webhook pembayaran yang sudah ada. Pastikan webhook Lynk.id/payment-success telah terhubung dan setiap transaksi sukses menyimpan `userId` serta `referredBy` dengan benar.
