import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
// import luxon from "https://cdn.jsdelivr.net/npm/luxon@3.4.4/+esm";

async function main() {
  const [dataSchengen, dataCountries] = await Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"),
    d3.json("../../data/schengen.json"),
  ]);

  const size = 960;

  const svg = d3.create("svg").attr("width", size).attr("height", size);

  document.body.appendChild(svg.node());
}

main();
