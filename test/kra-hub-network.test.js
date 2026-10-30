/**
 * @file test/kra-hub-network.test.js
 * @description Comprehensive unit and integration tests for KRA Transaction Network (`kra-hub-network`)
 * Qlik Sense Extension:
 *  1. Qlik HyperCube & Master Measures Support (`qFallbackTitle`, `qText`, `qInitialDataFetch`, pagination)
 *  2. Unique Hub Node Calculation & User-Driven Metric Selection (Measure 0 vs Measure 1)
 *  3. Node Coloring Modes (`measureGradient`, `singleColor`, `palette`) & Hub Size Modes
 *  4. ECharts Hub Network Configuration (`series[0].type = 'graph'`, `curveness: 0.3`, `emphasis.focus = 'adjacency'`)
 *  5. Property Panel (`definition.js`) verification
 *  6. Extension Lifecycle (`paint`, `resize` without re-initializing ECharts, Toolbar & Popover Qlik selection)
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const definition = require('../definition.js');
const DataProcessor = require('../data-processor.js');

/**
 * Sample KRA HyperCube fixture with Master Measures (`qLibraryId`, blank `qDef.qLabel`,
 * populated `qFallbackTitle` and `qText` formatting).
 */
function createSampleHyperCube() {
  const qMatrix = [
    // Supplier A -> Buyer B (KES 1,000,000.00, 25 activities)
    [
      { qText: 'P051A-SupplierAlpha', qElemNumber: 10 },
      { qText: 'P051B-EntityBeta', qElemNumber: 20 },
      { qNum: 1000000, qText: 'KES 1,000,000.00' },
      { qNum: 25, qText: '25 txns' }
    ],
    // Bidirectional: EntityBeta -> SupplierAlpha (KES 250,000.00, 5 activities)
    [
      { qText: 'P051B-EntityBeta', qElemNumber: 11 },
      { qText: 'P051A-SupplierAlpha', qElemNumber: 21 },
      { qNum: 250000, qText: 'KES 250,000.00' },
      { qNum: 5, qText: '5 txns' }
    ],
    // EntityBeta -> BuyerGamma (KES 500,000.00, 120 activities)
    [
      { qText: 'P051B-EntityBeta', qElemNumber: 11 },
      { qText: 'P051C-BuyerGamma', qElemNumber: 22 },
      { qNum: 500000, qText: 'KES 500,000.00' },
      { qNum: 120, qText: '120 txns' }
    ],
    // SupplierDelta -> BuyerGamma (KES 100,000.00, 10 activities)
    [
      { qText: 'P051D-SupplierDelta', qElemNumber: 12 },
      { qText: 'P051C-BuyerGamma', qElemNumber: 22 },
      { qNum: 100000, qText: 'KES 100,000.00' },
      { qNum: 10, qText: '10 txns' }
    ],
    // SupplierAlpha -> BuyerEpsilon (KES 3,500,000.00, 2 activities)
    [
      { qText: 'P051A-SupplierAlpha', qElemNumber: 10 },
      { qText: 'P051E-BuyerEpsilon', qElemNumber: 23 },
      { qNum: 3500000, qText: 'KES 3,500,000.00' },
      { qNum: 2, qText: '2 txns' }
    ]
  ];

  return {
    qSize: { qcx: 4, qcy: qMatrix.length },
    qDimensionInfo: [
      { qFallbackTitle: 'KRA Supplier PIN' },
      { qFallbackTitle: 'KRA Buyer PIN' }
    ],
    qMeasureInfo: [
      {
        qLibraryId: 'master-measure-amount-id',
        // Note: qDef.qLabel intentionally omitted to simulate Qlik Master Measure behavior
        qFallbackTitle: 'Total VAT Invoice Amount (KES)',
        qNumFormat: { qType: 'M', qFmt: 'KES #,##0.00', qThou: ',', qDec: '.' }
      },
      {
        qLibraryId: 'master-measure-count-id',
        qFallbackTitle: 'eTIMS Invoice Count',
        qNumFormat: { qType: 'I', qFmt: '#,##0 txns', qThou: ',' }
      }
    ],
    qDataPages: [
      {
        qArea: { qTop: 0, qLeft: 0, qWidth: 4, qHeight: qMatrix.length },
        qMatrix
      }
    ]
  };
}

