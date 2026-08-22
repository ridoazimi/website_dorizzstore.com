import CommunityClient from "./CommunityClient";
import CommunityNotificationGate from "./CommunityNotificationGate";

export default function MemberCommunityPage() {
  return (
    <CommunityNotificationGate>
      <CommunityClient />
    </CommunityNotificationGate>
  );
}
