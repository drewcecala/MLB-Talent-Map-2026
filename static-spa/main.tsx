import React from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { MlbCollegeMap } from "../app/mlb-college-map/MlbCollegeMap";
import { MlbHighSchoolMap } from "../app/mlb-high-school-map/MlbHighSchoolMap";
import { MlbTalentMap } from "../app/mlb-talent-map/MlbTalentMap";

const publicUrl = "https://mlb-talent-map-2026.pages.dev";
const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
const highSchoolRoute = pathname === "/mlb-high-school-map";
const collegeRoute = pathname === "/mlb-college-map";
const title = collegeRoute
  ? "Colleges Producing MLB & MiLB Talent Since 2000 | MLB Talent Map 2026"
  : highSchoolRoute
    ? "High Schools Producing MLB & MiLB Talent Since 2000 | MLB Talent Map 2026"
    : "Interactive roster map | The Geography of MLB Talent";
const description = collegeRoute
  ? "Publication-status audit for the MLB college talent map using players whose professional careers began in 2000 or later."
  : highSchoolRoute
    ? "Map and rank U.S. high schools for 49,771 players whose official MLB or affiliated MiLB careers began in 2000 or later."
    : "Explore U.S. birthplace geography and international origins for every player on an MLB organization roster as of August 24, 2026.";
const socialImage = collegeRoute
  ? `${publicUrl}/og-colleges.png`
  : highSchoolRoute
    ? `${publicUrl}/og-high-schools.png`
    : `${publicUrl}/og.png`;
const canonicalUrl = collegeRoute
  ? `${publicUrl}/mlb-college-map/`
  : highSchoolRoute
    ? `${publicUrl}/mlb-high-school-map/`
    : `${publicUrl}/`;
document.title = title;
document.querySelector('meta[name="description"]')?.setAttribute("content", description);
document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonicalUrl);
document.querySelector('meta[property="og:image"]')?.setAttribute("content", socialImage);
document.querySelector('meta[name="twitter:image"]')?.setAttribute("content", socialImage);
document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonicalUrl);

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <React.StrictMode>
    {collegeRoute ? <MlbCollegeMap /> : highSchoolRoute ? <MlbHighSchoolMap /> : <MlbTalentMap />}
  </React.StrictMode>,
);
