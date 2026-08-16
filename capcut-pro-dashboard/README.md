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
