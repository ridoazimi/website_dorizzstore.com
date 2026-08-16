import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import CheckoutClient from "./CheckoutClient";
import type { Metadata } from "next";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const params = await props.params;
  const product = await prisma.product.findUnique({
    where: { slug: params.slug }
  });

  if (!product || !product.isActive) {
    return {
      title: "Produk Tidak Ditemukan - Dorizz Store",
      description: "Halaman produk tidak ditemukan atau sudah tidak aktif di Dorizz Store.",
    };
  }

  // Bersihkan deskripsi HTML untuk meta tag
  const plainDescription = product.description
    ? product.description.replace(/<[^>]*>/g, "").substring(0, 160)
    : `Beli ${product.name} premium murah, legal, dan bergaransi hanya di Dorizz Store. Proses pengiriman instan 24 jam.`;

  return {
    title: `Beli ${product.name} Murah & Bergaransi - Dorizz Store`,
    description: plainDescription,
    keywords: [product.name.toLowerCase(), `beli ${product.name.toLowerCase()}`, "dorizz store", "akun premium murah"],
    openGraph: {
      title: `Beli ${product.name} Murah & Bergaransi - Dorizz Store`,
      description: plainDescription,
      url: `https://dorizzstore.com/checkout/${product.slug}`,
      siteName: "Dorizz Store",
      images: product.imageUrl
        ? [
            {
              url: product.imageUrl,
              alt: product.name,
            },
          ]
        : [
            {
              url: "/images/logo.png",
              width: 500,
              height: 500,
              alt: "Dorizz Store Logo",
            },
          ],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `Beli ${product.name} Murah & Bergaransi - Dorizz Store`,
      description: plainDescription,
      images: product.imageUrl ? [product.imageUrl] : ["/images/logo.png"],
    },
  };
}

export default async function CheckoutPage(props: { 
  params: Promise<{ slug: string }>,
  searchParams: Promise<{ ref?: string }>
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const cookieStore = await cookies();
  const referralCookie = cookieStore.get("dorizz_referral")?.value || "";
  
  const product = await prisma.product.findUnique({
    where: { slug: params.slug }
  });

  if (!product || !product.isActive) {
    notFound();
  }

  // Hitung stok tersedia
  const stocks = await prisma.stockAccount.findMany({
    where: {
      productId: product.id,
      status: "available"
    }
  });

  const availableStock = stocks.reduce((acc, curr) => {
    const slots = (curr.maxSlots || 0) - (curr.usedSlots || 0);
    return acc + (slots > 0 ? slots : 0);
  }, 0);

  // Ubah Decimal Prisma menjadi tipe data standard/JSON safe untuk di-pass ke Client Component
  const productData = {
    ...product,
    price: Number(product.price),
    availableStock
  };


  return <CheckoutClient product={productData} initialRef={searchParams.ref || referralCookie} />;
}
