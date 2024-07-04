import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import _ from "https://cdn.jsdelivr.net/npm/lodash@4.17.21/+esm";
import { DateTime } from "https://cdn.jsdelivr.net/npm/luxon@3.4.4/+esm";
import tippy, {
  followCursor,
} from "https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";

const SCHENGEN_COUNTRY_CODES = {
  Austria: "AT",
  Belgium: "BE",
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
    ({ country, duration, ...rest }) => {
      const { name: nameRaw, code } = country;
      const name = nameRaw === "Czech Republic" ? "Czechia" : nameRaw;

      const { raw, start: startStr, end: endStr } = duration;
      const start = DateTime.fromISO(startStr);
      const end = DateTime.fromISO(endStr);
      return {
        country: { name, code },
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

  constructor({ $element, schengenTempReintros, world }) {
    this.$element = $element;
    this.schengenTempReintros = schengenTempReintros;
    this.world = world;

    this.recalculateDimensions();

    this.handleResize = _.debounce(this.resize.bind(this), 500);
  }

  recalculateDimensions() {
    this.width = Math.max(this.$element.clientWidth - 20, 480);

    this.heightMap = (this.width * 3) / 4;
    this.heightTimeline = (this.width * 2) / 3;
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

  resize() {
    this.recalculateDimensions();
    this.destroy();
    this.init();
  }

  destroy() {
    this.$element.removeChild(this.$svg.node());
  }

  init() {
    window.onresize = () => {
      this.handleResize();
    };

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

    this.$element.appendChild(this.$svg.node());

    this.renderMap();
    this.renderTimeline();
  }

  renderMap() {
    const projection = d3
      .geoAzimuthalEqualArea()
      .rotate([-10.0, -54.0])
      .translate([this.width / 2, this.heightMap / 2])
      .scale(this.width)
      .precision(0.1);

    const graticule = d3.geoGraticule10();

    this.pathMap = d3.geoPath(projection);
    this.featureCountries = feature(this.world, this.world.objects.countries);

    this.$groupMap
      .append("path")
      .attr("d", this.pathMap(graticule))
      .attr("stroke", "#ddd")
      .attr("fill", "none");

    this.$groupMap
      .append("path")
      .attr("d", this.pathMap(this.featureCountries))
      .attr("stroke", "#fff")
      .attr("fill", "#ccc");

    this.$selectionText = this.$groupMap
      .append("text")
      .attr("x", 10)
      .attr("y", 20)
      .attr("fill", "#000")
      .attr("font-size", 18)
      .attr("font-family", "sans-serif");

    this.updateMap();
  }

  renderTimeline() {
    const marginBars = { top: 20, right: 20, bottom: 20, left: 120 };

    const widthBars = this.width - (marginBars.left + marginBars.right);
    const heightBars =
      this.heightTimeline - (marginBars.top + marginBars.bottom);

    this.scaleCountryBands = d3
      .scaleBand(SCHENGEN_COUNTRY_NAMES, [0, heightBars])
      .padding(0.1);

    this.scaleTime = d3
      .scaleTime()
      .domain([new Date(2006, 0, 1), new Date(2025, 0, 1)])
      .range([0, widthBars]);

    this.$groupBars = this.$groupTimeline
      .append("g")
      .attr("transform", `translate(${marginBars.left}, ${marginBars.top})`);

    this.$groupBars
      .append("g")
      .attr("transform", `translate(0, ${heightBars})`)
      .call(d3.axisBottom(this.scaleTime));

    this.$groupBars.append("g").call(
      d3
        .axisLeft(this.scaleCountryBands)
        .tickFormat((d) => {
          const flag = SCHENGEN_COUNTRY_FLAGS[SCHENGEN_COUNTRY_CODES[d]];
          return `${d} ${flag}`;
        })
        .tickSize(0)
    );

    const $groupTimelineControls = this.$groupTimeline
      .append("g")
      .attr("transform", `translate(${marginBars.left}, ${marginBars.top})`);

    this.$selectionDateLine = $groupTimelineControls
      .append("line")
      .attr("y1", 0)
      .attr("y2", heightBars)
      .attr("stroke", "#600")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4");

    $groupTimelineControls
      .append("rect")
      .attr("class", "timeline-overlay")
      .attr("width", widthBars)
      .attr("height", heightBars)
      .attr("fill", "transparent")
      .on("click", (event) => {
        const [x] = d3.pointer(event);
        const date = this.scaleTime.invert(x);
        this.selection.date = date;

        this.updateMap();
        this.updateTimeline();
      });

    this.updateTimeline();
  }

  updateMap() {
    const schengenCountries = filterFeatureCollection(
      this.featureCountries,
      ({ properties }) => {
        return SCHENGEN_COUNTRY_NAMES.includes(properties.name);
      }
    );

    const activeTempReintros = this.getActiveTempReintros();
    const activeCountryNames = this.getActiveCountryNames();

    const schengenCountriesData = schengenCountries.features.map((d) => {
      const isActive = activeCountryNames.includes(d.properties.name);

      const properties = {
        ...d.properties,
        isActive,
      };

      return {
        ...d,
        properties,
      };
    });

    const $schengenCountries = this.$groupMap
      .selectAll("path.country-schengen")
      .data(schengenCountriesData, (d) => d.properties.name);

    $schengenCountries.exit().remove();

    $schengenCountries
      .enter()
      .append("path")
      .attr("class", "country-schengen")
      .merge($schengenCountries)
      .attr("d", (d) => this.pathMap(d))
      .attr("stroke", (d) => (d.properties.isActive ? "#f31" : "#3863FF"))
      .attr("fill", (d) => (d.properties.isActive ? "#600" : "#001489"))
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
      .call((s) => {
        s.nodes().forEach((node) => {
          node._tippy && node._tippy.destroy();
        });

        tippy(s.nodes(), {
          allowHTML: true,
          followCursor: true,
          plugins: [followCursor],
        });
      });

    this.$selectionText.text(
      `Temporary reintroductions active on ${this.selection.date.toLocaleDateString()}`
    );
  }

  updateTimeline() {
    const activeTempReintros = this.getActiveTempReintros();
    const activeCountryNames = this.getActiveCountryNames();

    const schengenBarsData = this.schengenTempReintros.map((d) => {
      const isActive = activeTempReintros.includes(d);
      const countryIsActive = activeCountryNames.includes(d.country.name);

      return {
        ...d,
        isActive,
        countryIsActive,
      };
    });

    const $schengenBars = this.$groupBars
      .selectAll("rect.timeline-bar")
      .data(schengenBarsData, (d) => d.id);

    $schengenBars.exit().remove();

    $schengenBars
      .enter()
      .append("rect")
      .attr("class", "timeline-bar")
      .merge($schengenBars)
      .attr("x", (d) => this.scaleTime(d.duration.start.toJSDate()))
      .attr("y", (d) => this.scaleCountryBands(d.country.name))
      .attr(
        "width",
        (d) =>
          this.scaleTime(d.duration.end.toJSDate()) -
          this.scaleTime(d.duration.start.toJSDate())
      )
      .attr("height", this.scaleCountryBands.bandwidth())
      .attr("fill", (d) => {
        if (d.isActive) {
          return "#f31";
        }

        return "#ccc";
      })
      .attr("stroke", "#fff");

    this.$selectionDateLine
      .attr("x1", this.scaleTime(this.selection.date))
      .attr("x2", this.scaleTime(this.selection.date));
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
    $element: document.body,
    schengenTempReintros,
    world,
  });

  controller.init();
}

main();