test('1. Deliverables & Manifest (.qext) verification', () => {
  const rootDir = path.resolve(__dirname, '..');
  const requiredFiles = [
    'kra-hub-network.qext',
    'kra-hub-network.js',
    'definition.js',
    'data-processor.js',
    'style.css',
    'lib/echarts.min.js'
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(rootDir, file);
    assert.ok(fs.existsSync(fullPath), `Expected deliverable file ${file} to exist`);
  }

  const qext = JSON.parse(fs.readFileSync(path.join(rootDir, 'kra-hub-network.qext'), 'utf8'));
  assert.equal(qext.name, 'KRA Transaction Network');
  assert.equal(qext.type, 'visualization');
});

test('2. Property Panel (definition.js) supports Master Dimensions, Master Measures, and all 8 Network Settings', () => {
  assert.equal(definition.type, 'items');
  assert.equal(definition.component, 'accordion');

  // Dimensions (min: 2, max: 2)
  const dims = definition.items.dimensions;
  assert.equal(dims.uses, 'dimensions');
  assert.equal(dims.min, 2);
  assert.equal(dims.max, 2);

  // Measures (min: 1, max: 2)
  const meas = definition.items.measures;
  assert.equal(meas.uses, 'measures');
  assert.equal(meas.min, 1);
  assert.equal(meas.max, 2);

  // Appearance > Network Settings
  const netSettings = definition.items.appearance.items.networkSettings;
  assert.equal(netSettings.label, 'Network Settings');
  const items = netSettings.items;

  // 1. Default Active Metric
  assert.equal(items.defaultMetric.ref, 'props.defaultMetric');
  assert.equal(items.defaultMetric.defaultValue, 'm0');
  assert.equal(items.defaultMetric.options.length, 2);

  // 2. Hub Size Calculation
  assert.equal(items.hubSizeMode.ref, 'props.hubSizeMode');
  assert.equal(items.hubSizeMode.defaultValue, 'total');
  assert.deepEqual(
    items.hubSizeMode.options.map((o) => o.value),
    ['total', 'outbound', 'inbound']
  );

  // 3. Node Coloring Mode + Single Color Hex Picker
  assert.equal(items.colorMode.ref, 'props.colorMode');
  assert.equal(items.colorMode.defaultValue, 'measureGradient');
  assert.deepEqual(
    items.colorMode.options.map((o) => o.value),
    ['measureGradient', 'palette', 'singleColor']
  );
  assert.equal(items.singleColorHex.ref, 'props.singleColorHex');
  assert.equal(items.singleColorHex.show({ props: { colorMode: 'singleColor' } }), true);
  assert.equal(items.singleColorHex.show({ props: { colorMode: 'measureGradient' } }), false);

  // 4. Default Layout
  assert.equal(items.defaultLayout.ref, 'props.defaultLayout');
  assert.equal(items.defaultLayout.defaultValue, 'force');
  assert.deepEqual(
    items.defaultLayout.options.map((o) => o.value),
    ['force', 'circular']
  );

  // 5. Show Directional Arrows
  assert.equal(items.showArrows.ref, 'props.showArrows');
  assert.equal(items.showArrows.defaultValue, true);

  // 6. Min Bubble Size to Show Permanent Label (Slider 10 to 60, default 24)
  assert.equal(items.minLabelSize.component, 'slider');
  assert.equal(items.minLabelSize.min, 10);
  assert.equal(items.minLabelSize.max, 60);
  assert.equal(items.minLabelSize.defaultValue, 24);

  // 7. Force Repulsion / Node Spacing (Slider 100 to 1000, default 350)
  assert.equal(items.forceRepulsion.component, 'slider');
  assert.equal(items.forceRepulsion.min, 100);
  assert.equal(items.forceRepulsion.max, 1000);
  assert.equal(items.forceRepulsion.defaultValue, 350);

  // 8. Max Edges Limit (Number, default 2500)
  assert.equal(items.maxEdges.type, 'number');
  assert.equal(items.maxEdges.defaultValue, 2500);
});

test('3. Master Measure extraction reads qFallbackTitle and respects native qNumFormat / qText', () => {
  const hc = createSampleHyperCube();
  const meta = DataProcessor.extractMetadata(hc, hc.qDataPages[0].qMatrix);

  assert.equal(meta.measures[0].title, 'Total VAT Invoice Amount (KES)');
  assert.equal(meta.measures[1].title, 'eTIMS Invoice Count');

  const formattedAmt = DataProcessor.formatMeasureValue(1250000, meta.measures[0]);
  assert.equal(formattedAmt, 'KES 1,250,000.00');

  const formattedCnt = DataProcessor.formatMeasureValue(125, meta.measures[1]);
  assert.equal(formattedCnt, '125 txns');
});

