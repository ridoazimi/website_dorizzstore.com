import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  DORIZZ_AI_TOOLS,
  executeDorizzAiTool,
  tryDirectDorizzAnswer,
  type AiAccess,
} from "@/lib/dorizz-ai-reader";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function casualAnswer(question: string) {
  const q = question.toLowerCase();
  if (q.includes("siapa kamu") || q.includes("kamu siapa")) {
    return "Saya Dorizz AI, copilot bisnis internal Dorizz Store. Saya bisa membaca data live sesuai permission admin dan membantu mencari data customer, transaksi, expiry, stok, sales, affiliate, warranty, follow-up, sampai analisis keputusan bisnis.";
  }
  if (q.includes("kamu lagi ngapain") || q.includes("lagi ngapain")) {
    return "Saya siap membaca database Dorizz Store secara read-only dan membantu kamu mengambil keputusan. Tanya saja data atau analisis yang kamu butuhkan.";
  }
  if (q.includes("makasih") || q.includes("terima kasih")) return "Siap. Tinggal tanya data atau keputusan bisnis berikutnya.";
  return null;
}

function shouldRequireDatabaseTool(question: string) {
  const q = question.toLowerCase();
  return [
    "dorizz",
    "kita",
    "bisnis",
    "target market",
    "customer",
    "pelanggan",
    "nomor",
    "whatsapp",
    "transaksi",
    "order",
    "omzet",
    "revenue",
    "lead",
    "expired",
    "berakhir",
    "stok",
    "stock",
    "produk",
    "sales",
    "affiliate",
    "afiliasi",
    "warranty",
    "garansi",
    "follow up",
    "follow-up",
    "pesan",
    "voucher",
    "absensi",
    "tugas",
    "admin",
    "database",
  ].some((word) => q.includes(word));
}

function parseToolArgs(raw: string) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function compactToolResult(value: unknown) {
  const raw = JSON.stringify(value);
  if (raw.length <= 24000) return raw;
  return JSON.stringify({
    truncated: true,
    note: "Hasil terlalu panjang; berikut preview awal. Persempit filter jika perlu semua record.",
    preview: raw.slice(0, 23000),
  });
}

function usageSummary(...usages: any[]) {
  return usages.reduce(
    (total, usage) => ({
      promptTokens: total.promptTokens + Number(usage?.prompt_tokens || 0),
      completionTokens: total.completionTokens + Number(usage?.completion_tokens || 0),
      totalTokens: total.totalTokens + Number(usage?.total_tokens || 0),
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

async function callOpenAI(body: Record<string, unknown>, apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let payload: any = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    console.error("Dorizz AI OpenAI non-JSON response:", response.status, raw.slice(0, 300));
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
  }
  return payload;
}

// GET /api/stats - statistik ringkas untuk Dashboard Overview
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const [
      totalTransactions,
      totalUsers,
      availableStock,
      activeUsers,
      recentTransactions,
      expiringUsers,
      pendingWarrantyClaims,
    ] = await Promise.all([
      prisma.transaction.count(),
      prisma.user.count(),
      prisma.stockAccount.count({ where: { status: "available" } }),
      prisma.appSetting.findUnique({ where: { key: "customer_active_days" } }).then(async (setting) => {
        const activeDays = Math.max(1, parseInt(setting?.value || "60") || 60);
        return prisma.user.count({
          where: {
            transactions: {
              some: {
                status: "success",
                purchaseDate: { gte: new Date(Date.now() - activeDays * DAY_MS) },
              },
            },
          },
        });
      }),
      prisma.transaction.findMany({
        include: { user: { select: { name: true, email: true, whatsapp: true } } },
        orderBy: { purchaseDate: "desc" },
        take: 5,
      }),
      prisma.transaction.findMany({
        where: {
          warrantyExpiredAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0) - 7 * 60 * 60 * 1000),
            lte: new Date(Date.now() + 7 * DAY_MS),
          },
          status: "success",
        },
        include: { user: { select: { name: true, whatsapp: true, followUpStatus: true } } },
        orderBy: { warrantyExpiredAt: "asc" },
        take: 20,
      }),
      prisma.warrantyClaim.count({ where: { status: "pending" } }),
    ]);

    return NextResponse.json({
      totalTransactions,
      totalUsers,
      availableStock,
      activeUsers,
      recentTransactions,
      expiringUsers,
      pendingWarrantyClaims,
    });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json({ error: "Gagal mengambil statistik" }, { status: 500 });
  }
}

