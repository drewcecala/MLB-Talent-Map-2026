import type { Metadata } from "next";
import { MlbHighSchoolMap } from "./MlbHighSchoolMap";

export const metadata: Metadata = {
  title: "High schools producing MLB and MiLB talent since 2000",
  description:
    "Map and rank U.S. high schools across 54,980 official MLB and affiliated MiLB season participants from 2000 through August 24, 2026.",
  alternates: { canonical: "/mlb-high-school-map" },
};

export default function MlbHighSchoolMapPage() {
  return <MlbHighSchoolMap />;
}
