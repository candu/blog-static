import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { DateTime } from "https://cdn.jsdelivr.net/npm/luxon@3.4.4/+esm";
import tippy, {
  followCursor,
} from "https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";

const SCHENGEN_COUNTRY_CODES = {
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
};

const SCHENGEN_COUNTRY_NAMES = Array.from(
  Object.keys(SCHENGEN_COUNTRY_CODES)
).toSorted((a, b) => a.localeCompare(b));

const SCHENGEN_COUNTRY_FLAGS = {
  AT: "🇦🇹",
  BE: "🇧🇪",
  CZ: "🇨🇿",
  DK: "🇩🇰",
  EE: "🇪🇪",
  FI: "🇫🇮",
  FR: "🇫🇷",
  DE: "🇩🇪",
  EL: "🇬🇷",
  HU: "🇭🇺",
  IS: "🇮🇸",
  IT: "🇮🇹",
  LV: "🇱🇻",
  LI: "🇱🇮",
  LT: "🇱🇹",
  LU: "🇱🇺",
  MT: "🇲🇹",
  NL: "🇳🇱",
  NO: "🇳🇴",
  PL: "🇵🇱",
  PT: "🇵🇹",
  SK: "🇸🇰",
  SI: "🇸🇮",
  ES: "🇪🇸",
  SE: "🇸🇪",
  CH: "🇨🇭",
};

async function getWorld50m() {
  return d3.json(
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
  );
}