// POST /api/stats - Dorizz AI: read-only database copilot
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const permissions = auth.dbUser.permissions as Record<string, boolean> | null;
  const access: AiAccess = {
    isDeveloper: auth.user.role === "developer",
    permissions,
  };

  if (!access.isDeveloper && permissions?.page_ai !== true) {
    return NextResponse.json({ error: "Akses Dorizz AI tidak diizinkan." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const messages: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages
          .filter((item: unknown) => {
            if (!item || typeof item !== "object") return false;
            const value = item as Record<string, unknown>;
            return (value.role === "user" || value.role === "assistant") && typeof value.content === "string";
          })
          .map((item: ChatMessage) => ({
            role: item.role,
            content: item.content.trim().slice(0, 1400),
          }))
          .slice(-8)
      : [];

    if (!messages.length || messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json({ error: "Pertanyaan belum diisi" }, { status: 400 });
    }

    const lastQuestion = messages[messages.length - 1].content;

    const casual = casualAnswer(lastQuestion);
    if (casual) {
      return NextResponse.json({
        answer: casual,
        generatedAt: new Date().toISOString(),
        mode: "local",
        model: null,
        toolsUsed: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });
    }

    // Pertanyaan angka operasional yang sederhana dijawab langsung dari DB tanpa token OpenAI.
    const direct = await tryDirectDorizzAnswer(lastQuestion, access);
    if (direct) {
      return NextResponse.json({
        answer: direct,
        generatedAt: new Date().toISOString(),
        mode: "database-direct",
        model: null,
        toolsUsed: ["direct_database_query"],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });
    }

    const openAIKey = process.env.OPENAI_API_KEY?.trim();
    const openAIModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    if (!openAIKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY belum tersedia di server." }, { status: 503 });
    }

    const system = `Kamu adalah Dorizz AI, database copilot dan business analyst internal Dorizz Store.

ATURAN WAJIB:
1. Untuk pertanyaan tentang data internal Dorizz Store, jangan pernah mengandalkan angka dari pesan assistant sebelumnya. Selalu gunakan tool database dan anggap hasil tool sebagai source of truth.
2. Kamu read-only: tidak boleh mengklaim mengubah, menghapus, mengirim, atau mengedit data.
3. Jika user meminta nama customer, nomor WhatsApp, atau email, gunakan query_dorizz_data dengan include_contacts=true atau get_customer_profile, lalu tampilkan data yang benar-benar ditemukan.
4. Jika user bertanya customer yang expired/berakhir pada tanggal tertentu, gunakan domain expirations. Untuk "hari ini", gunakan period=today.
5. Jika user bertanya target market/strategi, jangan memberi jawaban generik. Gunakan beberapa metrik relevan, terutama group_by=product, source, customer_type, dan summary bila perlu. Jelaskan bahwa database tidak punya demografi seperti umur/gender/kota jika memang field itu tidak tersedia; jangan mengarang demografi.
6. Untuk transaksi, tanggal mengikuti definisi halaman Transaksi admin agar angka konsisten dengan tabel admin.
7. Password admin, password sales/affiliate, password akun stok, API key, JWT secret, dan credential lain sengaja tidak tersedia ke AI. Jangan meminta atau mengarangnya.
8. Hormati permission: jika tool mengembalikan akses ditolak, jelaskan singkat tanpa mencoba menebak datanya.
9. Jawab dalam Bahasa Indonesia, natural, langsung, dan berbasis data. Untuk daftar customer, gunakan format yang mudah dibaca. Untuk analisis, jelaskan bukti angka dan implikasi bisnis.
10. Hemat token: panggil hanya tool yang relevan dan batasi data seperlunya. Maksimal sekitar 250 kata kecuali user meminta detail panjang.`;

    const initialMessages: any[] = [
      { role: "system", content: system },
      ...messages,
    ];

    const first = await callOpenAI(
      {
        model: openAIModel,
        messages: initialMessages,
        tools: DORIZZ_AI_TOOLS,
        tool_choice: shouldRequireDatabaseTool(lastQuestion) ? "required" : "auto",
        parallel_tool_calls: true,
        temperature: 0.15,
        max_tokens: 500,
        store: false,
      },
      openAIKey,
    );

    const firstMessage = first?.choices?.[0]?.message;
    const toolCalls = Array.isArray(firstMessage?.tool_calls) ? firstMessage.tool_calls.slice(0, 6) : [];

    if (!toolCalls.length) {
      const answer = typeof firstMessage?.content === "string" ? firstMessage.content.trim() : "";
      if (!answer) throw new Error("OpenAI tidak mengembalikan jawaban maupun tool call.");
      return NextResponse.json({
        answer,
        generatedAt: new Date().toISOString(),
        mode: "openai",
        model: openAIModel,
        toolsUsed: [],
        usage: usageSummary(first?.usage),
      });
    }

    const toolOutputs = await Promise.all(
      toolCalls.map(async (call: any) => {
        const name = String(call?.function?.name || "");
        const args = parseToolArgs(String(call?.function?.arguments || "{}"));
        const result = await executeDorizzAiTool(name, args, access);
        return {
          name,
          message: {
            role: "tool",
            tool_call_id: call.id,
            content: compactToolResult(result),
          },
        };
      }),
    );

    const secondMessages: any[] = [
      ...initialMessages,
      {
        role: "assistant",
        content: firstMessage?.content ?? null,
        tool_calls: toolCalls,
      },
      ...toolOutputs.map((item) => item.message),
    ];

    const second = await callOpenAI(
      {
        model: openAIModel,
        messages: secondMessages,
        tools: DORIZZ_AI_TOOLS,
        tool_choice: "none",
        temperature: 0.15,
        max_tokens: 700,
        store: false,
      },
      openAIKey,
    );

    const answer = typeof second?.choices?.[0]?.message?.content === "string"
      ? second.choices[0].message.content.trim()
      : "";
    if (!answer) throw new Error("OpenAI tidak mengembalikan jawaban akhir.");

    const used = toolOutputs.map((item) => item.name);
    const usage = usageSummary(first?.usage, second?.usage);
    console.log("[Dorizz AI]", { tools: used, tokens: usage.totalTokens });

    return NextResponse.json({
      answer,
      generatedAt: new Date().toISOString(),
      mode: "openai-tools",
      model: openAIModel,
      toolsUsed: used,
      usage,
    });
  } catch (error) {
    console.error("POST /api/stats Dorizz AI error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? `Dorizz AI gagal: ${error.message}` : "Dorizz AI gagal memproses permintaan." },
      { status: 500 },
    );
  }
}
