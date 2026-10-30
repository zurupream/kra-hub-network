/**
 * @file kra-hub-network.js
 * @description Main Qlik Sense Custom Visualization Extension ("kra-hub-network" / KRA Transaction Network)
 * built on Apache ECharts (`series[0].type = 'graph'`, `curveness: 0.3`, `emphasis.focus = 'adjacency'`).
 *
 * Supports:
 * - Native Qlik Master Measures (`qLibraryId`) and Master Dimensions (`qFallbackTitle` & `qText` formatting)
 * - `qInitialDataFetch` (`qWidth: 4, qHeight: 2500`) + `backendApi.getData()` pagination up to `maxEdges`
 * - Interactive Toolbar Metric Switcher (`By <Measure 0 Title>` | `By <Measure 1 Title>`)
 * - Entity Search Input (zoom/highlight immediate network), Layout Toggle (`Force` / `Circular`),
 *   Reset Zoom, and Export PNG
 * - Click-to-Filter Node Popover (`[Filter Supplier]`, `[Filter Buyer]`, `[Highlight Neighbors]`)
 * - Clean `resize()` lifecycle handling without re-initializing ECharts
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([
      'qlik',
      './lib/echarts.min',
      './definition',
      './data-processor',
      'css!./style.css'
    ], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      root.qlik || {},
      require('./lib/echarts.min.js'),
      require('./definition.js'),
      require('./data-processor.js')
    );
  } else {
    root.KRAHubNetworkExtension = factory(
      root.qlik || {},
      root.echarts,
      root.KRAHubNetworkDefinition,
      root.KRAHubDataProcessor
    );
  }
})(typeof self !== 'undefined' ? self : this, function (qlik, echartsModule, definition, DataProcessor) {
  'use strict';

  /**
   * Resolve ECharts object across AMD exports, ES module default, or window global.
   */
  function resolveECharts() {
    if (echartsModule && typeof echartsModule.init === 'function') {
      return echartsModule;
    }
    if (echartsModule && echartsModule.default && typeof echartsModule.default.init === 'function') {
      return echartsModule.default;
    }
    if (typeof window !== 'undefined' && window.echarts && typeof window.echarts.init === 'function') {
      return window.echarts;
    }
    return echartsModule;
  }

  /**
   * Escape HTML special characters for safe DOM insertion.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Unwrap jQuery element or raw HTMLElement into raw HTMLElement.
   */
  function unwrapElement($element) {
    if (!$element) return null;
    if ($element instanceof HTMLElement) return $element;
    if ($element[0] instanceof HTMLElement) return $element[0];
    return $element;
  }

  /**
   * Initialize the DOM structure and ECharts instance once per container element.
   */
  function ensureInstanceState(containerEl, extensionContext) {
    if (containerEl.__kraHubState && containerEl.__kraHubState.chart) {
      containerEl.__kraHubState.context = extensionContext;
      return containerEl.__kraHubState;
    }

    containerEl.innerHTML = [
      '<div class="kra-hub-wrapper">',
      '  <!-- Top Interactive Toolbar -->',
      '  <div class="kra-hub-toolbar">',
      '    <div class="kra-toolbar-left">',
      '      <div class="kra-segmented-group kra-metric-switcher" role="group" aria-label="Metric Switcher">',
      '        <button type="button" class="kra-seg-btn active" data-metric="m0" title="Size & color hubs by Measure 1">',
      '          By Sum of Amount',
      '        </button>',
      '        <button type="button" class="kra-seg-btn" data-metric="m1" title="Size & color hubs by Measure 2">',
      '          By Count of Activities',
      '        </button>',
      '      </div>',
      '    </div>',
      '    <div class="kra-toolbar-right">',
      '      <div class="kra-search-box">',
      '        <input type="text" class="kra-search-input" placeholder="Search entity / PIN..." list="kra-hub-entities-list" autocomplete="off" />',
      '        <datalist id="kra-hub-entities-list"></datalist>',
      '        <button type="button" class="kra-search-clear" title="Clear search" style="display:none">&times;</button>',
      '      </div>',
      '      <div class="kra-segmented-group kra-layout-switcher" role="group" aria-label="Layout Switcher">',
      '        <button type="button" class="kra-seg-btn active" data-layout="force" title="Force-directed Hub Network">Force</button>',
      '        <button type="button" class="kra-seg-btn" data-layout="circular" title="Circular Ring Layout">Circular</button>',
      '      </div>',
      '      <button type="button" class="kra-action-btn kra-btn-reset" title="Reset Zoom & Pan">Reset Zoom</button>',
      '      <button type="button" class="kra-action-btn kra-btn-export" title="Export Network as PNG">Export PNG</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- Main ECharts Canvas -->',
      '  <div class="kra-hub-Body">',
      '    <div class="kra-hub-canvas"></div>',
      '',
      '    <!-- Tier Legend Bar (shown when Color by Active Measure Tiers is enabled) -->',
      '    <div class="kra-hub-legend">',
      '      <span class="kra-legend-title">Hub Tiers:</span>',
      '      <span class="kra-legend-item"><i style="background:#38bdf8"></i>Low</span>',
      '      <span class="kra-legend-item"><i style="background:#6366f1"></i>Medium</span>',
      '      <span class="kra-legend-item"><i style="background:#f59e0b"></i>High</span>',
      '      <span class="kra-legend-item"><i style="background:#e11d48"></i>Top Hub</span>',
      '      <span class="kra-legend-stats"></span>',
      '    </div>',
      '',
      '    <!-- Click-to-Filter Node Popover -->',
      '    <div class="kra-node-popover" style="display:none" role="dialog" aria-label="Hub Actions">',
      '      <div class="kra-popover-header">',
      '        <span class="kra-popover-title"></span>',
      '        <button type="button" class="kra-popover-close" title="Close">&times;</button>',
      '      </div>',
      '      <div class="kra-popover-meta"></div>',
      '      <div class="kra-popover-actions">',
      '        <button type="button" class="kra-popover-btn kra-btn-filter-supplier">Filter Supplier</button>',
      '        <button type="button" class="kra-popover-btn kra-btn-filter-buyer">Filter Buyer</button>',
      '        <button type="button" class="kra-popover-btn kra-btn-highlight-neighbors">Highlight Neighbors</button>',
      '      </div>',
      '    </div>',
      '',
      '    <!-- Empty / Loading State Overlay -->',
      '    <div class="kra-hub-empty" style="display:none"></div>',
      '  </div>',
      '</div>'
    ].join('\n');

    var wrapperEl = containerEl.querySelector('.kra-hub-wrapper');
    var canvasEl = containerEl.querySelector('.kra-hub-canvas');
    var metricBtns = containerEl.querySelectorAll('.kra-metric-switcher .kra-seg-btn');
    var layoutBtns = containerEl.querySelectorAll('.kra-layout-switcher .kra-seg-btn');
    var searchInput = containerEl.querySelector('.kra-search-input');
    var searchDatalist = containerEl.querySelector('#kra-hub-entities-list');
    var searchClearBtn = containerEl.querySelector('.kra-search-clear');
    var resetBtn = containerEl.querySelector('.kra-btn-reset');
    var exportBtn = containerEl.querySelector('.kra-btn-export');
    var legendEl = containerEl.querySelector('.kra-hub-legend');
    var legendStatsEl = containerEl.querySelector('.kra-legend-stats');
    var popoverEl = containerEl.querySelector('.kra-node-popover');
    var popoverTitleEl = containerEl.querySelector('.kra-popover-title');
    var popoverMetaEl = containerEl.querySelector('.kra-popover-meta');
    var popoverCloseBtn = containerEl.querySelector('.kra-popover-close');
    var filterSupplierBtn = containerEl.querySelector('.kra-btn-filter-supplier');
    var filterBuyerBtn = containerEl.querySelector('.kra-btn-filter-buyer');
    var highlightNeighborsBtn = containerEl.querySelector('.kra-btn-highlight-neighbors');
    var emptyOverlayEl = containerEl.querySelector('.kra-hub-empty');

    // Give unique datalist ID in case multiple chart instances exist on the same Qlik sheet
    var uniqueId = 'kra-datalist-' + Math.random().toString(36).substring(2, 9);
    searchDatalist.id = uniqueId;
    searchInput.setAttribute('list', uniqueId);

    var ec = resolveECharts();
    var chart = ec.init(canvasEl, null, { renderer: 'canvas' });

    var state = {
      context: extensionContext,
      containerEl: containerEl,
      wrapperEl: wrapperEl,
      canvasEl: canvasEl,
      chart: chart,
      model: null,
      settings: {
        activeMetric: 'm0',
        hubSizeMode: 'total',
        colorMode: 'measureGradient',
        singleColorHex: '#1d4ed8',
        layout: 'force',
        showArrows: true,
        minLabelSize: 24,
        forceRepulsion: 350,
        maxEdges: 2500
      },
      lastPropMetric: null,
      lastPropLayout: null,
      selectedNode: null,
      highlightedNodeIndex: null,
      dom: {
        metricBtns: metricBtns,
        layoutBtns: layoutBtns,
        searchInput: searchInput,
        searchDatalist: searchDatalist,
        searchClearBtn: searchClearBtn,
        resetBtn: resetBtn,
        exportBtn: exportBtn,
        legendEl: legendEl,
        legendStatsEl: legendStatsEl,
        popoverEl: popoverEl,
        popoverTitleEl: popoverTitleEl,
        popoverMetaEl: popoverMetaEl,
        popoverCloseBtn: popoverCloseBtn,
        filterSupplierBtn: filterSupplierBtn,
        filterBuyerBtn: filterBuyerBtn,
        highlightNeighborsBtn: highlightNeighborsBtn,
        emptyOverlayEl: emptyOverlayEl
      }
    };

    bindEvents(state);
    containerEl.__kraHubState = state;
    return state;
  }

  /**
   * Bind toolbar, search, ECharts node click, and Qlik selection popover events.
   */
  function bindEvents(state) {
    var dom = state.dom;

    // 1. Interactive Metric Switcher (Measure 1: Amount vs Measure 2: Activities)
    Array.prototype.forEach.call(dom.metricBtns, function (btn) {
      btn.addEventListener('click', function () {
        var metric = btn.getAttribute('data-metric');
        if (!metric || state.settings.activeMetric === metric) return;
        state.settings.activeMetric = metric;
        hidePopover(state);
        updateToolbarState(state);
        if (state.model) {
          DataProcessor.applyVisualEncodings(state.model, state.settings);
          renderChartOption(state, false);
        }
      });
    });

    // 2. Layout Toggle (Force vs Circular)
    Array.prototype.forEach.call(dom.layoutBtns, function (btn) {
      btn.addEventListener('click', function () {
        var layoutMode = btn.getAttribute('data-layout');
        if (!layoutMode || state.settings.layout === layoutMode) return;
        state.settings.layout = layoutMode;
        hidePopover(state);
        updateToolbarState(state);
        if (state.model) {
          renderChartOption(state, false);
        }
      });
    });

    // 3. Entity Search Input (zoom/highlight immediate network)
    function performSearch(query) {
      var trimmed = (query || '').trim().toLowerCase();
      dom.searchClearBtn.style.display = trimmed ? 'inline-flex' : 'none';
      if (!state.model || !state.model.nodes || state.model.nodes.length === 0) return;

      if (!trimmed) {
        clearHighlight(state);
        return;
      }

      // Find exact match first, otherwise partial substring match
      var matchIndex = -1;
      for (var i = 0; i < state.model.nodes.length; i++) {
        var nameLower = state.model.nodes[i].name.toLowerCase();
        if (nameLower === trimmed) {
          matchIndex = i;
          break;
        }
        if (matchIndex === -1 && nameLower.indexOf(trimmed) !== -1) {
          matchIndex = i;
        }
      }

      if (matchIndex !== -1) {
        highlightNodeNetwork(state, matchIndex);
      }
    }

    dom.searchInput.addEventListener('input', function (e) {
      performSearch(e.target.value);
    });

    dom.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        performSearch(dom.searchInput.value);
      } else if (e.key === 'Escape') {
        dom.searchInput.value = '';
        performSearch('');
      }
    });

    dom.searchClearBtn.addEventListener('click', function () {
      dom.searchInput.value = '';
      performSearch('');
    });

    // 4. Reset Zoom & Highlights
    dom.resetBtn.addEventListener('click', function () {
      hidePopover(state);
      dom.searchInput.value = '';
      dom.searchClearBtn.style.display = 'none';
      clearHighlight(state);
      if (state.model) {
        state.chart.dispatchAction({ type: 'restore' });
        renderChartOption(state, true);
      }
    });

    // 5. Export PNG
    dom.exportBtn.addEventListener('click', function () {
      hidePopover(state);
      try {
        var dataUrl = state.chart.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: '#ffffff'
        });
        if (dataUrl && typeof document !== 'undefined') {
          var link = document.createElement('a');
          link.download = 'kra-transaction-network.png';
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (err) {
        // Ignore export errors in headless/mock environments
      }
    });

    // 6. ECharts Node Click -> Open Popover with [Filter Supplier], [Filter Buyer], [Highlight Neighbors]
    state.chart.on('click', function (params) {
      if (params && params.dataType === 'node' && params.data) {
        openNodePopover(state, params.data, params.dataIndex, params.event);
      } else {
        hidePopover(state);
      }
    });

    // Dismiss popover when clicking empty canvas area
    if (state.chart.getZr && state.chart.getZr()) {
      state.chart.getZr().on('click', function (zrEvent) {
        if (!zrEvent.target) {
          hidePopover(state);
        }
      });
    }

    dom.popoverCloseBtn.addEventListener('click', function () {
      hidePopover(state);
    });

    // Popover Action 1: [Filter Supplier] (Dimension 0)
    dom.filterSupplierBtn.addEventListener('click', function () {
      if (!state.selectedNode) return;
      var elems = state.selectedNode.supplierElemNumbers || [];
      if (elems.length > 0 && state.context && state.context.backendApi) {
        state.context.backendApi.selectValues(0, elems, false);
      }
      hidePopover(state);
    });

    // Popover Action 2: [Filter Buyer] (Dimension 1)
    dom.filterBuyerBtn.addEventListener('click', function () {
      if (!state.selectedNode) return;
      var elems = state.selectedNode.buyerElemNumbers || [];
      if (elems.length > 0 && state.context && state.context.backendApi) {
        state.context.backendApi.selectValues(1, elems, false);
      }
      hidePopover(state);
    });

    // Popover Action 3: [Highlight Neighbors]
    dom.highlightNeighborsBtn.addEventListener('click', function () {
      if (state.selectedNodeIndex !== null && state.selectedNodeIndex !== undefined) {
        highlightNodeNetwork(state, state.selectedNodeIndex);
      }
      hidePopover(state);
    });
  }

  /**
   * Focus/highlight a specific hub and its immediate inbound/outbound adjacency network.
   */
  function highlightNodeNetwork(state, dataIndex) {
    state.highlightedNodeIndex = dataIndex;
    state.chart.dispatchAction({
      type: 'downplay',
      seriesIndex: 0
    });
    state.chart.dispatchAction({
      type: 'highlight',
      seriesIndex: 0,
      dataIndex: dataIndex
    });
    state.chart.dispatchAction({
      type: 'focusNodeAdjacency',
      seriesIndex: 0,
      dataIndex: dataIndex
    });
    state.chart.dispatchAction({
      type: 'showTip',
      seriesIndex: 0,
      dataIndex: dataIndex
    });
  }

  /**
   * Clear node adjacency highlight.
   */
  function clearHighlight(state) {
    state.highlightedNodeIndex = null;
    state.chart.dispatchAction({
      type: 'unfocusNodeAdjacency',
      seriesIndex: 0
    });
    state.chart.dispatchAction({
      type: 'downplay',
      seriesIndex: 0
    });
    state.chart.dispatchAction({
      type: 'hideTip'
    });
  }

  /**
   * Open the Click-to-Filter popover for a clicked Hub node.
   */
  function openNodePopover(state, nodeData, dataIndex, chartEvent) {
    var dom = state.dom;
    state.selectedNode = nodeData;
    state.selectedNodeIndex = dataIndex;

    dom.popoverTitleEl.textContent = nodeData.name;
    var m0Title = (state.model && state.model.metadata && state.model.metadata.measures[0])
      ? state.model.metadata.measures[0].title
      : 'Sum of Amount';
    var m1Title = (state.model && state.model.metadata && state.model.metadata.measures[1])
      ? state.model.metadata.measures[1].title
      : 'Count of Activities';

    dom.popoverMetaEl.innerHTML = [
      '<div><strong>' + escapeHtml(m0Title) + ':</strong> ' + escapeHtml(nodeData.total_m0_text) + '</div>',
      '<div><strong>' + escapeHtml(m1Title) + ':</strong> ' + escapeHtml(nodeData.total_m1_text) + '</div>',
      '<div class="kra-popover-routes">Suppliers: ' + nodeData.suppliersCount + ' &nbsp;|&nbsp; Buyers: ' + nodeData.buyersCount + '</div>'
    ].join('');

    var hasSupplierElems = Array.isArray(nodeData.supplierElemNumbers) && nodeData.supplierElemNumbers.length > 0;
    var hasBuyerElems = Array.isArray(nodeData.buyerElemNumbers) && nodeData.buyerElemNumbers.length > 0;

    dom.filterSupplierBtn.disabled = !hasSupplierElems;
    dom.filterBuyerBtn.disabled = !hasBuyerElems;

    // Position popover near click coordinates within container bounds
    var x = 24;
    var y = 24;
    if (chartEvent && chartEvent.event) {
      var rawEv = chartEvent.event;
      if (typeof rawEv.offsetX === 'number' && typeof rawEv.offsetY === 'number') {
        x = rawEv.offsetX + 12;
        y = rawEv.offsetY + 12;
      }
    }

    var bodyWidth = state.canvasEl.clientWidth || 600;
    var bodyHeight = state.canvasEl.clientHeight || 400;
    var popWidth = 280;
    var popHeight = 145;

    if (x + popWidth > bodyWidth - 12) {
      x = Math.max(12, bodyWidth - popWidth - 12);
    }
    if (y + popHeight > bodyHeight - 12) {
      y = Math.max(12, bodyHeight - popHeight - 12);
    }

    dom.popoverEl.style.left = x + 'px';
    dom.popoverEl.style.top = y + 'px';
    dom.popoverEl.style.display = 'block';
  }

  /**
   * Hide the Click-to-Filter popover.
   */
  function hidePopover(state) {
    state.selectedNode = null;
    state.selectedNodeIndex = null;
    if (state.dom && state.dom.popoverEl) {
      state.dom.popoverEl.style.display = 'none';
    }
  }

  /**
   * Update toolbar button labels (using dynamic Master Measure titles from `qFallbackTitle`)
   * and active toggle classes.
   */
  function updateToolbarState(state) {
    var dom = state.dom;
    var metadata = state.model ? state.model.metadata : null;
    var m0Title = (metadata && metadata.measures && metadata.measures[0])
      ? metadata.measures[0].title
      : 'Sum of Amount';
    var m1Title = (metadata && metadata.measures && metadata.measures[1])
      ? metadata.measures[1].title
      : 'Count of Activities';

    Array.prototype.forEach.call(dom.metricBtns, function (btn) {
      var m = btn.getAttribute('data-metric');
      if (m === 'm0') {
        btn.textContent = 'By ' + m0Title;
      } else if (m === 'm1') {
        btn.textContent = 'By ' + m1Title;
      }
      if (m === state.settings.activeMetric) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    Array.prototype.forEach.call(dom.layoutBtns, function (btn) {
      var l = btn.getAttribute('data-layout');
      if (l === state.settings.layout) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Show or hide the 4-tier legend bar depending on colorMode
    if (dom.legendEl) {
      var showTiers = state.settings.colorMode === 'measureGradient';
      var tierItems = dom.legendEl.querySelectorAll('.kra-legend-item, .kra-legend-title');
      Array.prototype.forEach.call(tierItems, function (el) {
        el.style.display = showTiers ? 'inline-flex' : 'none';
      });
    }

    if (dom.legendStatsEl && state.model) {
      var totalRows = (state.model.metadata && state.model.metadata.totalHyperCubeRows) || state.model.edges.length;
      if (totalRows > state.model.edges.length) {
        dom.legendStatsEl.textContent =
          state.model.nodes.length + ' Hubs · ' + state.model.edges.length + ' of ' + totalRows + ' Routes';
      } else {
        dom.legendStatsEl.textContent =
          state.model.nodes.length + ' Hubs · ' + state.model.edges.length + ' Routes';
      }
    }
  }

  /**
   * Populate the search datalist with unique Hub entity names.
   */
  function updateSearchDatalist(state) {
    var dom = state.dom;
    if (!dom.searchDatalist || !state.model) return;
    var optionsHtml = [];
    var nodes = state.model.nodes || [];
    for (var i = 0; i < nodes.length; i++) {
      optionsHtml.push('<option value="' + escapeHtml(nodes[i].name) + '"></option>');
    }
    dom.searchDatalist.innerHTML = optionsHtml.join('');
  }

  /**
   * Build and apply the ECharts option to the existing chart instance.
   */
  function renderChartOption(state, notMerge) {
    if (!state.chart || !state.model) return;
    var option = DataProcessor.buildEChartsOption(state.model, state.settings);
    state.chart.setOption(option, Boolean(notMerge));
  }

  return {
    /**
     * 1. Qlik HyperCube & Property Panel Initial Properties
     * - 2 Dimensions: Supplier (Outbound) & Buyer (Inbound)
     * - 1..2 Master Measures: Sum of Amount & Count of Activities
     * - qInitialDataFetch: qWidth: 4, qHeight: 2500 (10,000 cells)
     * - Add-ons > Data Handling support (qCalcCond / qCalcCondition & qSuppressZero)
     */
    initialProperties: {
      qHyperCubeDef: {
        qDimensions: [],
        qMeasures: [],
        qInitialDataFetch: [
          {
            qTop: 0,
            qLeft: 0,
            qWidth: 4,
            qHeight: 2500
          }
        ],
        qSuppressZero: false,
        qSuppressMissing: true,
        qCalcCond: {
          qv: ''
        },
        qCalcCondition: {
          qCond: {
            qv: ''
          },
          qMsg: {
            qv: ''
          }
        }
      },
      props: {
        defaultMetric: 'm0',
        hubSizeMode: 'total',
        colorMode: 'measureGradient',
        singleColorHex: '#1d4ed8',
        defaultLayout: 'force',
        showArrows: true,
        minLabelSize: 24,
        forceRepulsion: 350,
        maxEdges: 2500
      }
    },

    /**
     * 2. Property Panel Definition (`definition.js`)
     */
    definition: definition,

    /**
     * 3. Qlik Sense Native Capabilities Support
     */
    support: {
      snapshot: true,
      export: true,
      exportData: true
    },

    /**
     * 4. Resize Lifecycle Hook
     * Handles container resize cleanly without re-initializing ECharts or re-fetching data.
     */
    resize: function ($element, layout) {
      var containerEl = unwrapElement($element);
      if (!containerEl || !containerEl.__kraHubState) {
        return this.paint($element, layout);
      }
      var state = containerEl.__kraHubState;
      hidePopover(state);
      if (state.chart && typeof state.chart.resize === 'function') {
        state.chart.resize({
          animation: { duration: 150 }
        });
      }
      return qlik && qlik.Promise ? qlik.Promise.resolve() : Promise.resolve();
    },

    /**
     * 5. Paint Lifecycle Hook
     * Fetches paginated HyperCube rows up to `maxEdges`, processes unique Hubs & Routes,
     * and updates the ECharts Hub Network.
     */
    paint: function ($element, layout) {
      var self = this;
      var containerEl = unwrapElement($element);
      if (!containerEl) {
        return qlik && qlik.Promise ? qlik.Promise.resolve() : Promise.resolve();
      }

      var state = ensureInstanceState(containerEl, self);
      hidePopover(state);

      var props = (layout && layout.props) ? layout.props : {};
      var propMetric = props.defaultMetric === 'm1' ? 'm1' : 'm0';
      var propLayout = props.defaultLayout === 'circular' ? 'circular' : 'force';

      // Sync toolbar toggles when the Property Panel default changes
      if (state.lastPropMetric !== propMetric) {
        state.settings.activeMetric = propMetric;
        state.lastPropMetric = propMetric;
      }
      if (state.lastPropLayout !== propLayout) {
        state.settings.layout = propLayout;
        state.lastPropLayout = propLayout;
      }

      state.settings.hubSizeMode = props.hubSizeMode || 'total';
      state.settings.colorMode = props.colorMode || 'measureGradient';
      state.settings.singleColorHex = props.singleColorHex || '#1d4ed8';
      state.settings.showArrows = props.showArrows !== false;
      state.settings.minLabelSize = Number(props.minLabelSize) || 24;
      state.settings.forceRepulsion = Number(props.forceRepulsion) || 350;
      state.settings.maxEdges = Math.min(25000, Math.max(50, Number(props.maxEdges) || 2500));

      var hyperCube = layout ? layout.qHyperCube : null;

      // Smartly display Qlik's native Add-ons > Data Handling > Displayed message when Calculation Condition is not met
      if (hyperCube && hyperCube.qError) {
        var customCalcMsg = hyperCube.qCalcCondMsg ||
          (hyperCube.qCalcCondition && hyperCube.qCalcCondition.qMsg && hyperCube.qCalcCondition.qMsg.qv) ||
          'Calculation condition is not fulfilled. Please use filters or the slider to narrow down the dataset.';
        state.dom.emptyOverlayEl.style.display = 'flex';
        state.dom.emptyOverlayEl.innerHTML = [
          '<div class="kra-empty-card">',
          '  <h4>Data Handling</h4>',
          '  <p>' + escapeHtml(customCalcMsg) + '</p>',
          '</div>'
        ].join('');
        state.chart.clear();
        return qlik && qlik.Promise ? qlik.Promise.resolve() : Promise.resolve();
      }

      if (
        !hyperCube ||
        !Array.isArray(hyperCube.qDimensionInfo) ||
        hyperCube.qDimensionInfo.length < 2 ||
        !Array.isArray(hyperCube.qMeasureInfo) ||
        hyperCube.qMeasureInfo.length < 1
      ) {
        state.dom.emptyOverlayEl.style.display = 'flex';
        state.dom.emptyOverlayEl.innerHTML = [
          '<div class="kra-empty-card">',
          '  <h4>KRA Transaction Network</h4>',
          '  <p>Configure <strong>2 Dimensions</strong> (1: <em>Supplier</em>, 2: <em>Buyer</em>) and ',
          '  <strong>1–2 Master Measures</strong> (1: <em>Sum of Amount</em>, 2: <em>Count of Activities</em>).</p>',
          '</div>'
        ].join('');
        state.chart.clear();
        return qlik && qlik.Promise ? qlik.Promise.resolve() : Promise.resolve();
      }

      return DataProcessor.fetchAllPages(self.backendApi, hyperCube, state.settings.maxEdges)
        .then(function (allMatrixRows) {
          if (!allMatrixRows || allMatrixRows.length === 0) {
            state.dom.emptyOverlayEl.style.display = 'flex';
            state.dom.emptyOverlayEl.innerHTML = [
              '<div class="kra-empty-card">',
              '  <h4>No Transactions Found</h4>',
              '  <p>No Supplier &rarr; Buyer transaction routes match the current Qlik selection.</p>',
              '</div>'
            ].join('');
            state.chart.clear();
            return;
          }

          state.dom.emptyOverlayEl.style.display = 'none';
          state.model = DataProcessor.processHyperCube(allMatrixRows, hyperCube, state.settings);

          updateToolbarState(state);
          updateSearchDatalist(state);
          renderChartOption(state, true);
          state.chart.resize();
        });
    },

    /**
     * 6. Destroy Lifecycle Hook
     * Cleanly disposes ECharts instance when the extension object is removed.
     */
    destroy: function ($element) {
      var containerEl = unwrapElement($element);
      if (containerEl && containerEl.__kraHubState) {
        if (containerEl.__kraHubState.chart) {
          containerEl.__kraHubState.chart.dispose();
        }
        containerEl.__kraHubState = null;
      }
    }
  };
});
