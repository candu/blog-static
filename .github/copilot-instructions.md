# Copilot Instructions for blog-static

This repository contains interactive embeds and supporting scripts for the [candu can do](https://www.savageevan.com/) personal blog.

## Architecture

### Directory Structure

- `public/embeds/<project>/` — Self-contained interactive visualizations (index.html, main.js, style.css)
- `public/data/` — Static data files consumed by embeds, always in easy-to-parse formats (e.g. JSON, CSV)
- `scripts/<project>/` — Python data processing scripts that generate files in `public/data/`, or that perform other prep tasks

### Data Flow

Scripts transform raw data → files in `public/data/` → consumed by embeds via relative fetch paths (`../../data/filename.json`, `../../data/filename.csv`)

## Frontend Embeds

### Conventions

- **ES Modules only**: Use `<script type="module">` and ESM imports
- **CDN dependencies**: Import external libraries from CDN (e.g. jsdelivr), never bundle locally
  ```javascript
  import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
  import _ from "https://cdn.jsdelivr.net/npm/lodash@4.17.21/+esm";
  ```
- **Well-formed HTML**: All `index.html` files must declare charset, viewport, title
- **Relative data paths**: Fetch data using `../../data/` from embed directories

### Development Server

```bash
npm run serve  # Starts http-server on port 8080
```

Test manually in browser at `http://localhost:8080/embeds/<project>/`

### Deployment

GitHub Pages via `.github/workflows/pages-build-deployment.yml`. Embeds are hosted at:

```
https://candu.github.io/blog-static/embeds/<project>/
```

### Ghost Integration

Embeds are embedded in blog posts via iframe with responsive width:

```html
<iframe
  src="https://candu.github.io/blog-static/embeds/schengen"
  width="100%"
  height="1020px"
></iframe>
```

**Important**: Embeds must be responsive—use percentage-based widths or viewport units to fill the container.

## Python Scripts

### Environment

- Python 3.11+ with Poetry for dependency management

### Script Pattern

Scripts read from stdin and output processed data to stdout:

```bash
python scripts/schengen/parse_temp_reintros.py < input.txt > public/data/output.json
```

### Data Processing Notes

- Data workflows vary per project; posts are considered complete once published (no ongoing data updates)
- Document data quirks and manual fixes in script-specific READMEs

## Code Style

### JavaScript

- Prettier + ESLint configured (see `devDependencies`)
- Async/await for data loading
- Class-based architecture for complex UI controllers where needed
- Keep all logic in single `main.js` unless complexity warrants multiple modules

### Python

- Docstrings at top of script explaining usage
- Functional decomposition for complex tasks
- Use standard libraries where possible
- Import external libraries via Poetry

## Content Policy

This is a personal blog repository. All content is original except where noted. All original content is **not licensed for reuse** without permission, unless otherwise specified.
