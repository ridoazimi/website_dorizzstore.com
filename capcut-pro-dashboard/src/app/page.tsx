import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getProducts } from "./dashboard/products/actions";
import { ShoppingCart, Star, Zap, ChevronRight, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import CtaButton, { WhatsAppIcon } from "@/components/CtaButton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dorizz Store - Toko Akun Premium Murah, Cepat & Terpercaya",
  description: "Beli akun premium murah dan legal hanya di Dorizz Store. Menyediakan berbagai akun premium seperti CapCut Pro, Canva Pro, Netflix, dan Spotify dengan pengiriman instan 24 jam dan garansi penuh.",
  keywords: ["dorizz store", "beli akun premium", "capcut pro murah", "canva pro murah", "netflix premium", "spotify premium", "toko akun premium"],
  authors: [{ name: "Dorizz Store" }],
  openGraph: {
    title: "Dorizz Store - Toko Akun Premium Murah, Cepat & Terpercaya",
    description: "Beli akun premium murah dan legal hanya di Dorizz Store. Menyediakan berbagai akun premium seperti CapCut Pro, Canva Pro, Netflix, dan Spotify dengan pengiriman instan 24 jam.",
    url: "https://dorizzstore.com",
    siteName: "Dorizz Store",
    images: [
      {
        url: "/images/logo.png",
        width: 500,
        height: 500,
        alt: "Dorizz Store Logo",
      },
    ],
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Dorizz Store - Toko Akun Premium Murah, Cepat & Terpercaya",
    description: "Beli akun premium murah dan legal hanya di Dorizz Store. Menyediakan berbagai akun premium seperti CapCut Pro, Canva Pro, Netflix, dan Spotify.",
    images: ["/images/logo.png"],
  },
};

export const revalidate = 60; // Cache this page for 60 seconds