test('4. HyperCube pagination via backendApi.getData() fetches pages up to configurable maxEdges', async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => [
    { qText: `Sup_${i}`, qElemNumber: i },
    { qText: `Buy_${i}`, qElemNumber: i + 1000 },
    { qNum: 1000 * (i + 1), qText: `KES ${1000 * (i + 1)}` },
    { qNum: i + 1, qText: `${i + 1}` }
  ]);

  const hyperCube = {
    qSize: { qcx: 4, qcy: 350 },
    qDimensionInfo: [{}, {}],
    qMeasureInfo: [{}, {}],
    qDataPages: [{ qMatrix: page1 }]
  };

  const getDataCalls = [];
  const mockBackendApi = {
    getData(pages) {
      getDataCalls.push(pages[0]);
      const { qTop, qHeight } = pages[0];
      const rows = Array.from({ length: qHeight }, (_, idx) => {
        const rowNum = qTop + idx;
        return [
          { qText: `Sup_${rowNum}`, qElemNumber: rowNum },
          { qText: `Buy_${rowNum}`, qElemNumber: rowNum + 1000 },
          { qNum: 500, qText: 'KES 500' },
          { qNum: 1, qText: '1' }
        ];
      });
      return Promise.resolve([{ qMatrix: rows }]);
    }
  };

  // Cap at maxEdges = 260
  const allRows = await DataProcessor.fetchAllPages(mockBackendApi, hyperCube, 260);
  assert.equal(allRows.length, 260);
  assert.equal(getDataCalls.length, 1);
  assert.equal(getDataCalls[0].qTop, 100);
  assert.equal(getDataCalls[0].qWidth, 4);
  assert.equal(getDataCalls[0].qHeight, 160);
});

test('5. Unique Hub Node calculation merges Supplier & Buyer entities and computes m0, m1, and degree', () => {
  const hc = createSampleHyperCube();
  const model = DataProcessor.processHyperCube(hc.qDataPages[0].qMatrix, hc, {
    activeMetric: 'm0',
    hubSizeMode: 'total',
    colorMode: 'measureGradient'
  });

  // 5 unique entities across the 5 routes
  assert.equal(model.nodes.length, 5);
  assert.equal(model.edges.length, 5);

  const beta = model.nodes.find((n) => n.id === 'P051B-EntityBeta');
  assert.ok(beta, 'Expected P051B-EntityBeta hub node');

  // EntityBeta is Buyer from SupplierAlpha (1,000,000, 25)
  // AND Supplier to SupplierAlpha (250,000, 5) and BuyerGamma (500,000, 120)
  assert.equal(beta.inbound_m0, 1000000);
  assert.equal(beta.outbound_m0, 750000);
  assert.equal(beta.total_m0, 1750000);

  assert.equal(beta.inbound_m1, 25);
  assert.equal(beta.outbound_m1, 125);
  assert.equal(beta.total_m1, 150);

  // 1 inbound route + 2 outbound routes = 3 total connected routes (degree)
  assert.equal(beta.degree, 3);
  assert.equal(beta.suppliersCount, 1); // P051A-SupplierAlpha
  assert.equal(beta.buyersCount, 2); // P051A-SupplierAlpha, P051C-BuyerGamma

  // Qlik qElemNumber preserved for both Supplier (Dim 0) and Buyer (Dim 1)
  assert.deepEqual(beta.supplierElemNumbers, [11]);
  assert.deepEqual(beta.buyerElemNumbers, [20]);
});

