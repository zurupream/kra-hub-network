# KRA Transaction Network (`kra-hub-network`)

Production-ready **Qlik Sense Custom Visualization Extension** built on **Apache ECharts (`echarts.min.js`)** and modeled after the ECharts Hub Network (`series[0].type = 'graph'`, `curveness: 0.3`, `emphasis.focus = 'adjacency'`).

Designed for analyzing **Supplier → Buyer** transaction networks with native **Qlik Master Measures (`qLibraryId`)** and **Master Dimensions** support, interactive metric switching (**Sum of Amount** vs. **Count of Activities**), quantile hub tier coloring, and click-to-filter Qlik selection controls.

---

## Deliverables & Repository Structure

```text
kra-hub-network/
├── kra-hub-network.qext         # Qlik Sense visualization extension manifest
├── kra-hub-network.js           # Main extension entry point (AMD / RequireJS + lifecycle hooks)
├── definition.js                # Qlik Property Panel definition (Dimensions, Master Measures, Network Settings)
├── data-processor.js            # HyperCube pagination, Hub aggregation, Master Measure formatting & ECharts option builder
├── style.css                    # Toolbar, 4-tier legend, tooltip, and click-to-filter popover styles
├── lib/
│   └── echarts.min.js           # Bundled Apache ECharts 5 (UMD/AMD compatible with Qlik RequireJS)
├── dist/
│   └── kra-hub-network.zip      # Ready-to-import Qlik Sense Extension archive (QMC / Qlik Cloud)
├── demo/
│   └── index.html               # Standalone interactive browser harness with simulated KRA HyperCube data
├── scripts/
│   └── build.js                 # Deliverable validator & .zip packager
└── test/
    └── kra-hub-network.test.js  # Automated unit & DOM lifecycle test suite
```

---

## 1. Qlik HyperCube & Master Measures Support

- **Dimensions (`uses: "dimensions"`, `min: 2, max: 2`):**
  1. `qDimensions[0]`: **Supplier** (Origin / Outbound)
  2. `qDimensions[1]`: **Buyer** (Destination / Inbound)
- **Measures (`uses: "measures"`, `min: 1, max: 2` — Master Measures Supported):**
  1. `qMeasures[0]`: **Sum of Amount** (Master Measure 1)
  2. `qMeasures[1]` (optional): **Count of Activities / Transactions** (Master Measure 2)
- **Crucial Master Measure Rules Implemented:**
  - Always reads measure titles dynamically from `layout.qHyperCube.qMeasureInfo[i].qFallbackTitle` (never relying on `qDef.qLabel`, which is empty when a Master Measure `qLibraryId` is used).
  - Preserves Qlik's native Master Measure number formatting (`row[2].qText` and `row[3].qText` on route cells, and `qMeasureInfo[i].qNumFormat` on aggregated Hub totals) across tooltips, popovers, and legends.
  - Configures `qInitialDataFetch` to `qWidth: 4, qHeight: 2500` (`10,000` cells per initial page) and implements recursive `backendApi.getData()` pagination in `DataProcessor.fetchAllPages()` up to the configurable **Max Edges Limit** (`default: 2500`).

---

## 2. User-Driven Metric Selection & Unique Hub Calculation

1. **Interactive Metric Switcher on Chart Toolbar (Top-Left) + Property Panel Default:**
   - Displays a segmented toggle button on the top-left toolbar dynamically labeled with the Master Measure titles from `qFallbackTitle`:
     `[ By <Measure 0 Title> ]` | `[ By <Measure 1 Title> ]`
   - Toggling immediately recalculates and updates:
     - **Node Bubble Size (`symbolSize`)** scaled smoothly between `14` and `75` (using blended square-root/logarithmic normalization).
     - **Edge/Route Thickness (`lineStyle.width`)** scaled smoothly between `1` and `8`.
     - **Node Coloring** (when `Color by Active Measure Tiers` is active).

2. **Unique Node (Hub) Aggregation (`data-processor.js`):**
   - Merges entities appearing in `Supplier` (`row[0]`) and/or `Buyer` (`row[1]`) into a single unique Hub node (`id = qText`) and computes for both Measure 0 (`m0`) and Measure 1 (`m1`):
     - `outbound_m0`, `inbound_m0`, and `total_m0 = outbound_m0 + inbound_m0`
     - `outbound_m1`, `inbound_m1`, and `total_m1 = outbound_m1 + inbound_m1`
     - `degree` = total unique connected routes (`inboundRoutes + outboundRoutes`)
     - `suppliersCount` (`# of Suppliers`) and `buyersCount` (`# of Buyers`)
     - `supplierElemNumbers` (`Dim 0` `qElemNumber` list) and `buyerElemNumbers` (`Dim 1` `qElemNumber` list) for native Qlik filtering.

3. **Node Coloring Modes (`props.colorMode`):**
   - **Option A — Color by Active Measure Tiers (`measureGradient` - Default):** Colors hubs across a 4-tier quantile palette (`Low (Q1)` → `Medium (Q2)` → `High (Q3)` → `Top Hub (Q4)`) based on the active metric.
   - **Option B — Single Solid Color (`singleColor`):** Uniform corporate hex color configurable via `props.singleColorHex` in the Property Panel.
   - **Option C — ECharts Multi-Color Hub Palette (`palette`):** Uses ECharts' multi-color palette so major hubs and their outgoing curved edges (`lineStyle: { color: 'source' }`) are visually distinct.

