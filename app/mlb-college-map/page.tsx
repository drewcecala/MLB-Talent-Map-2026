import type { Metadata } from "next";
import { MlbCollegeMap } from "./MlbCollegeMap";

export const metadata: Metadata = {
  title: "Colleges producing MLB and MiLB talent since 2000",
  description:
    "Map and rank the leading colleges across 54,980 official MLB and affiliated MiLB season participants from 2000 through August 24, 2026.",
  alternates: { canonical: "/mlb-college-map" },
};

export default function MlbCollegeMapPage() {
  return <MlbCollegeMap />;
}