async function getSchengenTempReintros() {
  const schengenTempReintrosRaw = await d3.json("../../data/schengen.json");

  const schengenTempReintros = schengenTempReintrosRaw.map(
    ({ duration, ...rest }) => {
      const { raw, start: startStr, end: endStr } = duration;
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

class VisualisationController {
  selection = {
    date: new Date(2021, 6, 1),
  };

  // TODO: compute size from current viewport
  constructor({
    width,
    heightMap,
    heightTimeline,
    schengenTempReintros,
    world,
  }) {
    this.width = width;
    this.heightMap = heightMap;
    this.heightTimeline = heightTimeline;
    this.schengenTempReintros = schengenTempReintros;
    this.world = world;
  }

  getActiveTempReintros() {
    return this.schengenTempReintros.filter(({ duration }) => {
      const { start, end } = duration;
      return this.selection.date >= start && this.selection.date <= end;
    });
  }

  getActiveCountryNames() {
    const activeTempReintros = this.getActiveTempReintros();

    return Array.from(
      new Set(activeTempReintros.map(({ country }) => country.name))
    );
  }

  init($element) {
    const height = this.heightMap + this.heightTimeline;

    this.$svg = d3
      .create("svg")
      .attr("width", this.width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${this.width} ${height}`);

    const defs = this.$svg.append("defs");

    defs
      .append("clipPath")
      .attr("id", "clip_map")
      .append("rect")
      .attr("width", this.width)
      .attr("height", this.heightMap)
      .attr("x", 0)
      .attr("y", 0);

    this.$svg
      .append("rect")
      .attr("width", this.width)
      .attr("height", height)
      .attr("fill", "#fff");

    this.$groupMap = this.$svg.append("g").attr("clip-path", "url(#clip_map)");
    this.$groupTimeline = this.$svg
      .append("g")
      .attr("transform", `translate(0, ${this.heightMap})`);

    $element.appendChild(this.$svg.node());
  }

  renderMap() {
    const projection = d3
      .geoAzimuthalEqualArea()
      .rotate([-10.0, -54.0])
      .translate([this.width / 2, this.heightMap / 2])
      .scale(1000)
      .precision(0.1);

    const path = d3.geoPath(projection);

    const graticule = d3.geoGraticule10();

    const countries = feature(this.world, this.world.objects.countries);

    const schengenCountries = filterFeatureCollection(
      countries,
      ({ properties }) => {
        return SCHENGEN_COUNTRY_NAMES.includes(properties.name);
      }
    );

    this.$groupMap
      .append("path")
      .attr("d", path(graticule))
      .attr("stroke", "#ddd")
      .attr("fill", "none");

    this.$groupMap
      .append("path")
      .attr("d", path(countries))
      .attr("stroke", "#fff")
      .attr("fill", "#ccc");

    const $schengenCountries = this.$groupMap
      .selectAll("path.country-schengen")
      .data(schengenCountries.features);

    $schengenCountries
      .enter()
      .append("path")
      .attr("class", "country-schengen")
      .attr("d", (d) => path(d))
      .attr("stroke", "#3863FF")
      .attr("fill", "#001489")
      .attr("data-tippy-content", (d) => {
        return `<strong>${d.properties.name}</strong>`;
      })
      .call((s) =>
        tippy(s.nodes(), {
          allowHTML: true,
          followCursor: true,
          plugins: [followCursor],
        })
      );

    const activeTempReintros = this.getActiveTempReintros();

    const activeCountryNames = this.getActiveCountryNames();
    const activeCountries = filterFeatureCollection(
      schengenCountries,
      ({ properties }) => {
        return activeCountryNames.includes(properties.name);
      }
    );

    const $activeCountries = this.$groupMap
      .selectAll("path.country-active")
      .data(activeCountries.features);

    $activeCountries
      .enter()
      .append("path")
      .attr("class", "country-active")
      .attr("d", (d) => path(d))
      .attr("stroke", "#f31")
      .attr("stroke-width", 1.5)
      .attr("fill", "#600")
      .attr("data-tippy-content", (d) => {
        const activeTempReintrosForCountry = activeTempReintros.filter(
          ({ country }) => country.name === d.properties.name
        );

        if (activeTempReintrosForCountry.length === 0) {
          return `${d.properties.name}`;
        }

        const [
          {
            duration: { raw: durationStr },
            reason,
          },
        ] = activeTempReintrosForCountry;

        return `
          <strong>${d.properties.name}</strong><br>
          <span>${durationStr}</span>
          <p>${reason}</p>
        `;
      })
      .call((s) =>
        tippy(s.nodes(), {
          allowHTML: true,
          followCursor: true,
          plugins: [followCursor],
        })
      );
  }

  renderTimeline() {
    const marginBars = { top: 20, right: 20, bottom: 20, left: 120 };

    const widthBars = this.width - (marginBars.left + marginBars.right);
    const heightBars =
      this.heightTimeline - (marginBars.top + marginBars.bottom);

    const scaleCountryColors = d3.scaleOrdinal(SCHENGEN_COUNTRY_NAMES, [
      "#EF3340",
      "#FFCD00",
      "#11457E",
      "#11457E",
      "#C8102E",
      "#000000",
      "#002F6C",
      "#ED2939",
      "#FFCC00",
      "#001489",
      "#477050",
      "#DC1E35",
      "#008C45",
      "#A4343A",
      "#003DA5",
      "#FFB81C",
      "#51ADDA",
      "#000000",
      "#C8102E",
      "#00205B",
      "#DC143C",
      "#046A38",
      "#0B4EA2",
      "#FF0000",
      "#F1BF00",
      "#006AA7",
      "#DA291C",
    ]);

    const scaleCountryBands = d3
      .scaleBand(SCHENGEN_COUNTRY_NAMES, [0, heightBars])
      .padding(0.1);

    const scaleTime = d3
      .scaleTime()
      .domain([new Date(2006, 0, 1), new Date(2025, 0, 1)])
      .range([0, widthBars]);

    const $groupBars = this.$groupTimeline
      .append("g")
      .attr("transform", `translate(${marginBars.left}, ${marginBars.top})`);

    $groupBars
      .append("g")
      .attr("transform", `translate(0, ${heightBars})`)
      .call(d3.axisBottom(scaleTime));

    $groupBars.append("g").call(
      d3
        .axisLeft(scaleCountryBands)
        .tickFormat((d) => {
          const flag = SCHENGEN_COUNTRY_FLAGS[SCHENGEN_COUNTRY_CODES[d]];
          return `${d} ${flag}`;
        })
        .tickSize(0)
    );

    const $schengenBars = $groupBars
      .selectAll("rect.bar")
      .data(this.schengenTempReintros);

    $schengenBars
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", (d) => scaleTime(d.duration.start.toJSDate()))
      .attr("y", (d) => scaleCountryBands(d.country.name))
      .attr(
        "width",
        (d) =>
          scaleTime(d.duration.end.toJSDate()) -
          scaleTime(d.duration.start.toJSDate())
      )
      .attr("height", scaleCountryBands.bandwidth())
      .attr("fill", (d) => scaleCountryColors(d.country.name))
      .attr("stroke", "#fff");
  }
}

async function main() {
  const selection = {
    date: new Date(2021, 6, 1),
  };

  const [schengenTempReintros, world] = await Promise.all([
    getSchengenTempReintros(),
    getWorld50m(),
  ]);

  const controller = new VisualisationController({
    width: 960,
    heightMap: 720,
    heightTimeline: 640,
    schengenTempReintros,
    world,
  });

  controller.init(document.body);

  controller.renderMap();
  controller.renderTimeline();
}

main();