---

## 3. ECharts Hub Network Configuration

- `series[0].type = 'graph'`
- `layout`: `'force'` by default, with a toolbar toggle to switch between `'force'` (Hub Network) and `'circular'` (Circular Ring).
- `roam: true` (interactive zoom and pan).
- `edgeSymbol: ['none', 'arrow']` and `edgeSymbolSize: [4, 8]` indicating `Supplier → Buyer` direction.
- `lineStyle: { curveness: 0.3, color: 'source', opacity: 0.65 }` so bidirectional routes (`A → B` and `B → A`) curve cleanly without overlapping.
- `emphasis: { focus: 'adjacency', lineStyle: { width: 6, opacity: 1 } }` to highlight all inbound and outbound connections on hover while fading unrelated nodes.
- **Click-to-Filter Popover:** Clicking any Hub node opens an action popover with:
  - `[Filter Supplier]` (`backendApi.selectValues(0, supplierElemNumbers, false)`)
  - `[Filter Buyer]` (`backendApi.selectValues(1, buyerElemNumbers, false)`)
  - `[Highlight Neighbors]` (triggers ECharts `focusNodeAdjacency`)

---

## 4. Qlik Property Panel (`definition.js`)

Located under **Appearance > Network Settings**:

| # | Setting | Property Ref | Type / Component | Default |
|---|---------|--------------|------------------|---------|
| 1 | **Default Active Metric** | `props.defaultMetric` | Dropdown (`m0` vs `m1`) | `'m0'` (Measure 1) |
| 2 | **Hub Size Calculation** | `props.hubSizeMode` | Dropdown (`total`, `outbound`, `inbound`) | `'total'` |
| 3 | **Node Coloring Mode** | `props.colorMode` | Dropdown (`measureGradient`, `palette`, `singleColor`) + `props.singleColorHex` | `'measureGradient'` |
| 4 | **Default Layout** | `props.defaultLayout` | Dropdown (`force`, `circular`) | `'force'` |
| 5 | **Show Directional Arrows** | `props.showArrows` | Boolean Switch | `true` |
| 6 | **Min Bubble Size to Show Permanent Label** | `props.minLabelSize` | Slider (`10` to `60`) | `24` |
| 7 | **Force Repulsion / Node Spacing** | `props.forceRepulsion` | Slider (`100` to `1000`) | `350` |
| 8 | **Max Edges Limit** | `props.maxEdges` | Number | `2500` |

---

## 5. Setup Instructions: Bundling `echarts.min.js` via RequireJS & Clean `resize()` Handling

### Bundling `echarts.min.js` in `./lib/echarts.min.js`
1. Place the official UMD build of Apache ECharts (`echarts.min.js`) inside `./lib/echarts.min.js` (already bundled in this repository and packaged in `dist/kra-hub-network.zip`).
2. Load it in `kra-hub-network.js` via Qlik Sense's RequireJS `define()` without the `.js` extension:
   ```javascript
   define([
     'qlik',
     './lib/echarts.min',
     './definition',
     './data-processor',
     'css!./style.css'
   ], function (qlik, echartsModule, definition, DataProcessor) {
     // Resolve ECharts across AMD exports or default export
     var echarts = (echartsModule && typeof echartsModule.init === 'function')
       ? echartsModule
       : (echartsModule && echartsModule.default ? echartsModule.default : window.echarts);
     // ...
   });
   ```

### Handling `resize()` Cleanly Without Re-initializing ECharts
- **Single Initialization per Container:** In `paint($element, layout)`, `ensureInstanceState(containerEl, self)` checks `containerEl.__kraHubState`. `echarts.init(canvasEl)` is invoked **only once** when the extension container is first mounted, and subsequent `paint()` calls update the existing instance via `state.chart.setOption(option, true)`.
- **Zero Re-initialization on `resize()`:** When the user resizes the browser window or Qlik Sense grid cell, Qlik invokes `resize($element, layout)`. Our `resize` hook retrieves `containerEl.__kraHubState.chart` and calls `state.chart.resize({ animation: { duration: 150 } })` directly—without re-creating the DOM, re-initializing ECharts, or re-fetching HyperCube pages:
  ```javascript
  resize: function ($element, layout) {
    var containerEl = unwrapElement($element);
    if (!containerEl || !containerEl.__kraHubState) {
      return this.paint($element, layout);
    }
    var state = containerEl.__kraHubState;
    hidePopover(state);
    if (state.chart && typeof state.chart.resize === 'function') {
      state.chart.resize({ animation: { duration: 150 } });
    }
    return qlik && qlik.Promise ? qlik.Promise.resolve() : Promise.resolve();
  }
  ```

---

## 6. Build, Test & Installation

```bash
# Run automated unit & DOM lifecycle tests
npm test

# Validate deliverables and build dist/kra-hub-network.zip
npm run build
```

### Installing in Qlik Sense
- **Qlik Sense Enterprise (QMC) / Qlik Cloud:** Import [`dist/kra-hub-network.zip`](dist/kra-hub-network.zip) under **Extensions**.
- **Qlik Sense Desktop:** Copy the repository folder into `Documents/Qlik/Sense/Extensions/kra-hub-network/`.
