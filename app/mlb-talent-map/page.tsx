import type { Metadata } from "next";
import { MlbTalentMap } from "./MlbTalentMap";

export const metadata: Metadata = {
  title: "Interactive roster map",
  description:
    "Explore every player on an MLB organization roster as of August 24, 2026, including all affiliated minor-league levels, with explicit U.S. birthplace coverage and international-origin counts.",
};

export default function MlbTalentMapPage() {
  return <MlbTalentMap />;
}
