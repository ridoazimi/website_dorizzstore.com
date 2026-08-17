"use client";

import { useState, useEffect } from "react";
import RichTextEditor from "@/components/RichTextEditor";
import Topbar from "@/components/Topbar";
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Loader2,
  Image as ImageIcon,
  Tag,
  GripVertical
} from "lucide-react";
import Image from "next/image";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  reorderProducts
} from "./actions";

interface Product {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: any;
  discountPercentage?: number | null;
  imageUrl: string | null;
  category: string | null;
  maxSlots: number | null;
  duration: number | null;
  availableStock?: number;
  soldCount?: number;
  isActive: boolean;
  stockStatus: string;
  rules: string | null;
  messageTemplate: string | null;
  sortOrder?: number | null;
  createdAt?: string | Date | null;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    price: "",
    discountPercentage: "0",
    category: "",
    maxSlots: "3",
    duration: "30",
    imageUrl: "",
    isActive: true,
    stockStatus: "INTEGRATED",
    rules: "",
    messageTemplate: ""
  });
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const data = await getProducts();
      setProducts(data as any);
    } catch (error) {
      console.error("Failed to fetch products:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (product?: Product) => {
    setImageFile(null);
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        slug: product.slug || "",
        description: product.description || "",
        price: product.price.toString(),
        discountPercentage: product.discountPercentage !== undefined && product.discountPercentage !== null
          ? String(product.discountPercentage)
          : "0",
        category: product.category || "",
        maxSlots: (product.maxSlots || 3).toString(),
        duration: (product.duration || 30).toString(),
        imageUrl: product.imageUrl || "",
        isActive: product.isActive,
        stockStatus: product.stockStatus || "INTEGRATED",
        rules: product.rules || "",
        messageTemplate: product.messageTemplate || ""
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: "",
        slug: "",
        description: "",
        price: "",
        discountPercentage: "0",
        category: "",
        maxSlots: "3",
        duration: "30",
        imageUrl: "",
        isActive: true,
        stockStatus: "INTEGRATED",
        rules: "",
        messageTemplate: ""
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const discountVal = Number(formData.discountPercentage);
    if (isNaN(discountVal) || discountVal < 0 || discountVal > 100) {
      alert("Diskon (%) harus berupa angka antara 0 dan 100.");
      return;
    }

    setSubmitting(true);

    try {
      const data = new FormData();
      data.append("name", formData.name);
      data.append("slug", formData.slug);
      data.append("description", formData.description);
      data.append("price", formData.price);
      data.append("discountPercentage", formData.discountPercentage);
      data.append("category", formData.category);
      data.append("maxSlots", formData.maxSlots);
      data.append("duration", formData.duration);
      data.append("isActive", formData.isActive.toString());
      data.append("stockStatus", formData.stockStatus);
      data.append("rules", formData.rules);
      data.append("messageTemplate", formData.messageTemplate);
      data.append("imageUrl", formData.imageUrl);

      if (imageFile) {
        data.append("imageFile", imageFile);
      }

      if (editingProduct) {
        await updateProduct(editingProduct.id, data);
      } else {
        await createProduct(data);
      }

      setIsModalOpen(false);
      fetchProducts();
    } catch (error: any) {
      console.error("Failed to save product:", error);
      alert(`Gagal menyimpan produk: ${error.message || "Terjadi kesalahan internal"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus produk ini?")) return;
    setIsDeleting(id);
    try {
      await deleteProduct(id);
      fetchProducts();
    } catch (error) {
      console.error("Failed to delete product:", error);
    } finally {
      setIsDeleting(null);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDrop = async (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex || search.trim() !== "") {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...products];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, draggedItem);

    setProducts(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);

    setSavingOrder(true);
    try {
      const payload = updated.map((p, idx) => ({ id: p.id, sortOrder: idx }));
      await reorderProducts(payload);
    } catch (err) {
      console.error("Gagal menyimpan urutan produk:", err);
      alert("Gagal menyimpan urutan produk. Mengembalikan posisi...");
      fetchProducts();
    } finally {
      setSavingOrder(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <>
      <Topbar title="Manajemen Produk" subtitle="Kelola katalog produk marketplace Anda" />

      <div className="px-4 md:px-8 pb-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
            <input
              type="text"
              placeholder="Cari nama produk atau kategori..."
              className="form-input pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="btn-primary"
          >
            <Plus size={18} />
            Tambah Produk
          </button>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10 text-center">Urutan</th>
                  <th>Produk</th>
                  <th>Kategori</th>
                  <th>Harga</th>
                  <th>Stok</th>
                  <th>Status</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-20">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="animate-spin text-[var(--accent-primary)]" size={32} />
                        <span className="text-[var(--text-secondary)]">Memuat produk...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-20 text-[var(--text-muted)]">
                      Produk tidak ditemukan
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product, index) => (
                    <tr
                      key={product.id}
                      draggable={!search}
                      onDragStart={(e) => {
                        if (search) return;
                        setDraggedIndex(index);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        if (search) return;
                        e.preventDefault();
                        setDragOverIndex(index);
                      }}
                      onDragLeave={() => {
                        if (dragOverIndex === index) setDragOverIndex(null);
                      }}
                      onDrop={(e) => {
                        if (search) return;
                        e.preventDefault();
                        handleDrop(index);
                      }}
                      onDragEnd={() => {
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      className={`transition-all duration-150 ${
                        draggedIndex === index ? "opacity-30 bg-indigo-500/10" : ""
                      } ${
                        dragOverIndex === index ? "border-t-2 border-indigo-500 bg-indigo-500/10" : ""
                      }`}
                    >
                      <td className="w-10 text-center">
                        <div
                          className={`inline-flex items-center justify-center p-1.5 rounded-lg transition-colors ${
                            search ? "opacity-30 cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          }`}
                          title={search ? "Hapus pencarian untuk mengubah urutan" : "Tarik untuk mengubah urutan"}
                        >
                          <GripVertical size={18} />
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-[var(--bg-secondary)] overflow-hidden flex-shrink-0 border border-[var(--border-color)]">
                            {product.imageUrl ? (
                              <Image
                                src={product.imageUrl}
                                alt={product.name}
                                width={48}
                                height={48}
                                className="object-cover w-full h-full"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                                <Package size={20} />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--text-primary)]">{product.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">/{product.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral">
                          <Tag size={12} className="mr-1" />
                          {product.category || "Uncategorized"}
                        </span>
                      </td>
                      <td className="font-bold text-[var(--text-primary)]">
                        {formatCurrency(Number(product.price))}
                      </td>
                      <td>
                        {product.stockStatus === "PREORDER" ? (
                          <span className="font-medium text-amber-400">⚡ Pre-order</span>
                        ) : (
                          <div className="flex flex-col">
                            <span className={`font-medium ${(product.availableStock || 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {(product.availableStock || 0)} Slot
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">📦 Integrated</span>
                          </div>
                        )}
                      </td>
                      <td>
                        {product.isActive ? (
                          <span className="badge badge-success">Aktif</span>
                        ) : (
                          <span className="badge badge-danger">Nonaktif</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenModal(product)}
                            className="btn-icon"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="btn-icon hover:text-red-400"
                            title="Hapus"
                            disabled={isDeleting === product.id}
                          >
                            {isDeleting === product.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content max-w-2xl">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                {editingProduct ? "Edit Produk" : "Tambah Produk Baru"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="btn-icon border-none bg-transparent">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="form-label">Nama Produk</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Contoh: CapCut Pro 1 Bulan"
                    value={formData.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
                      setFormData({...formData, name, slug: editingProduct ? formData.slug : slug});
                    }}
                  />
                </div>
                <div>
                  <label className="form-label">Slug URL</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="capcut-pro-1-bulan"
                    value={formData.slug}
                    onChange={(e) => setFormData({...formData, slug: e.target.value})}
                  />
                </div>
                <div>
                  <label className="form-label">Kategori</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: Video Editing"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                  />
                </div>
                <div>
                  <label className="form-label">Harga (IDR)</label>
                  <input
                    type="number"
                    required
                    className="form-input"
                    placeholder="25000"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                  />
                </div>
                <div>
                  <label className="form-label">Diskon (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="form-input"
                    placeholder="0"
                    value={formData.discountPercentage}
                    onChange={(e) => setFormData({...formData, discountPercentage: e.target.value})}
                  />
                </div>
                <div>
                  <label className="form-label">Maksimal Slot Akun</label>
                  <input
                    type="number"
                    required
                    className="form-input"
                    placeholder="3"
                    value={formData.maxSlots}
                    onChange={(e) => setFormData({...formData, maxSlots: e.target.value})}
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    Contoh: 3 untuk Mobile, 2 untuk Desktop
                  </p>
                </div>
                <div>
                  <label className="form-label">Durasi (Hari)</label>
                  <input
                    type="number"
                    required
                    className="form-input"
                    placeholder="30"
                    value={formData.duration}
                    onChange={(e) => setFormData({...formData, duration: e.target.value})}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="form-label">Gambar Produk</label>
                  <div className="flex flex-col md:flex-row gap-4 items-start">
                    <div className="relative w-32 h-32 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] overflow-hidden flex-shrink-0 group">
                      {(imageFile || formData.imageUrl) ? (
                        <Image
                          src={imageFile ? URL.createObjectURL(imageFile) : formData.imageUrl}
                          alt="Preview"
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                          <ImageIcon size={32} />
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setImageFile(e.target.files[0]);
                          }
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <span className="text-[10px] text-white font-bold uppercase tracking-wider">Ubah</span>
                      </div>
                    </div>

                    <div className="flex-1 w-full space-y-3">
                      <div>
                        <p className="text-[11px] text-[var(--text-muted)] mb-2 uppercase font-bold tracking-widest">Atau Gunakan URL Luar</p>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="https://example.com/image.png"
                          value={formData.imageUrl}
                          onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                        />
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] italic">
                        * Disarankan ukuran 500x500px (1:1). Maksimal 2MB.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="form-label">Deskripsi Produk</label>
                  <RichTextEditor
                    value={formData.description}
                    onChange={(content) => setFormData({...formData, description: content})}
                    placeholder="Jelaskan detail produk..."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="form-label">Aturan & Garansi (Rules)</label>
                  <RichTextEditor
                    value={formData.rules}
                    onChange={(content) => setFormData({...formData, rules: content})}
                    placeholder="Tuliskan aturan, syarat, dan ketentuan garansi untuk produk ini..."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="form-label">Template Kirim Akun (Copywriting WA)</label>
                  <textarea
                    className="form-input min-h-[120px] font-mono text-sm"
                    placeholder="Halo [customer_name], ini akun [product_name] Anda:\nEmail: [email]\nPass: [password]\n..."
                    value={formData.messageTemplate}
                    onChange={(e) => setFormData({...formData, messageTemplate: e.target.value})}
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    Gunakan placeholder: [customer_name], [product_name], [email], [password], [expiry_date]
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="form-label">Tipe Integrasi Stok</label>
                  <div className="flex flex-col md:flex-row gap-4">
                    <label className="flex items-center gap-2 cursor-pointer bg-[var(--bg-secondary)] p-3 rounded-xl border border-[var(--border-color)] flex-1">
                      <input
                        type="radio"
                        name="stockStatus"
                        value="INTEGRATED"
                        className="w-4 h-4 accent-[var(--accent-primary)]"
                        checked={formData.stockStatus === "INTEGRATED"}
                        onChange={(e) => setFormData({...formData, stockStatus: e.target.value})}
                      />
                      <div>
                        <p className="text-sm font-bold text-[var(--text-primary)]">Terintegrasi Stok</p>
                        <p className="text-[10px] text-[var(--text-muted)]">Otomatis tidak bisa dibeli jika stok kosong</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer bg-[var(--bg-secondary)] p-3 rounded-xl border border-[var(--border-color)] flex-1">
                      <input
                        type="radio"
                        name="stockStatus"
                        value="PREORDER"
                        className="w-4 h-4 accent-[var(--accent-primary)]"
                        checked={formData.stockStatus === "PREORDER"}
                        onChange={(e) => setFormData({...formData, stockStatus: e.target.value})}
                      />
                      <div>
                        <p className="text-sm font-bold text-[var(--text-primary)]">Pre-order</p>
                        <p className="text-[10px] text-[var(--text-muted)]">Bisa dibeli kapan saja (stok tersedia/kosong)</p>
                      </div>
                    </label>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-[var(--accent-primary)]"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                    />
                    <span className="text-sm text-[var(--text-primary)]">Aktifkan produk di marketplace</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary"
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : editingProduct ? "Simpan Perubahan" : "Tambah Produk"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
