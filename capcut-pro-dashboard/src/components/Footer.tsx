"use client";

import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-[var(--bg-primary)] py-12 border-t border-[var(--border-color)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden">
              <Image src="/images/logo.png" alt="Logo" fill className="object-cover" />
            </div>
            <span className="font-bold text-lg">
              Dorizz<span className="text-[var(--accent-primary)]">Store</span>
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
            <a href="/warranty" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors font-medium">Garansi</a>
            <a href="/testimoni" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors font-medium">Testimoni</a>
            <a href="/terms" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors font-medium">Syarat</a>
            <a href="/privacy" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors font-medium">Privasi</a>
          </div>

          <p className="text-xs text-[var(--text-muted)] font-medium">
            © {new Date().getFullYear()} Dorizz Store. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
