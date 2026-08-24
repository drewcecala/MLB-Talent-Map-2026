import React from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { MlbTalentMap } from "../app/mlb-talent-map/MlbTalentMap";

document.title = "Interactive roster map | The Geography of MLB Talent";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <React.StrictMode>
    <MlbTalentMap />
  </React.StrictMode>,
);
