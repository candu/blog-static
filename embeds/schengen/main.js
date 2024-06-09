import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { DateTime } from "https://cdn.jsdelivr.net/npm/luxon@3.4.4/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";

const SCHENGEN_COUNTRY_NAMES = Object.keys({
  Austria: "AT",
  Belgium: "BE",
  "Czech Republic": "CZ",
  Czechia: "CZ",
  Denmark: "DK",
  Estonia: "EE",
  Finland: "FI",
  France: "FR",
  Germany: "DE",
  Greece: "EL",
  Hungary: "HU",
  Iceland: "IS",
  Italy: "IT",
  Latvia: "LV",
  Liechtenstein: "LI",
  Lithuania: "LT",
  Luxembourg: "LU",
  Malta: "MT",
  Netherlands: "NL",
  Norway: "NO",
  Poland: "PL",
  Portugal: "PT",
  Slovakia: "SK",
  Slovenia: "SI",
  Spain: "ES",
  Sweden: "SE",
  Switzerland: "CH",
});

async function getWorld50m() {
  return d3.json(
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
  );
}

async function getSchengenTempReintros() {
  const schengenTempReintrosRaw = await d3.json("../../data/schengen.json");

  const schengenTempReintros = schengenTempReintrosRaw.map(
    ({ durations, ...rest }) => {
      const { raw, start: startStr, end: endStr } = durations;
      const start = DateTime.fromISO(startStr);
      const end = DateTime.fromISO(endStr);
      return {
        duration: { raw, start, end },
        ...rest,
      };
    }
  );

  return schengenTempReintros;
}

function filterFeatureCollection(featureCollection, filter) {
  return {
    ...featureCollection,
    features: featureCollection.features.filter(filter),
  };
}

async function main() {
  // TODO: dynamic date scrubber
  const date = DateTime.utc();

  const [schengenTempReintros, world] = await Promise.all([
    getSchengenTempReintros(),
    getWorld50m(),
  ]);

  // TODO: compute size from current viewport
  const size = 960;

  const projection = d3
    .geoAzimuthalEqualArea()
    .rotate([-10.0, -52.0])
    .translate([size / 2, size / 2])
    .scale(1200)
    .precision(0.1);

  const path = d3.geoPath(projection);

  const graticule = d3.geoGraticule10();

  const countries = feature(world, world.objects.countries);

  const schengenCountries = filterFeatureCollection(
    countries,
    ({ properties }) => {
      return SCHENGEN_COUNTRY_NAMES.includes(properties.name);
    }
  );

  const activeTempReintros = schengenTempReintros.filter(({ duration }) => {
    const { start, end } = duration;
    return date >= start && date <= end;
  });

  const activeCountryNames = Array.from(
    new Set(activeTempReintros.map(({ country }) => country.name))
  );

  const activeCountries = filterFeatureCollection(
    countries,
    ({ properties }) => {
      return activeCountryNames.includes(properties.name);
    }
  );

  // TODO: timeline

  const svg = d3.create("svg").attr("width", size).attr("height", size);

  svg
    .append("path")
    .attr("d", path(graticule))
    .attr("stroke", "#ddd")
    .attr("fill", "none");

  svg
    .append("path")
    .attr("d", path(countries))
    .attr("stroke", "#fff")
    .attr("fill", "#ccc");

  svg
    .append("path")
    .attr("d", path(schengenCountries))
    .attr("stroke", "#3863FF")
    .attr("fill", "#001489");

  svg
    .append("path")
    .attr("d", path(activeCountries))
    .attr("stroke", "#f31")
    .attr("stroke-width", 1.5)
    .attr("fill", "#600");

  document.body.appendChild(svg.node());
}

main();
