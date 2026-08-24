import type { Metadata } from "next";
import { MlbCollegeMap } from "./MlbCollegeMap";

export const metadata: Metadata = {
  title: "MLB college talent map — source review",
  description:
    "Publication-status audit for the MLB college talent map using players whose professional careers began in 2000 or later.",
  alternates: { canonical: "/mlb-college-map" },
};

export default function MlbCollegeMapPage() {
  return <MlbCollegeMap />;
}
