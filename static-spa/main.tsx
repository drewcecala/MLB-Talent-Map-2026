import React from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { MlbCollegeMap } from "../app/mlb-college-map/MlbCollegeMap";
import { MlbHighSchoolMap } from "../app/mlb-high-school-map/MlbHighSchoolMap";
import { MlbTalentMap } from "../app/mlb-talent-map/MlbTalentMap";

const highSchoolRoute = window.location.pathname.startsWith("/mlb-high-school-map");
const collegeRoute = window.location.pathname.startsWith("/mlb-college-map");
const title = collegeRoute
  ? "Colleges Producing MLB & MiLB Talent Since 2000 | MLB Talent Map 2026"
  : highSchoolRoute
    ? "High Schools Producing MLB & MiLB Talent Since 2000 | MLB Talent Map 2026"
    : "Interactive roster map | The Geography of MLB Talent";
const description = collegeRoute
  ? "Map and rank the leading colleges across 54,980 official MLB and affiliated MiLB season participants from 2000 through August 24, 2026."
  : highSchoolRoute
    ? "Map and rank U.S. high schools across 54,980 official MLB and affiliated MiLB season participants from 2000 through August 24, 2026."
    : "Explore U.S. birthplace geography and international origins for every player on an MLB organization roster as of August 24, 2026.";
const socialImage = collegeRoute
  ? "https://mlb-talent-map-2026.pages.dev/og-colleges.png"
  : highSchoolRoute
    ? "https://mlb-talent-map-2026.pages.dev/og-high-schools.png"
    : "https://mlb-talent-map-2026.pages.dev/og.png";
document.title = title;
document.querySelector('meta[name="description"]')?.setAttribute("content", description);
document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
document.querySelector('meta[property="og:url"]')?.setAttribute("content", window.location.href);
document.querySelector('meta[property="og:image"]')?.setAttribute("content", socialImage);
document.querySelector('meta[name="twitter:image"]')?.setAttribute("content", socialImage);
document.querySelector('link[rel="canonical"]')?.setAttribute("href", window.location.href.split("?")[0]);

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <React.StrictMode>
    {collegeRoute ? <MlbCollegeMap /> : highSchoolRoute ? <MlbHighSchoolMap /> : <MlbTalentMap />}
  </React.StrictMode>,
);
