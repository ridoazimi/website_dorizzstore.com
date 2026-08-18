import { notFound } from "next/navigation";
import PortalPageClient from "../PortalPageClient";

const sections = ["dashboard","referral","points","rewards","redemptions","withdrawals","leaderboard","notifications","activity","profile","help"] as const;

type Section = typeof sections[number];

export default async function MemberPortalSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section as Section)) notFound();
  return <PortalPageClient section={section as Section} />;
}
