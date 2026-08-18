import MemberClient from "./MemberClient";
import MemberSessionToolbar from "./MemberSessionToolbar";

export const metadata = {
  title: "Member DorizzStore",
  description: "Gabung Member DorizzStore, ajak teman, kumpulkan poin, dan tukarkan reward.",
};

export default function MemberPage() {
  return (
    <>
      <MemberClient />
      <MemberSessionToolbar />
    </>
  );
}
