import AdminMemberNav from "../AdminMemberNav";
import AdminCommunityClient from "./AdminCommunityClient";

export default function AdminMemberCommunityPage() {
  return <main className="min-h-screen bg-[var(--bg-primary)] px-4 py-6 text-[var(--text-primary)] md:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--accent-primary)]">Member Operations</p>
        <h1 className="mt-1 text-3xl font-black">Komunitas Member</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Pantau satu ruang chat Member, hapus pesan, mute, ban, dan buka kembali akses komunitas.</p>
      </div>
      <AdminMemberNav />
      <AdminCommunityClient />
    </div>
  </main>;
}
