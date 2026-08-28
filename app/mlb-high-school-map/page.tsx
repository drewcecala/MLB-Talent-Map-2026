import type { Metadata } from "next";
import { MlbHighSchoolMap } from "./MlbHighSchoolMap";

export const metadata: Metadata = {
  title: "High schools producing MLB and MiLB talent since 2000",
  description:
    "Map and rank U.S. high schools for 49,771 players whose official MLB or affiliated MiLB careers began in 2000 or later.",
  alternates: { canonical: "/mlb-high-school-map/" },
};

export default function MlbHighSchoolMapPage() {
  return <MlbHighSchoolMap />;
}