test('6. User-driven Metric Selection (m0 vs m1) updates symbolSize [14..75], edge width [1..8], and node colors', () => {
  const hc = createSampleHyperCube();
  const model = DataProcessor.processHyperCube(hc.qDataPages[0].qMatrix, hc, {
    activeMetric: 'm0',
    hubSizeMode: 'total',
    colorMode: 'measureGradient'
  });

  const alpha = model.nodes.find((n) => n.id === 'P051A-SupplierAlpha');
  const gamma = model.nodes.find((n) => n.id === 'P051C-BuyerGamma');

  // Under m0 (Sum of Amount): Alpha has total_m0 = 4,750,000 (largest), Gamma has total_m0 = 600,000
  const alphaSizeM0 = alpha.symbolSize;
  const gammaSizeM0 = gamma.symbolSize;
  assert.equal(alphaSizeM0, 75);
  assert.ok(alphaSizeM0 > gammaSizeM0);

  // All symbolSizes in [14, 75] and all edge widths in [1, 8]
  for (const n of model.nodes) {
    assert.ok(n.symbolSize >= 14 && n.symbolSize <= 75, `symbolSize ${n.symbolSize} out of [14, 75]`);
  }
  for (const e of model.edges) {
    assert.ok(e.lineStyle.width >= 1 && e.lineStyle.width <= 8, `edge width ${e.lineStyle.width} out of [1, 8]`);
  }

  // Switch activeMetric to 'm1' (Count of Activities):
  // Gamma has total_m1 = 130, Beta has total_m1 = 150 (largest), Alpha has total_m1 = 32
  DataProcessor.applyVisualEncodings(model, {
    activeMetric: 'm1',
    hubSizeMode: 'total',
    colorMode: 'measureGradient'
  });

  const alphaSizeM1 = alpha.symbolSize;
  const gammaSizeM1 = gamma.symbolSize;
  assert.ok(gammaSizeM1 > alphaSizeM1, 'Switching to m1 should make Gamma larger than Alpha');

  // Test Option B: Single Solid Color
  DataProcessor.applyVisualEncodings(model, {
    activeMetric: 'm1',
    hubSizeMode: 'total',
    colorMode: 'singleColor',
    singleColorHex: '#0f766e'
  });
  for (const n of model.nodes) {
    assert.equal(n.itemStyle.color, '#0f766e');
  }

  // Test Option C: ECharts Multi-Color Hub Palette
  DataProcessor.applyVisualEncodings(model, {
    activeMetric: 'm0',
    hubSizeMode: 'total',
    colorMode: 'palette'
  });
  for (const n of model.nodes) {
    assert.ok(DataProcessor.ECHARTS_HUB_PALETTE.includes(n.itemStyle.color));
  }
});

test('7. ECharts Hub Network option matches Link 1 specification and formats tooltips with Master Measure titles', () => {
  const hc = createSampleHyperCube();
  const model = DataProcessor.processHyperCube(hc.qDataPages[0].qMatrix, hc, {
    activeMetric: 'm0',
    hubSizeMode: 'total',
    colorMode: 'measureGradient'
  });

  const option = DataProcessor.buildEChartsOption(model, {
    layout: 'force',
    showArrows: true,
    forceRepulsion: 450,
    minLabelSize: 24
  });

  const series = option.series[0];
  assert.equal(series.type, 'graph');
  assert.equal(series.layout, 'force');
  assert.equal(series.roam, true);
  assert.deepEqual(series.edgeSymbol, ['none', 'arrow']);
  assert.deepEqual(series.edgeSymbolSize, [4, 8]);
  assert.equal(series.lineStyle.curveness, 0.3);
  assert.equal(series.lineStyle.color, 'source');
  assert.equal(series.lineStyle.opacity, 0.65);
  assert.equal(series.emphasis.focus, 'adjacency');
  assert.equal(series.emphasis.lineStyle.width, 6);
  assert.equal(series.emphasis.lineStyle.opacity, 1);
  assert.equal(series.force.repulsion, 450);

  // Verify Hub (Node) Tooltip uses Master Measure titles & breakdown
  const beta = model.nodes.find((n) => n.id === 'P051B-EntityBeta');
  const nodeTooltip = option.tooltip.formatter({ dataType: 'node', data: beta });
  assert.ok(nodeTooltip.includes('P051B-EntityBeta'));
  assert.ok(nodeTooltip.includes('Total VAT Invoice Amount (KES)'));
  assert.ok(nodeTooltip.includes('KES 1,750,000.00'));
  assert.ok(nodeTooltip.includes('Outbound (Supplier): <strong>KES 750,000.00</strong>'));
  assert.ok(nodeTooltip.includes('Inbound (Buyer): <strong>KES 1,000,000.00</strong>'));
  assert.ok(nodeTooltip.includes('eTIMS Invoice Count'));
  assert.ok(nodeTooltip.includes('1 Suppliers'));
  assert.ok(nodeTooltip.includes('2 Buyers'));

  // Verify Route (Edge) Tooltip uses Supplier -> Buyer and exact row[2].qText / row[3].qText
  const edge0 = model.edges[0];
  const edgeTooltip = option.tooltip.formatter({ dataType: 'edge', data: edge0 });
  assert.ok(edgeTooltip.includes('P051A-SupplierAlpha &rarr; P051B-EntityBeta'));
  assert.ok(edgeTooltip.includes('Total VAT Invoice Amount (KES):'));
  assert.ok(edgeTooltip.includes('KES 1,000,000.00'));
  assert.ok(edgeTooltip.includes('eTIMS Invoice Count:'));
  assert.ok(edgeTooltip.includes('25 txns'));
});

