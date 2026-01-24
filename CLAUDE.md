# Claude Instructions for blog-static

This repository contains interactive embeds and supporting scripts for the [candu can do](https://www.savageevan.com/) personal blog.

## Quick Start

```bash
npm run serve      # Start development server on http://localhost:8080
npm test           # Run unit tests with Vitest
npm run profile    # Profile adversarial answer algorithm
```

Test embeds at `http://localhost:8080/embeds/<project>/`

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development Environment](#development-environment)
3. [Frontend Embeds](#frontend-embeds)
4. [Testing & Performance](#testing--performance)
5. [Python Scripts](#python-scripts)
6. [Code Style & Conventions](#code-style--conventions)
7. [Ghost Integration & Deployment](#ghost-integration--deployment)
8. [Examples from the Codebase](#examples-from-the-codebase)
9. [Content Policy](#content-policy)

## Architecture Overview

### Directory Structure

```
blog-static/
├── public/
│   ├── embeds/              # Self-contained interactive visualizations
│   │   ├── adversarial-wordle/  # Complex game with AI opponent
│   │   │   ├── index.html
│   │   │   ├── lib.js       # 1033 lines of game logic
│   │   │   ├── main.js      # 18 lines initialization
│   │   │   └── style.css
│   │   └── schengen/        # D3-based map visualization
│   │       ├── index.html
│   │       ├── main.js      # 443 lines single-file implementation
│   │       └── style.css
│   └── data/                # Static data files (JSON, CSV)
│       ├── wordle-answers.csv
│       ├── wordle-guesses.csv
│       └── schengen.json
├── scripts/                 # Python data processing scripts
│   ├── adversarial-wordle/  # Word list and probability generation
│   └── schengen/            # Parse temporary border reintroductions
│       └── parse_temp_reintros.py
├── tests/                   # Unit and performance tests
│   └── adversarial-wordle/
│       ├── lib.test.js      # 750 lines of unit tests
│       ├── helpers.js       # Test utilities
│       └── *.perf.js        # Performance benchmarks
├── .github/workflows/       # CI/CD configuration
└── Configuration files
```

### Data Flow

The repository follows a clear separation between data processing and visualization:

```
Raw Data → Python Scripts → public/data/ → Frontend Embeds
                             (JSON/CSV)     (fetch via relative paths)
```

**Key principles:**

- Scripts transform raw data into easy-to-parse formats (JSON, CSV)
- Embeds fetch data using relative paths: `../../data/filename.json`
- Data workflows vary per project; posts are considered complete once published
- No ongoing data updates after publication

### Two-Tier Architecture

This codebase demonstrates two distinct approaches to building interactive embeds:

**Simple Embeds** (Schengen example):

- Single `main.js` file (443 lines)
- D3-based visualization with straightforward class-based controller
- Suitable for data visualization projects

**Complex Embeds** (Adversarial Wordle example):

- Separation: `lib.js` (1033 lines) + `main.js` (18 lines)
- Multiple classes with clear separation of concerns
- Sophisticated algorithms and performance optimizations
- Comprehensive test suite (750 lines)
- Suitable for interactive applications with complex logic

### Deployment Model

- **GitHub Pages**: Automated deployment via `.github/workflows/pages-build-deployment.yml`
- **Ghost CMS**: Embeds are embedded in blog posts via iframe
- **Hosted at**: `https://candu.github.io/blog-static/embeds/<project>/`

## Development Environment

### Node.js Setup

- **Version**: See `.nvmrc` for LTS version
- **Package Manager**: npm
- **Module System**: ES Modules (`"type": "module"` in package.json)

### NPM Scripts

```bash
npm run serve              # http-server on port 8080
npm test                   # Run Vitest unit tests
npm run profile            # Profile adversarial answer algorithm
npm run profile:cpu        # CPU profiling with --cpu-prof
npm run profile:inspect    # Debug with --inspect-brk
npm run profile:heap       # Memory profiling with --heap-prof
```

### Python Setup

- **Version**: Python 3.11+
- **Dependency Management**: Poetry
- **Configuration**: See `pyproject.toml`

### Testing Framework

- **Unit Tests**: Vitest v4.0.16
- **Benchmarks**: Tinybench v2.9.0
- **Test Location**: `tests/` directory mirrors `public/embeds/` structure

### Code Quality Tools

- **Linter**: ESLint v9.1.0 with recommended rules + Prettier integration
- **Formatter**: Prettier v3.2.5
- **Configuration**: `.eslintrc.js`, `.editorconfig`, `.vscode/settings.json`

## Frontend Embeds

### General Conventions

#### ES Modules Only

All frontend code uses ES Modules with `<script type="module">`:

```html
<script type="module" src="main.js"></script>
```

**Never use:**

- CommonJS (`require`, `module.exports`)
- UMD bundles
- Build tools or bundlers (Webpack, Rollup, etc.)

#### CDN Dependencies

Import all external libraries from CDN (jsdelivr). Never bundle locally.

**Example from [public/embeds/schengen/main.js](public/embeds/schengen/main.js:1-7):**

```javascript
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import _ from "https://cdn.jsdelivr.net/npm/lodash@4.17.21/+esm";
import { DateTime } from "https://cdn.jsdelivr.net/npm/luxon@3.4.4/+esm";
import tippy, { followCursor } from "https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
```

Where possible, aim to use the latest version as of time of creating the file - but make sure to pin the CDN URL to a specific version.

**Common CDN libraries in this codebase:**

- D3.js (data visualization)
- Lodash (utility functions)
- Luxon (datetime handling)
- Tippy.js (tooltips)
- TopoJSON Client (geographic data)

#### Well-Formed HTML

All `index.html` files must declare:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Project Name</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <script type="module" src="main.js"></script>
  </body>
</html>
```

#### Responsive Design

**Critical**: Embeds must be responsive for iframe embedding in Ghost blog posts.

- Use percentage-based widths or viewport units
- Design to fill the iframe container
- Test at multiple viewport sizes

**Example from [public/embeds/schengen/main.js:121-126](public/embeds/schengen/main.js:121-126):**

```javascript
recalculateDimensions() {
  this.width = Math.max(this.$element.clientWidth - 20, 480);
  this.heightMap = (this.width * 3) / 4;
  this.heightTimeline = (this.width * 2) / 3;
}
```

#### Data Loading

Fetch data using relative paths from embed directories:

```javascript
// From adversarial-wordle
const [validAnswers, validGuesses] = await Promise.all([
  getWordListFromURL("../../data/wordle-answers.csv"),
  getWordListFromURL("../../data/wordle-guesses.csv"),
]);

// From schengen
const schengenTempReintros = await d3.json("../../data/schengen.json");
```

**Patterns:**

- Use `async/await` for data loading
- Parallelize independent requests with `Promise.all()`
- Handle errors gracefully

### Architecture Patterns

#### Simple Embeds: Single-File Pattern

**When to use:**

- Data visualizations with D3
- Straightforward interactive maps or charts
- Projects with minimal state management

**Pattern:**

- Single `main.js` file
- Class-based controller for organization
- All logic in one file unless complexity increases

**Example: [public/embeds/schengen/main.js](public/embeds/schengen/main.js) (443 lines)**

```javascript
class VisualisationController {
  constructor({ $element, schengenTempReintros, world }) {
    this.$element = $element;
    this.schengenTempReintros = schengenTempReintros;
    this.world = world;
  }

  init() {
    // Initialize SVG, groups, event handlers
    this.renderMap();
    this.renderTimeline();
  }

  renderMap() {
    /* D3 rendering logic */
  }
  renderTimeline() {
    /* D3 timeline with interaction */
  }
  updateMap() {
    /* Update visualization on selection change */
  }
  updateTimeline() {
    /* Update timeline indicators */
  }
}

async function main() {
  const [data, world] = await Promise.all([getSchengenTempReintros(), getWorld50m()]);

  const controller = new VisualisationController({
    $element: document.body,
    schengenTempReintros: data,
    world,
  });

  controller.init();
}

main();
```

#### Complex Embeds: lib.js + main.js Pattern

**When to use:**

- Interactive games or applications
- Complex algorithms requiring optimization
- Projects with extensive unit testing needs
- Clear separation between game logic and UI

**Pattern:**

- `lib.js`: Core logic, algorithms, data structures (1033 lines in adversarial-wordle)
- `main.js`: Initialization and setup (18 lines in adversarial-wordle)
- Multiple classes with single responsibilities

**Example: [public/embeds/adversarial-wordle/](public/embeds/adversarial-wordle/)**

**lib.js structure:**

```javascript
// Data structures for performance
export class MaxHeap {
  /* ... */
}
export class SatisfiesCache {
  /* ... */
}

// Utility classes
export class LetterStateUtils {
  /* ... */
}

// Core game logic
export class GameState {
  /* ... */
}

// UI and interaction
export class GameView {
  /* ... */
}
export class GameController {
  /* ... */
}

// Persistence
export class StatsManager {
  /* ... */
}
```

**main.js structure:**

```javascript
import { Game } from "./lib.js";

async function main() {
  const game = new Game({
    /* ... */
  });
  await game.init();
}

main();
```

### Class-Based Architecture

#### Naming Conventions

- **Classes**: PascalCase (`GameController`, `MaxHeap`, `SatisfiesCache`)
- **Public methods**: camelCase (`calculateLetterStates`, `getValidGuesses`)
- **Private methods**: underscore prefix (`_bubbleUp`, `_evictOldest`)
- **Constants**: UPPER_SNAKE_CASE (`WORD_LENGTH`, `MAX_GUESSES`)
- **DOM elements**: dollar sign prefix (`$container`, `$svg`, `$groupMap`)

#### Separation of Concerns

Follow the Model-View-Controller pattern for complex embeds:

**Model (Game Logic):**

```javascript
export class GameState {
  constructor({ validAnswers, validGuesses, letterStates, guesses }) {
    this.validAnswers = validAnswers;
    this.validGuesses = validGuesses;
    this.letterStates = letterStates;
    this.guesses = guesses;
  }

  // Pure game logic methods
  getValidGuesses() {
    /* ... */
  }
  calculateLetterStates(guess, result) {
    /* ... */
  }
  makeGuess(guess, result) {
    /* ... */
  }
}
```

**View (UI Rendering):**

```javascript
export class GameView {
  constructor({ $container }) {
    this.$container = $container;
  }

  // Rendering methods
  renderBoard() {
    /* ... */
  }
  renderKeyboard() {
    /* ... */
  }
  updateCell(row, col, letter, state) {
    /* ... */
  }
}
```

**Controller (Coordination):**

```javascript
export class GameController {
  constructor({ gameState, gameView }) {
    this.gameState = gameState;
    this.gameView = gameView;
  }

  // Orchestration methods
  async handleGuess(guess) {
    const result = this.gameState.calculateResult(guess);
    this.gameView.updateBoard(guess, result);
    this.gameState.makeGuess(guess, result);
  }
}
```

## Testing & Performance

### Unit Testing with Vitest

**Test file**: [tests/adversarial-wordle/lib.test.js](tests/adversarial-wordle/lib.test.js) (750 lines)

**Pattern**: Use `describe()` blocks for grouping, `it()` blocks for individual tests, `expect()` for assertions. Prefer `expect.objectContaining()` or `expect.arrayContaining()` to multiple `expect()` calls when checking multiple object fields / array indices.

```javascript
import { describe, it, expect } from "vitest";
import { LetterStateUtils } from "../../public/embeds/adversarial-wordle/lib.js";

describe("LetterStateUtils", () => {
  describe("hashLetterStates", () => {
    it("is deterministic for same input", () => {
      const letterStates = new Uint8Array(26);
      const hash1 = LetterStateUtils.hashLetterStates(letterStates);
      const hash2 = LetterStateUtils.hashLetterStates(letterStates);
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different inputs", () => {
      const letterStates1 = new Uint8Array(26);
      const letterStates2 = new Uint8Array(26);
      letterStates2[0] = 1;

      const hash1 = LetterStateUtils.hashLetterStates(letterStates1);
      const hash2 = LetterStateUtils.hashLetterStates(letterStates2);

      expect(hash1).not.toBe(hash2);
    });
  });
});
```

### Performance Benchmarking with Tinybench

**Files**: [tests/adversarial-wordle/\*.perf.js](tests/adversarial-wordle/)

**Pattern**: Use Tinybench for microbenchmarks and performance validation.

```javascript
import { Bench } from "tinybench";
import { LetterStateUtils } from "../../public/embeds/adversarial-wordle/lib.js";

const bench = new Bench({ time: 1000 });

bench
  .add("hashLetterStates", () => {
    const letterStates = new Uint8Array(26);
    LetterStateUtils.hashLetterStates(letterStates);
  })
  .add("calculateLetterStates", () => {
    // Benchmark code
  });

await bench.run();
console.table(bench.table());
```

### Profiling

**Integration with Node.js:**

- `--cpu-prof`: CPU profiling
- `--heap-prof`: Memory profiling
- `--inspect-brk`: Debug mode (breakpoint at start)

### Test Organization

- Tests mirror the `public/embeds/` structure
- Helper utilities in `tests/<project>/helpers.js`
- Performance benchmarks in `tests/<project>/*.perf.js`

**Example helper**: [tests/adversarial-wordle/helpers.js](tests/adversarial-wordle/helpers.js)

```javascript
export async function getWordListFromFile(filename) {
  const csv = await fs.readFile(filename, "utf-8");
  return csv.trim().split("\n");
}
```

## Python Scripts

### Pattern: stdin → stdout

All Python scripts read from stdin and output to stdout:

```bash
python scripts/schengen/parse_temp_reintros.py < input.txt > public/data/output.json
```

**Why this pattern:**

- Composable with Unix tools
- Easy to test and debug
- Clear data flow

### Script Structure

**File**: [scripts/schengen/parse_temp_reintros.py](scripts/schengen/parse_temp_reintros.py) (269 lines)

```python
"""
Parse temporary border reintroductions from PDF text.

Usage:
    python parse_temp_reintros.py < input.txt > output.json

The script expects text extracted from the Schengen temporary
reintroduction PDF, with one entry per line.
"""

import sys
import json
import re
from datetime import datetime
import pytz

def parse_date(date_str, country_code):
    """Parse date string with country-specific timezone."""
    # Complex regex parsing logic
    pass

def main():
    """Main processing logic."""
    for line in sys.stdin:
        # Process each line
        pass

    json.dump(results, sys.stdout, indent=2)

if __name__ == "__main__":
    main()
```

### Python Conventions

- **Docstrings**: Required at top of script explaining usage
- **Functional decomposition**: Break complex tasks into functions
- **Standard library preference**: Use built-in modules when possible
- **Poetry for external dependencies**: Add to `pyproject.toml`
- **Error handling**: Graceful handling of malformed input
- **Documentation**: Document data quirks and manual fixes in script READMEs

### Data Processing Notes

- Data workflows vary per project
- Posts are considered complete once published (no ongoing updates)
- Document data quirks and manual fixes in script-specific READMEs
- Handle inconsistent date formats, timezones, and edge cases

**Example from parse_temp_reintros.py:**

- Regex magic for inconsistent date formats
- Country-specific timezone handling with pytz
- Manual corrections for data inconsistencies

## Code Style & Conventions

### JavaScript

#### ESLint Configuration

**File**: [.eslintrc.js](.eslintrc.js)

```javascript
module.exports = {
  extends: ["eslint:recommended", "prettier"],
  rules: {
    "no-return-await": "warn",
    "no-constant-condition": ["error", { checkLoops: false }],
    eqeqeq: ["warn", "always"],
    "object-shorthand": ["error", "always"],
  },
};
```

#### Formatting

- **Indentation**: 2 spaces
- **Max line length**: 100 characters
- **Trailing newlines**: Required
- **Charset**: UTF-8
- **Formatter**: Prettier (auto-format on save)

#### Style Guidelines

**Async/await over Promises:**

```javascript
// Good
const data = await fetch(url).then((r) => r.json());

// Avoid
fetch(url)
  .then((r) => r.json())
  .then((data) => {
    /* ... */
  });
```

**Class-based architecture for complex UI:**

```javascript
// Good for complex logic
export class GameController {
  constructor({ gameState, gameView }) {
    this.gameState = gameState;
    this.gameView = gameView;
  }
}

// Simpler function-based approach for utilities
export function calculateScore(guesses) {
  return guesses.length;
}
```

**Keep logic in single `main.js` unless complexity warrants split:**

- Simple embeds: Everything in `main.js`
- Complex embeds: Core logic in `lib.js`, initialization in `main.js`

### Python

#### Style Guidelines

- **Indentation**: 4 spaces
- **Docstrings**: Required with usage examples
- **Function names**: snake_case
- **Constants**: UPPER_SNAKE_CASE
- **Type hints**: Optional but encouraged for complex functions

#### Functional Decomposition

```python
# Good: Clear function responsibilities
def parse_date(date_str, country_code):
    """Parse date string with country-specific timezone."""
    timezone = get_country_timezone(country_code)
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return timezone.localize(dt)

def get_country_timezone(country_code):
    """Get timezone for country code."""
    timezones = {"AT": "Europe/Vienna", "BE": "Europe/Brussels"}
    return pytz.timezone(timezones.get(country_code, "UTC"))
```

## Ghost Integration & Deployment

### GitHub Pages Deployment

**Workflow**: [.github/workflows/pages-build-deployment.yml](.github/workflows/pages-build-deployment.yml)

- Automatic deployment on push to main branch
- Serves entire `public/` directory as static site
- **Base URL**: `https://candu.github.io/blog-static/`
- **Embed URLs**: `https://candu.github.io/blog-static/embeds/<project>/`

### Ghost CMS Integration

Embeds are embedded in blog posts via iframe:

```html
<iframe
  src="https://candu.github.io/blog-static/embeds/schengen"
  width="100%"
  height="1020px"
></iframe>
```

**Critical requirements:**

1. **Responsive design**: Embeds must use percentage-based widths to fill container
2. **Fixed height**: Specify height in pixels based on embed aspect ratio
3. **Self-contained**: All assets (CSS, JS) must be in embed directory or loaded from CDN
4. **Cross-origin**: No issues with CORS (all data is static on same origin)

### Testing Deployment Locally

```bash
# Start development server
npm run serve

# Test embed in browser
open http://localhost:8080/embeds/schengen/

# Verify responsive behavior
# Resize browser window to test different viewport sizes
```

## Examples from the Codebase

### Adversarial Wordle: Complex Interactive Application

**Directory**: [public/embeds/adversarial-wordle/](public/embeds/adversarial-wordle/)

**Purpose**: An adversarial Wordle game where the AI opponent uses expectimax search to find the most difficult valid answer based on your guesses.

**Architecture:**

- **[lib.js](public/embeds/adversarial-wordle/lib.js)** (1033 lines): Core game logic and algorithms

  - `MaxHeap` (lines 130-279): Custom max-heap for efficient cache eviction
  - `SatisfiesCache` (lines 281-428): LRU cache with batch eviction
  - `LetterStateUtils` (lines 430-534): Numeric hashing and letter state calculations
  - `GameState`: Core game logic
  - `GameView`: DOM rendering and updates
  - `GameController`: Orchestration and player interaction

- **[main.js](public/embeds/adversarial-wordle/main.js)** (18 lines): Initialization and setup

**Testing:**

- **[tests/adversarial-wordle/lib.test.js](tests/adversarial-wordle/lib.test.js)** (750 lines)
- Comprehensive unit tests for all data structures
- Integration tests for cache + heap interaction
- Performance benchmarks with Tinybench

**Key learnings:**

- Separation of lib.js and main.js for testability
- Class-based architecture with clear responsibilities
- Comprehensive testing for complex algorithms

### Schengen Visualization: Simple D3 Visualization

**Directory**: [public/embeds/schengen/](public/embeds/schengen/)

**Purpose**: Interactive map showing temporary border reintroductions in the Schengen Area.

**Architecture:**

- **[main.js](public/embeds/schengen/main.js)** (443 lines): Single-file implementation
  - `VisualisationController` class: Map and timeline rendering
  - D3-based map with Azimuthal Equal Area projection
  - Interactive timeline with click-to-select date

**Data processing:**

- **[scripts/schengen/parse_temp_reintros.py](scripts/schengen/parse_temp_reintros.py)** (269 lines)
- Complex regex parsing for inconsistent date formats
- Country-specific timezone handling with pytz

**CDN imports:**

```javascript
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import _ from "https://cdn.jsdelivr.net/npm/lodash@4.17.21/+esm";
import { DateTime } from "https://cdn.jsdelivr.net/npm/luxon@3.4.4/+esm";
import tippy, { followCursor } from "https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
```

**Key learnings:**

- Single-file implementation for straightforward visualizations
- Class-based controller for organization
- Responsive design with dynamic dimension calculation
- Debounced resize handler for performance
- Tippy.js integration for rich tooltips

## Content Policy

This is a personal blog repository. All content is original except where noted. **All original content is not licensed for reuse** without permission, unless otherwise specified.

**Repository scope:**

- Only includes content that can't be easily added through Ghost editor
- Interactive embeds requiring custom JavaScript
- Data processing scripts for visualization prep
- Supporting data files in easy-to-parse formats

**Excludes:**

- External JavaScript libraries (use CDN instead)
- Images and videos (host in Ghost)
- Math formulas (use MathJax in Ghost)
- Standard blog content (write in Ghost)

---

## Tips for Working with Claude

When working on this codebase, Claude should:

1. **Read before modifying**: Always read existing files before suggesting changes
2. **Follow patterns**: Use the two-tier architecture (simple vs complex embeds)
3. **Test thoroughly**: Write unit tests for new game logic or data structures
4. **Use CDN imports**: Never bundle external libraries locally
5. **Keep responsive**: Ensure embeds work in iframe containers
6. **Document data quirks**: Add comments for manual corrections or edge cases
7. **Profile when needed**: Use npm profiling scripts for performance validation

**File references format**: When discussing code, reference files with line numbers:

- Example: "See [public/embeds/adversarial-wordle/lib.js:281-428](public/embeds/adversarial-wordle/lib.js:281-428) for the SatisfiesCache implementation"
