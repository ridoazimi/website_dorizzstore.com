"use client";

import { useState } from "react";

export default function CommunityClient() {
  const [label] = useState("Komunitas Member");
  return <div>{label}</div>;
}
