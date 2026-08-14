import { NextResponse } from "next/server";
import { generateText } from "ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const { text } = await generateText({
      model: "openai/gpt-5.6-terra",
      prompt: "Balas tepat dengan kata OK saja.",
    });

    return NextResponse.json(
      { ok: text.trim().toUpperCase() === "OK", response: text.trim().slice(0, 20) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI provider error";
    return NextResponse.json(
      { ok: false, error: message.slice(0, 500) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
