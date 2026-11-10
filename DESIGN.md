# Crop Yield Forecast — Agricultural Intelligence Platform

The page is structured as a simple agricultural workspace for growers and specialists. The main view presents the season estimate and regional weather first; the historical chart and garden calculator have full-width work areas. Specialist analysis and data administration remain available on demand.

## Design system

All application styles are maintained in `yield-forecast.css`, linked from the source `yield-forecast.html`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F6F6F0` | Warm, lightly botanical workspace background |
| `--surface` | `#FFFFFF` | Main content surfaces |
| `--surface-green` | `#E8EEE2` | Muted sage panels and positive states |
| `--forest` | `#304B37` | Brand, key figures, and primary actions |
| `--forest-light` | `#627D55` | Secondary accents and chart |
| `--ink` | `#30382F` | Main text |
| `--muted` | `#788073` | Supporting text |
| `--line` | `#E7E8DE` | Soft borders and separators |

Typography uses platform fonts, with an editorial serif for headings and a clean sans-serif for interface text. The palette, spacing, surfaces, radii, and shadows are defined centrally as CSS variables. Buttons, fields, focus indicators, error notices, and reduced-motion behavior share the same visual rules.

## Page composition

- **Navigation** is a softly tinted, persistent desktop sidebar with brand, season, section links, region selector, and location action. On smaller screens it becomes a compact sticky header, with bottom navigation on phones.
- **Season overview** uses a two-part grid: the large yield forecast and its risk, factors, and recommendation occupy the main area; current Open-Meteo conditions sit alongside it. At tablet and phone widths, the weather section moves below the forecast.
- **Garden calculator** follows the season overview. It has a separate full-width form and a dedicated result area. Crop, quantity, growing location, per-bed result, and season settings remain visible and usable.
- **History** follows the garden calculator as a full-width analytical section. Its chart scales to the container and keeps the measured yield, model estimate, and current forecast visually distinct.
- **Plain-language help** and the garden shortcut form a compact supporting section.
- **Specialist analysis** and **data management** use native disclosure panels so model details, validation tables, editable historical rows, settings, and CSV tools are available without crowding the default view.

## Tables and responsive behavior

Tables are sized for their contents rather than forced to share one layout. Method comparisons, per-year validation, and historical records have individual minimum widths and column proportions; long table views scroll inside their own containers. Numeric cells use tabular alignment, descriptions can wrap, and row hover does not alter the table geometry.

Responsive breakpoints retain a desktop sidebar down to 760 px; below that it becomes a compact sticky header, with bottom navigation on phones. The forecast and weather sit side-by-side on wider screens and stack below 860 px. The document itself must not scroll horizontally; wide tables may scroll only within their local container.

## Functional compatibility

The frontend retains its existing IDs, selectors, event handlers, calculation methods, chart rendering, CSV format, localStorage keys, and Open-Meteo request behavior. The page source is `yield-forecast.html`; regenerate `index.html` using `node collector/build-site.mjs`.
