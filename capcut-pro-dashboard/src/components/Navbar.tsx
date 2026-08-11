"use client";

import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import { useState, useEffect } from "react";
import { ShieldCheck, Menu, X } from "lucide-react";

type NavbarProps = {
  variant?: "default" | "dark";
};

export default function Navbar({ variant = "default" }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isDark = variant === "dark";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navClasses = isDark
    ? "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-gray-800/60 backdrop-blur-xl bg-[#0f1218]/95 py-3 shadow-sm"
    : `fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled || isMenuOpen
      ? "border-b border-[var(--border-color)] backdrop-blur-xl bg-[var(--nav-bg)] py-3 shadow-sm"
      : "border-transparent bg-transparent py-5"
    }`;

  const logoTextClasses = isDark
    ? "text-xl font-bold tracking-tight text-white"
    : "text-xl font-bold tracking-tight text-[var(--text-primary)]";

  const accentClasses = isDark ? "text-teal-300" : "text-[var(--accent-primary)]";

  const mobileMenuBtnClasses = isDark
    ? "p-2 rounded-xl bg-[#161b22] border border-gray-800/60 text-white"
    : "p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)]";

  const mobileDropdownClasses = isDark
    ? `md:hidden transition-all duration-300 overflow-hidden ${isMenuOpen ? "max-h-64 border-b border-gray-800/60" : "max-h-0"} bg-[#0f1218] backdrop-blur-xl`
    : `md:hidden transition-all duration-300 overflow-hidden ${isMenuOpen ? "max-h-64 border-b border-[var(--border-color)]" : "max-h-0"} bg-[var(--nav-bg)] backdrop-blur-xl`;

  const mobileStatusTextClasses = isDark
    ? "text-center text-xs text-gray-400 flex items-center justify-center gap-2"
    : "text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2";

  return (
    <nav className={navClasses}>
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-9 h-9 rounded-xl overflow-hidden shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
            <Image
              src="/images/logo.png"
              alt="Logo"
              fill
              className="object-cover"
            />
          </div>
          <span className={logoTextClasses}>
            Dorizz<span className={accentClasses}>Store</span>
          </span>
        </Link>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/warranty"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white font-bold text-sm shadow-[0_0_20px_rgba(32,213,210,0.3)] hover:scale-105 hover:shadow-[0_0_30px_rgba(32,213,210,0.5)] transition-all active:scale-95"
          >
            <ShieldCheck size={18} className="animate-pulse" />
            <span>Claim Garansi</span>
          </Link>
          <div className={`w-[1px] h-6 ${isDark ? "bg-gray-800/60" : "bg-[var(--border-color)]"}`}></div>
          <ThemeToggle />
        </div>

        {/* Mobile Actions */}
        <div className="flex md:hidden items-center gap-3">
          <ThemeToggle />
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={mobileMenuBtnClasses}
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <div className={mobileDropdownClasses}>
        <div className="px-6 py-6 flex flex-col gap-4">
          <Link
            href="/warranty"
            onClick={() => setIsMenuOpen(false)}
            className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white font-bold text-base shadow-[0_0_20px_rgba(32,213,210,0.2)] transition-all active:scale-95"
          >
            <ShieldCheck size={20} className="animate-pulse" />
            <span>Claim Garansi</span>
          </Link>
          <p className={mobileStatusTextClasses}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Layanan Garansi 24/7 Aktif
          </p>
        </div>
      </div>
    </nav>
  );
}