test('8. Extension lifecycle: paint, interactive toolbar toggles, Qlik selection popover, and resize without re-initializing ECharts', async () => {
  const dom = new JSDOM('<!DOCTYPE html><div id="ext-root" style="width:800px;height:600px;"></div>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;

  let initCallCount = 0;
  let resizeCallCount = 0;
  let lastSetOption = null;
  let clickHandler = null;
  const dispatchedActions = [];

  // Mock ECharts module to track init vs resize calls accurately in JSDOM
  const mockECharts = {
    init() {
      initCallCount++;
      return {
        setOption(opt) {
          lastSetOption = opt;
        },
        resize() {
          resizeCallCount++;
        },
        clear() {},
        dispose() {},
        on(eventName, handler) {
          if (eventName === 'click') clickHandler = handler;
        },
        getZr() {
          return { on() {} };
        },
        dispatchAction(action) {
          dispatchedActions.push(action);
        },
        getDataURL() {
          return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
        }
      };
    }
  };

  // Require extension factory using AMD loader shim with our mockECharts
  let extensionDef = null;
  global.define = function (deps, factory) {
    extensionDef = factory({ Promise }, mockECharts, definition, DataProcessor);
  };
  global.define.amd = true;

  const extPath = require.resolve('../kra-hub-network.js');
  delete require.cache[extPath];
  require('../kra-hub-network.js');
  delete global.define;

  assert.ok(extensionDef, 'Extension definition should load via AMD define()');
  assert.deepEqual(extensionDef.initialProperties.qHyperCubeDef.qInitialDataFetch[0], {
    qTop: 0,
    qLeft: 0,
    qWidth: 4,
    qHeight: 2500
  });

  const selectedCalls = [];
  const instance = Object.create(extensionDef);
  instance.backendApi = {
    getData() {
      return Promise.resolve([]);
    },
    selectValues(dimIndex, elems, toggle) {
      selectedCalls.push({ dimIndex, elems, toggle });
    }
  };

  const containerEl = dom.window.document.getElementById('ext-root');
  const layout = {
    props: {
      defaultMetric: 'm0',
      hubSizeMode: 'total',
      colorMode: 'measureGradient',
      defaultLayout: 'force',
      showArrows: true,
      minLabelSize: 24,
      forceRepulsion: 350,
      maxEdges: 2500
    },
    qHyperCube: createSampleHyperCube()
  };

  // First paint
  await instance.paint(containerEl, layout);
  assert.equal(initCallCount, 1, 'echarts.init should be called once on initial paint');
  assert.ok(lastSetOption, 'chart.setOption should be called on paint');

  // Verify toolbar Metric Switcher shows actual Master Measure titles from qFallbackTitle
  const metricButtons = containerEl.querySelectorAll('.kra-metric-switcher .kra-seg-btn');
  assert.equal(metricButtons[0].textContent, 'By Total VAT Invoice Amount (KES)');
  assert.equal(metricButtons[1].textContent, 'By eTIMS Invoice Count');

  // Click Measure 2 button on Toolbar -> updates active metric immediately
  metricButtons[1].click();
  assert.ok(metricButtons[1].classList.contains('active'));

  // Click Circular layout button on Toolbar -> switches series[0].layout to 'circular'
  const circularBtn = containerEl.querySelector('.kra-layout-switcher .kra-seg-btn[data-layout="circular"]');
  circularBtn.click();
  assert.equal(lastSetOption.series[0].layout, 'circular');

  // Simulate clicking a Hub node in ECharts -> opens popover & filters in Qlik
  const betaNode = lastSetOption.series[0].data.find((n) => n.id === 'P051B-EntityBeta');
  clickHandler({
    dataType: 'node',
    data: betaNode,
    dataIndex: 1,
    event: { event: { offsetX: 100, offsetY: 100 } }
  });

  const popoverEl = containerEl.querySelector('.kra-node-popover');
  assert.equal(popoverEl.style.display, 'block', 'Clicking a node should open the popover');

  const filterSupplierBtn = containerEl.querySelector('.kra-btn-filter-supplier');
  filterSupplierBtn.click();
  assert.equal(selectedCalls.length, 1);
  assert.deepEqual(selectedCalls[0], { dimIndex: 0, elems: [11], toggle: false });

  // Call resize() multiple times -> must NOT re-initialize ECharts!
  const prevResizeCount = resizeCallCount;
  await instance.resize(containerEl, layout);
  await instance.resize(containerEl, layout);
  assert.equal(initCallCount, 1, 'resize() must NOT re-initialize ECharts');
  assert.equal(resizeCallCount, prevResizeCount + 2, 'resize() must call chart.resize()');

  instance.destroy(containerEl);
});
