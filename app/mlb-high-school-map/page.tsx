import type { Metadata } from "next";
import { MlbHighSchoolMap } from "./MlbHighSchoolMap";

export const metadata: Metadata = {
  title: "High schools producing MLB talent since 2000",
  description:
    "Map and rank U.S. high schools by distinct players who made an MLB debut from 2000 through August 24, 2026, with player-level source records.",
  alternates: { canonical: "/mlb-high-school-map" },
};

export default function MlbHighSchoolMapPage() {
  return <MlbHighSchoolMap />;
}