export default async function MarketplacePage() {
  const products = await getProducts(true);




  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors duration-300">

      {/* Navbar Placeholder space */}
      <Navbar />

      <main className="p-0 m-0">
        {/* Hero Section - Clean & Minimal */}
        <section className="relative overflow-hidden bg-[var(--hero-bg)] text-[var(--hero-text)] transition-all duration-500">
          {/* Radial Glow - Hidden in light mode */}
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15),transparent_60%)] opacity-50 [data-theme=light]:hidden" />
          <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-2 text-center flex flex-col items-center">
            {/* Logo in Center */}
            <div className="relative w-16 h-16 lg:w-24 lg:h-24 mb-6 rounded-xl overflow-hidden shadow-lg bg-white backdrop-blur-md border border-[var(--border-color)] flex items-center justify-center p-2">
              <Image
                src="/images/logo.png"
                alt="Dorizz Store Logo"
                fill
                className="object-contain p-2 drop-shadow-md"
              />
            </div>
            {/* Handle / Tagline */}
            <h1 className="text-xl md:text-3xl font-bold text-[var(--hero-accent)] mb-4 tracking-wide drop-shadow-sm">
              @dorizzstore
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
              <CtaButton href="/testimoni" icon={<Star size={18} />}>
                Testimoni
              </CtaButton>
              <CtaButton
                href="https://wa.me/6285277815289"
                external
                icon={<WhatsAppIcon size={18} />}
              >
                WhatsApp
              </CtaButton>
            </div>
          </div>
        </section>
        <div className="-mt-1 w-full overflow-hidden leading-none">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320" className="w-full h-auto block"><path fill="var(--hero-bg)" fillOpacity="1" d="M0,160L80,154.7C160,149,320,139,480,117.3C640,96,800,64,960,58.7C1120,53,1280,75,1360,85.3L1440,96L1440,0L1360,0C1280,0,1120,0,960,0C800,0,640,0,480,0C320,0,160,0,80,0L0,0Z"></path></svg>
        </div>

        {/* Product Grid - Marketplace Style */}
        <div className="mt-0 [data-theme=light]:bg-white [data-theme=light]:rounded-3xl [data-theme=light]:shadow-sm">
          <section id="products" className="max-w-7xl mx-auto px-6 pt-0 pb-8">
            {products.length === 0 ? (
              <div className="text-center py-20 bg-[var(--bg-card)] rounded-3xl border border-[var(--border-color)]">
                <p className="text-[var(--text-secondary)]">Belum ada produk yang tersedia.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">
                {products.map((product: any) => {
                  const isPreOrder = product.stockStatus === "PREORDER";
                  const isOutOfStock = !isPreOrder && (product.availableStock || 0) === 0;

                  const isNewProduct = product.createdAt
                    ? (new Date().getTime() - new Date(product.createdAt).getTime()) <= 30 * 24 * 60 * 60 * 1000
                    : false;
                  const soldCount = product.soldCount ?? product._count?.transactions ?? 0;
                  const hasDiscount = Boolean(product.discountPercentage && product.discountPercentage > 0);
                  const discountedPrice = hasDiscount
                    ? Number(product.price) * (1 - product.discountPercentage / 100)
                    : Number(product.price);

                  return (
                    <Link
                      key={product.id}
                      id={`product-link-${product.slug}`}
                      href={isOutOfStock ? "#" : `/checkout/${product.slug}`}
                      className={`group bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden hover:shadow-md transition-all flex flex-col ${isOutOfStock ? 'opacity-75 cursor-default' : ''}`}
                    >
                      <div className="aspect-square relative w-full overflow-hidden bg-slate-100">
                        {isNewProduct && (
                          <div className="absolute top-0 left-0 z-10 w-36 h-36 overflow-hidden pointer-events-none">
                            <div 
                              className="absolute top-6 -left-12 w-48 py-1.5 text-center text-[10px] md:text-xs font-black text-white uppercase tracking-wider shadow-lg -rotate-45 whitespace-nowrap flex items-center justify-center"
                              style={{
                                background: "linear-gradient(135deg, rgb(28, 149, 209), rgb(81, 183, 229))"
                              }}
                            >
                              NEW PRODUCT!
                            </div>
                          </div>
                        )}

                        {product.imageUrl && (
                          <Image
                            src={product.imageUrl}
                            alt={product.name}
                            fill
                            className={`object-cover transition-transform duration-500 ${!isOutOfStock ? 'group-hover:scale-105' : ''}`}
                          />
                        )}
                        {!product.imageUrl && (
                          <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-primary)]/10 to-transparent flex items-center justify-center">
                            <ShoppingCart className="text-[var(--accent-primary)]/30" size={40} />
                          </div>
                        )}
                        
                        {isPreOrder && (
                          <div className="absolute top-2 right-2 z-10">
                            <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-1 rounded-md uppercase shadow-sm border border-white/20">Pre-order</span>
                          </div>
                        )}

                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-20">
                            <div className="flex flex-col items-center gap-1">
                              <span className="bg-red-600 text-white text-[10px] font-black px-4 py-2 rounded-full uppercase shadow-xl border border-white/20">Stok Habis</span>
                              <p className="text-[9px] text-white/80 font-medium">Cek berkala ya!</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="p-3 flex flex-col flex-1">
                        <span className="text-[10px] font-bold text-[var(--accent-primary)] uppercase tracking-wider mb-1">
                          {product.category}
                        </span>
                        <h3 className="text-sm md:text-base font-bold text-[var(--text-primary)] mb-2 leading-tight flex-1 break-words whitespace-normal">
                          {product.name}
                        </h3>
                        <div className="mt-auto">
                          <p className={`text-[10px] font-bold mb-1 ${isOutOfStock ? 'text-red-400' : isPreOrder ? 'text-amber-500' : 'text-emerald-500'}`}>
                            Terjual: {soldCount}
                          </p>
                          <p className={`text-[10px] font-bold mb-1 ${isOutOfStock ? 'text-red-400' : isPreOrder ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {isOutOfStock ? '❌ Stok Habis' : isPreOrder ? '⚡ Pre-order: 1-24 Jam' : `Tersedia: ${product.availableStock} Slot`}
                          </p>
                          {hasDiscount ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm md:text-lg font-black text-[var(--text-primary)]">
                                {formatCurrency(discountedPrice)}
                              </span>
                              <span className="text-xs md:text-sm line-through text-gray-400">
                                {formatCurrency(Number(product.price))}
                              </span>
                              <span className="bg-red-100 text-red-500 text-[10px] md:text-xs font-bold rounded px-1">
                                -{product.discountPercentage}%
                              </span>
                            </div>
                          ) : (
                            <p className="text-sm md:text-lg font-black text-[var(--text-primary)]">
                              {formatCurrency(Number(product.price))}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Testimonials - Simple */}
        <section className="bg-[var(--bg-secondary)] py-20 mt-12">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-2xl font-bold mb-12 text-center">Testimoni Pelanggan</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: "Ahmad Rizky", role: "Content Creator", text: "Pelayanan sangat cepat, admin ramah dan akun langsung aktif. Mantap!" },
                { name: "Siti Nurhaliza", role: "Designer", text: "Harga terjangkau dan kualitas premium. Sangat membantu pekerjaan saya." },
                { name: "Budi Kusuma", role: "Video Editor", text: "Sudah langganan berkali-kali di sini, selalu puas dengan layanannya." }
              ].map((t, i) => (
                <div key={i} className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                  <div className="flex text-amber-400 mb-3">
                    {[...Array(5)].map((_, j) => <Star key={j} size={14} fill="currentColor" />)}
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mb-4 italic leading-relaxed">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent-glow)] flex items-center justify-center font-bold text-[var(--accent-primary)] text-xs">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{t.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

