# Crop Yield Forecast — Agricultural Intelligence Platform

The page is structured as a simple agricultural workspace for growers and specialists. The main view presents the season estimate and regional weather first; the historical chart and garden calculator have full-width work areas. Specialist analysis and data administration remain available on demand.

## Design system

All application styles are maintained in `yield-forecast.css`, linked from the source `yield-forecast.html`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F5F6F0` | Warm workspace background |
| `--surface` | `#FFFFFF` | Main content surfaces |
| `--surface-soft` | `#ECEFE7` | Soft neutral areas |
| `--forest` | `#183F32` | Brand and primary actions |
| `--forest-light` | `#527B5F` | Secondary accents and chart |
| `--surface-green` | `#E6EFE5` | Positive and explanatory panels |
| `--ink` | `#202923` | Main text |
| `--muted` | `#778178` | Supporting text |
| `--line` | `#E3E8DF` | Borders and separators |

Typography uses platform system fonts to avoid an extra font download. Color, spacing, surface, radius, and shadow values are defined centrally as CSS variables. Buttons, fields, focus indicators, error notices, and reduced-motion behavior share the same visual rules.

## Page composition

- **Navigation** is a persistent desktop sidebar with brand, season, section links, region selector, and location action. On smaller screens it becomes a sticky compact header with horizontally scrollable section links, remaining available while scrolling.
- **Season overview** uses a two-part grid: the large yield forecast and its risk, factors, and recommendation occupy the main area; current Open-Meteo conditions sit alongside it. At tablet and phone widths, the weather section moves below the forecast.
- **History** follows as a full-width analytical section. Its chart scales to the container and keeps the measured yield, model estimate, and current forecast visually distinct.
- **Garden calculator** has a separate full-width form and a dedicated result area. Crop, quantity, growing location, per-bed result, and season settings remain visible and usable.
- **Plain-language help** and the garden shortcut form a compact supporting section.
- **Specialist analysis** and **data management** use native disclosure panels so model details, validation tables, editable historical rows, settings, and CSV tools are available without crowding the default view.

## Tables and responsive behavior

Tables are sized for their contents rather than forced to share one layout. Method comparisons, per-year validation, and historical records have individual minimum widths and column proportions; long table views scroll inside their own containers. Numeric cells use tabular alignment, descriptions can wrap, and row hover does not alter the table geometry.

Responsive breakpoints are defined at 1100, 820, 600, and 370 px. The desktop sidebar becomes a compact header at tablet size, then the forecast/weather grid and calculator become single-column layouts on phones. The document itself must not scroll horizontally; wide tables may scroll only within their local container.

## Functional compatibility

The frontend retains its existing IDs, selectors, event handlers, calculation methods, chart rendering, CSV format, localStorage keys, and Open-Meteo request behavior. The page source is `yield-forecast.html`; regenerate `index.html` using `node collector/build-site.mjs`.
