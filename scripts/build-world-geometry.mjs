import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { read } from "shapefile";

const SHAPEFILE = new URL("../data/raw/natural-earth-50m/ne_50m_admin_0_countries.shp", import.meta.url);
const DBF = new URL("../data/raw/natural-earth-50m/ne_50m_admin_0_countries.dbf", import.meta.url);
const VERSION = new URL("../data/raw/natural-earth-50m/ne_50m_admin_0_countries.VERSION.txt", import.meta.url);
const ROSTER_DATA = new URL("../public/data/mlb-talent-map.json", import.meta.url);
const OUTPUT = new URL("../public/data/world-countries-50m.geojson", import.meta.url);
const REPORT = new URL("../reports/world-geometry-audit.json", import.meta.url);

const ISO_BY_BIRTH_COUNTRY = {
  USA: "USA",
  "Dominican Republic": "DOM",
  Venezuela: "VEN",
  Mexico: "MEX",
  Cuba: "CUB",
  Canada: "CAN",
  Panama: "PAN",
  "Puerto Rico": "PRI",
  Colombia: "COL",
  Nicaragua: "NIC",
  Japan: "JPN",
  Taiwan: "TWN",
  Curacao: "CUW",
  Australia: "AUS",
  Aruba: "ABW",
  Bahamas: "BHS",
  "South Korea": "KOR",
  Brazil: "BRA",
  Netherlands: "NLD",
  Germany: "DEU",
  Italy: "ITA",
  Haiti: "HTI",
  Spain: "ESP",
  France: "FRA",
  "New Zealand": "NZL",
  Uganda: "UGA",
  "United Kingdom": "GBR",
  China: "CHN",
  "Costa Rica": "CRI",
  Switzerland: "CHE",
  "Antigua and Barbuda": "ATG",
  Honduras: "HND",
  Jamaica: "JAM",
  Peru: "PER",
  Portugal: "PRT",
  Russia: "RUS",
  "San Marino": "SMR",
  "Sint Maarten": "SXM",
  Slovakia: "SVK",
  "South Africa": "ZAF",
  Sudan: "SDN",
  Thailand: "THA",
  "U.S. Virgin Islands": "VIR",
};

function clean(value) {
  return String(value ?? "").replaceAll("\0", "").trim();
}

const roster = JSON.parse(await readFile(ROSTER_DATA, "utf8"));
const rosterCountries = roster.summaries.countries
  .map((row) => row.country)
  .filter((country) => country !== "Unknown");
const missingIsoAssignments = rosterCountries.filter((country) => !ISO_BY_BIRTH_COUNTRY[country]);
if (missingIsoAssignments.length) {
  throw new Error(`Missing ISO assignments: ${missingIsoAssignments.join(", ")}`);
}

const source = await read(fileURLToPath(SHAPEFILE), fileURLToPath(DBF), { encoding: "utf-8" });
const birthCountryByIso = new Map(
  Object.entries(ISO_BY_BIRTH_COUNTRY).map(([country, iso]) => [iso, country]),
);
const features = source.features.map((feature) => {
  const sourceIsoA3 = clean(feature.properties.ISO_A3);
  const isoA3 = sourceIsoA3 === "-99" ? clean(feature.properties.ADM0_A3) : sourceIsoA3;
  return {
    type: "Feature",
    id: clean(feature.properties.NE_ID),
    properties: {
      isoA3,
      name: clean(feature.properties.NAME_EN || feature.properties.ADMIN || feature.properties.NAME),
      birthCountry: birthCountryByIso.get(isoA3) ?? null,
      labelLongitude: Number(feature.properties.LABEL_X),
      labelLatitude: Number(feature.properties.LABEL_Y),
    },
    geometry: feature.geometry,
  };
});

const availableCountries = new Set(features.map((feature) => feature.properties.birthCountry).filter(Boolean));
const unmatchedRosterCountries = rosterCountries.filter((country) => !availableCountries.has(country));
if (unmatchedRosterCountries.length) {
  throw new Error(`Roster countries without geometry: ${unmatchedRosterCountries.join(", ")}`);
}

const version = (await readFile(VERSION, "utf8")).trim();
const featureCollection = {
  type: "FeatureCollection",
  metadata: {
    source: "Natural Earth Admin 0 – Countries",
    sourceUrl: "https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/",
    version,
    scale: "1:50m",
    boundaryView: "de facto",
  },
  features,
};
const audit = {
  source: featureCollection.metadata,
  geometryFeatures: features.length,
  rosterCountries: rosterCountries.length,
  mappedRosterCountries: availableCountries.size,
  unmatchedRosterCountries,
  unknownBirthCountryRecords: roster.summaries.countries.find((row) => row.country === "Unknown")?.count ?? 0,
  checks: {
    naturalEarthVersionPresent: Boolean(version),
    everyKnownRosterCountryHasGeometry: unmatchedRosterCountries.length === 0,
    everyRosterCountryHasIsoAssignment: missingIsoAssignments.length === 0,
  },
};

await Promise.all([
  writeFile(OUTPUT, JSON.stringify(featureCollection)),
  writeFile(REPORT, JSON.stringify(audit, null, 2)),
]);

console.log(JSON.stringify(audit, null, 2));
