from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "capcut-pro-dashboard"


def edit(rel, replacements):
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    original = text
    for old, new, expected in replacements:
        count = text.count(old)
        if count != expected:
            raise SystemExit(f"{rel}: expected {expected} occurrence(s), found {count}: {old[:80]!r}")
        text = text.replace(old, new)
    if text == original:
        raise SystemExit(f"{rel}: no changes produced")
    path.write_text(text, encoding="utf-8")
    print(f"updated {rel}")


# Reusable client-side debounce helper.
hook = ROOT / "src/hooks/useDebouncedValue.ts"
hook.parent.mkdir(parents=True, exist_ok=True)
hook.write_text('''"use client";\n\nimport { useEffect, useState } from "react";\n\nexport function useDebouncedValue<T>(value: T, delay = 400): T {\n  const [debouncedValue, setDebouncedValue] = useState(value);\n\n  useEffect(() => {\n    const timer = window.setTimeout(() => setDebouncedValue(value), delay);\n    return () => window.clearTimeout(timer);\n  }, [value, delay]);\n\n  return debouncedValue;\n}\n''', encoding="utf-8")

# Lightweight count endpoint for Sidebar; no /api/stats fan-out.
endpoint = ROOT / "src/app/api/warranty/pending-count/route.ts"
endpoint.parent.mkdir(parents=True, exist_ok=True)
endpoint.write_text('''import { NextResponse } from "next/server";\nimport { prisma } from "@/lib/db";\nimport { requirePermission } from "@/lib/auth";\n\nexport async function GET() {\n  const auth = await requirePermission("page_warranty");\n  if ("error" in auth) return auth.error;\n\n  try {\n    const pendingWarrantyClaims = await prisma.warrantyClaim.count({\n      where: { status: "pending" },\n    });\n    return NextResponse.json({ pendingWarrantyClaims });\n  } catch (error) {\n    console.error("GET /api/warranty/pending-count error:", error);\n    return NextResponse.json({ error: "Gagal mengambil jumlah klaim pending" }, { status: 500 });\n  }\n}\n''', encoding="utf-8")

edit("src/components/Sidebar.tsx", [
    ('const fetchStats = async () => {', 'const fetchPendingWarrantyCount = async () => {', 1),
    ('const res = await fetch("/api/stats");', 'const res = await fetch("/api/warranty/pending-count");', 1),
    ('fetchStats();\n    const interval = setInterval(fetchStats, 5 * 60 * 1000);', 'fetchPendingWarrantyCount();\n    const interval = setInterval(fetchPendingWarrantyCount, 5 * 60 * 1000);', 1),
])

edit("src/app/transactions/page.tsx", [
    ('import * as XLSX from "xlsx";\n', '', 1),
    ('import Topbar from "@/components/Topbar";\n', 'import Topbar from "@/components/Topbar";\nimport { useDebouncedValue } from "@/hooks/useDebouncedValue";\n', 1),
    ('const [search, setSearch] = useState("");', 'const [search, setSearch] = useState("");\n  const debouncedSearch = useDebouncedValue(search, 400);', 1),
    ('if (search) params.set("search", search);', 'if (debouncedSearch) params.set("search", debouncedSearch);', 1),
    ('}, [search, statusFilter, sourceFilter, startDate, endDate, warrantyStartDate, warrantyEndDate]);', '}, [debouncedSearch, statusFilter, sourceFilter, startDate, endDate, warrantyStartDate, warrantyEndDate]);', 1),
    ('} else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {\n      const arrayBuffer = await file.arrayBuffer();', '} else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {\n      const XLSX = await import("xlsx");\n      const arrayBuffer = await file.arrayBuffer();', 1),
])

edit("src/app/users/page.tsx", [
    ('import { usePrivacy } from "@/context/PrivacyContext";\n', 'import { usePrivacy } from "@/context/PrivacyContext";\nimport { useDebouncedValue } from "@/hooks/useDebouncedValue";\n', 1),
    ('const [search, setSearch] = useState("");', 'const [search, setSearch] = useState("");\n  const debouncedSearch = useDebouncedValue(search, 400);', 1),
    ('if (search) params.set("search", search);', 'if (debouncedSearch) params.set("search", debouncedSearch);', 1),
    ('}, [search, activeFilters, sortBy]);', '}, [debouncedSearch, activeFilters, sortBy]);', 1),
])

edit("src/app/dashboard/warranty/page.tsx", [
    ('import { usePrivacy } from "@/context/PrivacyContext";\n', 'import { usePrivacy } from "@/context/PrivacyContext";\nimport { useDebouncedValue } from "@/hooks/useDebouncedValue";\n', 1),
    ('const [search, setSearch] = useState("");', 'const [search, setSearch] = useState("");\n  const debouncedSearch = useDebouncedValue(search, 400);', 1),
    ('if (search) params.set("search", search);', 'if (debouncedSearch) params.set("search", debouncedSearch);', 1),
    ('}, [search]);', '}, [debouncedSearch]);', 1),
])

edit("src/app/sales/page.tsx", [
    ('import { useTheme } from "@/context/ThemeContext";\n', 'import { useTheme } from "@/context/ThemeContext";\nimport { useDebouncedValue } from "@/hooks/useDebouncedValue";\n', 1),
    ('const [search, setSearch] = useState("");', 'const [search, setSearch] = useState("");\n  const debouncedSearch = useDebouncedValue(search, 400);', 1),
    ('if (search) params.set("search", search);', 'if (debouncedSearch) params.set("search", debouncedSearch);', 1),
    ('}, [search, selectedCategory, startDate, endDate]);', '}, [debouncedSearch, selectedCategory, startDate, endDate]);', 1),
])

stock_old = '''  useEffect(() => {\n    setPage(1);\n    setHasMore(true);\n    fetchData(1, false);\n\n    // Fetch products for dropdown\n    fetch("/api/products/list")\n      .then(res => res.json())\n      .then(json => setProducts(json.products || []))\n      .catch(err => console.error("Error fetching products:", err));\n  }, [fetchData]);'''
stock_new = '''  useEffect(() => {\n    setPage(1);\n    setHasMore(true);\n    fetchData(1, false);\n  }, [fetchData]);\n\n  // Product options are static for the lifetime of this page; do not refetch on every filter/search change.\n  useEffect(() => {\n    fetch("/api/products/list")\n      .then(res => res.json())\n      .then(json => setProducts(json.products || []))\n      .catch(err => console.error("Error fetching products:", err));\n  }, []);'''

edit("src/app/stock/page.tsx", [
    ('import Topbar from "@/components/Topbar";\n', 'import Topbar from "@/components/Topbar";\nimport { useDebouncedValue } from "@/hooks/useDebouncedValue";\n', 1),
    ('const [search, setSearch] = useState("");', 'const [search, setSearch] = useState("");\n  const debouncedSearch = useDebouncedValue(search, 400);', 1),
    ('if (search) params.set("search", search);', 'if (debouncedSearch) params.set("search", debouncedSearch);', 1),
    ('}, [search, statusFilter, productIdFilter, productTypeFilter, usageTypeFilter]);', '}, [debouncedSearch, statusFilter, productIdFilter, productTypeFilter, usageTypeFilter]);', 1),
    (stock_old, stock_new, 1),
])

print("low-risk performance patch applied successfully")
