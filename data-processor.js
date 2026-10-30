/**
 * @file data-processor.js
 * @description Data processing, Qlik HyperCube pagination, Master Measure formatting,
 * Hub aggregation, and Apache ECharts option builder for KRA Transaction Network.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KRAHubDataProcessor = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 4-Tier Quantile Palette for Option A (`measureGradient`)
   */
  var MEASURE_TIER_PALETTE = [
    { tier: 0, label: 'Low Tier (Q1)', color: '#38bdf8' },
    { tier: 1, label: 'Medium Tier (Q2)', color: '#6366f1' },
    { tier: 2, label: 'High Tier (Q3)', color: '#f59e0b' },
    { tier: 3, label: 'Top Hub (Q4)', color: '#e11d48' }
  ];

  /**
   * ECharts Multi-Color Hub Palette for Option C (`palette`)
   */
  var ECHARTS_HUB_PALETTE = [
    '#5470c6',
    '#91cc75',
    '#fac858',
    '#ee6666',
    '#73c0de',
    '#3ba272',
    '#fc8452',
    '#9a60b4',
    '#ea7ccc',
    '#2563eb',
    '#0d9488',
    '#d97706'
  ];

  /**
   * Escape HTML special characters for safe tooltip rendering.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) {
      return '';
    }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Extract Dimension and Master Measure metadata from Qlik `layout.qHyperCube`.
   * CRUCIAL: Always reads measure names dynamically from `qMeasureInfo[i].qFallbackTitle`
   * (never relying on `qDef.qLabel`, which is blank for Master Measures).
   *
   * @param {Object} hyperCube - layout.qHyperCube
   * @param {Array<Array<Object>>} [sampleMatrix] - optional matrix rows to infer prefix/decimals from qText
   * @returns {Object} Metadata object for dimensions and measures
   */
  function extractMetadata(hyperCube, sampleMatrix) {
    var dimInfo = (hyperCube && Array.isArray(hyperCube.qDimensionInfo)) ? hyperCube.qDimensionInfo : [];
    var measInfo = (hyperCube && Array.isArray(hyperCube.qMeasureInfo)) ? hyperCube.qMeasureInfo : [];

    var supplierDimTitle = (dimInfo[0] && dimInfo[0].qFallbackTitle) ? dimInfo[0].qFallbackTitle : 'Supplier';
    var buyerDimTitle = (dimInfo[1] && dimInfo[1].qFallbackTitle) ? dimInfo[1].qFallbackTitle : 'Buyer';

    var m0Info = measInfo[0] || {};
    var m1Info = measInfo[1] || null;

    var m0Title = m0Info.qFallbackTitle || 'Sum of Amount';
    var m1Title = (m1Info && m1Info.qFallbackTitle) ? m1Info.qFallbackTitle : 'Count of Activities';

    var m0Format = parseNumFormat(m0Info.qNumFormat, sampleMatrix, 2, false);
    var m1Format = parseNumFormat(m1Info ? m1Info.qNumFormat : null, sampleMatrix, 3, true);

    return {
      supplierDimTitle: supplierDimTitle,
      buyerDimTitle: buyerDimTitle,
      hasSecondMeasure: Boolean(m1Info),
      measures: [
        {
          index: 0,
          key: 'm0',
          title: m0Title,
          qNumFormat: m0Info.qNumFormat || null,
          formatSpec: m0Format
        },
        {
          index: 1,
          key: 'm1',
          title: m1Title,
          qNumFormat: m1Info ? (m1Info.qNumFormat || null) : null,
          formatSpec: m1Format
        }
      ]
    };
  }

  /**
   * Parse Qlik `qNumFormat` and optional sample cell `qText` so aggregated Hub totals
   * match Qlik's native Master Measure number formatting.
   *
   * @param {Object} qNumFormat
   * @param {Array<Array<Object>>} sampleMatrix
   * @param {number} colIndex
   * @param {boolean} isIntegerDefault
   * @returns {Object}
   */
  function parseNumFormat(qNumFormat, sampleMatrix, colIndex, isIntegerDefault) {
    var spec = {
      prefix: '',
      suffix: '',
      decimals: isIntegerDefault ? 0 : 2,
      thousandSep: ',',
      decSep: '.',
      isInteger: Boolean(isIntegerDefault)
    };

    if (qNumFormat) {
      if (qNumFormat.qThou) {
        spec.thousandSep = qNumFormat.qThou;
      }
      if (qNumFormat.qDec) {
        spec.decSep = qNumFormat.qDec;
      }
      if (qNumFormat.qType === 'I') {
        spec.decimals = 0;
        spec.isInteger = true;
      }
      if (typeof qNumFormat.qFmt === 'string' && qNumFormat.qFmt.trim() !== '' && qNumFormat.qFmt !== 'AUTO') {
        var fmt = qNumFormat.qFmt;
        var prefixMatch = fmt.match(/^([^0#.,+-]+)/);
        if (prefixMatch) {
          spec.prefix = prefixMatch[1];
        }
        var suffixMatch = fmt.match(/([^0#.,+-]+)$/);
        if (suffixMatch && (!prefixMatch || suffixMatch[1] !== prefixMatch[1])) {
          spec.suffix = suffixMatch[1];
        }
        var decMatch = fmt.match(/\.([0#]+)/);
        if (decMatch) {
          spec.decimals = decMatch[1].length;
          spec.isInteger = false;
        } else if (fmt.indexOf('#') !== -1 || fmt.indexOf('0') !== -1) {
          spec.decimals = 0;
          spec.isInteger = true;
        }
      }
    }

    // Inspect sample cell qText if format was AUTO or unspecified
    if (Array.isArray(sampleMatrix) && sampleMatrix.length > 0) {
      for (var i = 0; i < Math.min(sampleMatrix.length, 10); i++) {
        var row = sampleMatrix[i];
        var cell = row && row[colIndex];
        if (cell && typeof cell.qText === 'string' && cell.qText.trim() !== '' && cell.qText !== '-') {
          var txt = cell.qText.trim();
          if (!spec.prefix) {
            var pMatch = txt.match(/^([^\d+-]+)/);
            if (pMatch) {
              spec.prefix = pMatch[1];
            }
          }
          var dMatch = txt.match(/\.(\d+)/);
          if (dMatch) {
            spec.decimals = dMatch[1].length;
            spec.isInteger = false;
          } else if (!qNumFormat || !qNumFormat.qFmt) {
            spec.decimals = 0;
            spec.isInteger = true;
          }
          break;
        }
      }
    }

    return spec;
  }

  /**
   * Format a numeric value using the extracted Master Measure format specification.
   *
   * @param {number} value
   * @param {Object} measureMeta
   * @returns {string}
   */
  function formatMeasureValue(value, measureMeta) {
    if (value === null || value === undefined || isNaN(value)) {
      return '-';
    }
    var num = Number(value);
    var spec = (measureMeta && measureMeta.formatSpec) ? measureMeta.formatSpec : {
      prefix: '',
      suffix: '',
      decimals: 0,
      thousandSep: ',',
      decSep: '.'
    };

    var decimals = (spec.isInteger && Math.floor(num) === num) ? 0 : spec.decimals;
    var fixed = Math.abs(num).toFixed(decimals);
    var parts = fixed.split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, spec.thousandSep || ',');
    var decPart = parts.length > 1 ? (spec.decSep || '.') + parts[1] : '';
    var sign = num < 0 ? '-' : '';

    return sign + (spec.prefix || '') + intPart + decPart + (spec.suffix || '');
  }

  /**
   * Fetch all HyperCube rows via `backendApi.getData()` pagination up to `maxEdges` (default 2500).
   * Initial data fetch is configured at `qWidth: 4, qHeight: 2500` (10,000 cells).
   *
   * @param {Object} backendApi - Qlik extension `this.backendApi`
   * @param {Object} hyperCube - `layout.qHyperCube`
   * @param {number} [maxEdges=2500] - Configurable maximum edges to fetch
   * @returns {Promise<Array<Array<Object>>>} Promise resolving to matrix rows
   */
  function fetchAllPages(backendApi, hyperCube, maxEdges) {
    var limit = Math.max(1, Number(maxEdges) || 2500);
    if (!hyperCube) {
      return Promise.resolve([]);
    }

    var collected = [];
    if (Array.isArray(hyperCube.qDataPages)) {
      for (var p = 0; p < hyperCube.qDataPages.length; p++) {
        var page = hyperCube.qDataPages[p];
        if (page && Array.isArray(page.qMatrix)) {
          for (var r = 0; r < page.qMatrix.length && collected.length < limit; r++) {
            collected.push(page.qMatrix[r]);
          }
        }
      }
    }

    var totalAvailable = (hyperCube.qSize && typeof hyperCube.qSize.qcy === 'number')
      ? Math.min(hyperCube.qSize.qcy, limit)
      : collected.length;

    if (collected.length >= totalAvailable || !backendApi || typeof backendApi.getData !== 'function') {
      return Promise.resolve(collected.slice(0, limit));
    }

    var dimCount = Array.isArray(hyperCube.qDimensionInfo) ? hyperCube.qDimensionInfo.length : 2;
    var measCount = Array.isArray(hyperCube.qMeasureInfo) ? hyperCube.qMeasureInfo.length : 2;
    var qWidth = Math.max(1, Math.min(4, dimCount + measCount));
    var maxRowsPerPage = Math.max(1, Math.floor(10000 / qWidth));

    function fetchNextPage() {
      if (collected.length >= totalAvailable) {
        return Promise.resolve(collected.slice(0, limit));
      }

      var qTop = collected.length;
      var qHeight = Math.min(maxRowsPerPage, totalAvailable - qTop);
      var requestPage = [{
        qTop: qTop,
        qLeft: 0,
        qWidth: qWidth,
        qHeight: qHeight
      }];

      return Promise.resolve(backendApi.getData(requestPage)).then(function (dataPages) {
        var pages = Array.isArray(dataPages) ? dataPages : [];
        var rowsAdded = 0;

        for (var i = 0; i < pages.length; i++) {
          var matrix = pages[i] && pages[i].qMatrix;
          if (Array.isArray(matrix) && matrix.length > 0) {
            for (var j = 0; j < matrix.length && collected.length < limit; j++) {
              collected.push(matrix[j]);
              rowsAdded++;
            }
          }
        }

        if (rowsAdded === 0) {
          return collected.slice(0, limit);
        }
        return fetchNextPage();
      });
    }

    return fetchNextPage();
  }

  /**
   * Smoothly scale a metric value to a symbolSize in [14, 75] using square-root/logarithmic normalization.
   *
   * @param {number} val
   * @param {number} minVal
   * @param {number} maxVal
   * @param {number} [minSize=14]
   * @param {number} [maxSize=75]
   * @returns {number}
   */
  function scaleSymbolSize(val, minVal, maxVal, minSize, maxSize) {
    var lo = typeof minSize === 'number' ? minSize : 14;
    var hi = typeof maxSize === 'number' ? maxSize : 75;
    var v = Math.max(0, Number(val) || 0);
    var minV = Math.max(0, Number(minVal) || 0);
    var maxV = Math.max(0, Number(maxVal) || 0);

    if (maxV <= minV) {
      return Math.round((lo + hi) / 2);
    }

    var clamped = Math.max(minV, Math.min(maxV, v));
    // Blend square-root and logarithmic normalization for smooth hub sizing across wide KRA transaction ranges
    var sqrtNorm = (Math.sqrt(clamped) - Math.sqrt(minV)) / (Math.sqrt(maxV) - Math.sqrt(minV));
    var logNorm = (Math.log1p(clamped) - Math.log1p(minV)) / (Math.log1p(maxV) - Math.log1p(minV));
    var ratio = (maxV / Math.max(1, minV) > 100) ? (0.5 * sqrtNorm + 0.5 * logNorm) : sqrtNorm;

    var size = lo + ratio * (hi - lo);
    return Math.round(Math.max(lo, Math.min(hi, size)) * 10) / 10;
  }

  /**
   * Smoothly scale an edge metric value to lineStyle.width in [1, 8].
   *
   * @param {number} val
   * @param {number} minVal
   * @param {number} maxVal
   * @param {number} [minWidth=1]
   * @param {number} [maxWidth=8]
   * @returns {number}
   */
  function scaleEdgeWidth(val, minVal, maxVal, minWidth, maxWidth) {
    var lo = typeof minWidth === 'number' ? minWidth : 1;
    var hi = typeof maxWidth === 'number' ? maxWidth : 8;
    var v = Math.max(0, Number(val) || 0);
    var minV = Math.max(0, Number(minVal) || 0);
    var maxV = Math.max(0, Number(maxVal) || 0);

    if (maxV <= minV) {
      return 2.5;
    }

    var clamped = Math.max(minV, Math.min(maxV, v));
    var norm = (Math.sqrt(clamped) - Math.sqrt(minV)) / (Math.sqrt(maxV) - Math.sqrt(minV));
    var width = lo + norm * (hi - lo);
    return Math.round(Math.max(lo, Math.min(hi, width)) * 100) / 100;
  }

  /**
   * Compute the active metric value for a Hub node given `activeMetric` ('m0' | 'm1')
   * and `hubSizeMode` ('total' | 'outbound' | 'inbound').
   *
   * @param {Object} node
   * @param {string} activeMetric - 'm0' or 'm1'
   * @param {string} hubSizeMode - 'total', 'outbound', or 'inbound'
   * @returns {number}
   */
  function getNodeActiveValue(node, activeMetric, hubSizeMode) {
    var metric = activeMetric === 'm1' ? 'm1' : 'm0';
    var mode = hubSizeMode || 'total';
    if (mode === 'outbound') {
      return metric === 'm1' ? node.outbound_m1 : node.outbound_m0;
    }
    if (mode === 'inbound') {
      return metric === 'm1' ? node.inbound_m1 : node.inbound_m0;
    }
    return metric === 'm1' ? node.total_m1 : node.total_m0;
  }

  /**
   * Compute quantile thresholds (25%, 50%, 75%) for 4-tier node coloring.
   *
   * @param {Array<number>} sortedValues
   * @returns {Array<number>} [q25, q50, q75]
   */
  function computeQuantiles(sortedValues) {
    if (!sortedValues || sortedValues.length === 0) {
      return [0, 0, 0];
    }
    function percentile(p) {
      var idx = (sortedValues.length - 1) * p;
      var lower = Math.floor(idx);
      var upper = Math.ceil(idx);
      if (lower === upper) {
        return sortedValues[lower];
      }
      return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (idx - lower);
    }
    return [percentile(0.25), percentile(0.50), percentile(0.75)];
  }

  /**
   * Process Qlik HyperCube matrix rows into unique Hub Nodes and directional Edges.
   *
   * Each Unique Node (Hub) merges entities appearing in `Supplier` (row[0]) and/or `Buyer` (row[1])
   * with `id = qText` and computes:
   * - `outbound_m0`, `inbound_m0`, `total_m0 = outbound_m0 + inbound_m0`
   * - `outbound_m1`, `inbound_m1`, `total_m1 = outbound_m1 + inbound_m1`
   * - `degree` = total unique connected routes (in + out)
   * - `suppliersCount` (# of unique connected Suppliers) & `buyersCount` (# of unique connected Buyers)
   *
   * @param {Array<Array<Object>>} matrixRows - HyperCube rows
   * @param {Object} hyperCube - layout.qHyperCube
   * @param {Object} [settings] - Visual & metric settings
   * @returns {Object} Processed graph model (nodes, edges, metadata, quantiles)
   */
  function processHyperCube(matrixRows, hyperCube, settings) {
    var rows = Array.isArray(matrixRows) ? matrixRows : [];
    var opts = Object.assign({
      activeMetric: 'm0',
      hubSizeMode: 'total',
      colorMode: 'measureGradient',
      singleColorHex: '#1d4ed8',
      minLabelSize: 24,
      maxEdges: 2500
    }, settings || {});

    var metadata = extractMetadata(hyperCube, rows);
    var maxEdges = Math.max(1, Number(opts.maxEdges) || 2500);

    var nodesMap = new Map();
    var edges = [];

    function getOrCreateNode(id) {
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id: id,
          name: id,
          outbound_m0: 0,
          inbound_m0: 0,
          total_m0: 0,
          outbound_m1: 0,
          inbound_m1: 0,
          total_m1: 0,
          degree: 0,
          inboundRoutes: 0,
          outboundRoutes: 0,
          suppliersSet: new Set(),
          buyersSet: new Set(),
          neighborsSet: new Set(),
          supplierElemNumbers: [],
          buyerElemNumbers: []
        });
      }
      return nodesMap.get(id);
    }

    var edgeCount = 0;
    for (var i = 0; i < rows.length && edgeCount < maxEdges; i++) {
      var row = rows[i];
      if (!Array.isArray(row) || row.length < 3) {
        continue;
      }

      var supplierCell = row[0];
      var buyerCell = row[1];
      var m0Cell = row[2];
      var m1Cell = row.length > 3 ? row[3] : null;

      if (!supplierCell || !buyerCell) {
        continue;
      }

      var supplierId = (supplierCell.qText !== undefined && supplierCell.qText !== null)
        ? String(supplierCell.qText).trim()
        : '';
      var buyerId = (buyerCell.qText !== undefined && buyerCell.qText !== null)
        ? String(buyerCell.qText).trim()
        : '';

      if (!supplierId || !buyerId || supplierCell.qIsNull || buyerCell.qIsNull) {
        continue;
      }

      var m0Val = (m0Cell && typeof m0Cell.qNum === 'number' && !isNaN(m0Cell.qNum))
        ? m0Cell.qNum
        : (m0Cell && m0Cell.qText ? parseFloat(String(m0Cell.qText).replace(/[^0-9.-]/g, '')) || 0 : 0);

      var m1Val = 1;
      if (m1Cell) {
        if (typeof m1Cell.qNum === 'number' && !isNaN(m1Cell.qNum)) {
          m1Val = m1Cell.qNum;
        } else if (m1Cell.qText) {
          m1Val = parseFloat(String(m1Cell.qText).replace(/[^0-9.-]/g, '')) || 0;
        }
      }

      // Preserve Qlik's exact Master Measure formatting from cell.qText
      var m0Text = (m0Cell && typeof m0Cell.qText === 'string' && m0Cell.qText.trim() !== '')
        ? m0Cell.qText
        : formatMeasureValue(m0Val, metadata.measures[0]);

      var m1Text = (m1Cell && typeof m1Cell.qText === 'string' && m1Cell.qText.trim() !== '')
        ? m1Cell.qText
        : formatMeasureValue(m1Val, metadata.measures[1]);

      var sourceNode = getOrCreateNode(supplierId);
      var targetNode = getOrCreateNode(buyerId);

      // Track Qlik element numbers for interactive selection filtering
      if (typeof supplierCell.qElemNumber === 'number' && supplierCell.qElemNumber >= 0) {
        if (sourceNode.supplierElemNumbers.indexOf(supplierCell.qElemNumber) === -1) {
          sourceNode.supplierElemNumbers.push(supplierCell.qElemNumber);
        }
      }
      if (typeof buyerCell.qElemNumber === 'number' && buyerCell.qElemNumber >= 0) {
        if (targetNode.buyerElemNumbers.indexOf(buyerCell.qElemNumber) === -1) {
          targetNode.buyerElemNumbers.push(buyerCell.qElemNumber);
        }
      }

      // Aggregate outbound (Supplier) and inbound (Buyer) measures
      sourceNode.outbound_m0 += m0Val;
      sourceNode.total_m0 = sourceNode.outbound_m0 + sourceNode.inbound_m0;
      sourceNode.outbound_m1 += m1Val;
      sourceNode.total_m1 = sourceNode.outbound_m1 + sourceNode.inbound_m1;
      sourceNode.outboundRoutes += 1;
      sourceNode.degree += 1;
      sourceNode.buyersSet.add(buyerId);
      sourceNode.neighborsSet.add(buyerId);

      targetNode.inbound_m0 += m0Val;
      targetNode.total_m0 = targetNode.outbound_m0 + targetNode.inbound_m0;
      targetNode.inbound_m1 += m1Val;
      targetNode.total_m1 = targetNode.outbound_m1 + targetNode.inbound_m1;
      targetNode.inboundRoutes += 1;
      targetNode.degree += 1;
      targetNode.suppliersSet.add(supplierId);
      targetNode.neighborsSet.add(supplierId);

      edges.push({
        id: 'edge_' + edgeCount + '_' + supplierId + '->' + buyerId,
        source: supplierId,
        target: buyerId,
        m0: m0Val,
        m1: m1Val,
        m0Text: m0Text,
        m1Text: m1Text,
        supplierElemNumber: supplierCell.qElemNumber,
        buyerElemNumber: buyerCell.qElemNumber
      });

      edgeCount++;
    }

    var nodes = [];
    nodesMap.forEach(function (node) {
      nodes.push({
        id: node.id,
        name: node.name,
        outbound_m0: node.outbound_m0,
        inbound_m0: node.inbound_m0,
        total_m0: node.total_m0,
        outbound_m1: node.outbound_m1,
        inbound_m1: node.inbound_m1,
        total_m1: node.total_m1,
        outbound_m0_text: formatMeasureValue(node.outbound_m0, metadata.measures[0]),
        inbound_m0_text: formatMeasureValue(node.inbound_m0, metadata.measures[0]),
        total_m0_text: formatMeasureValue(node.total_m0, metadata.measures[0]),
        outbound_m1_text: formatMeasureValue(node.outbound_m1, metadata.measures[1]),
        inbound_m1_text: formatMeasureValue(node.inbound_m1, metadata.measures[1]),
        total_m1_text: formatMeasureValue(node.total_m1, metadata.measures[1]),
        degree: node.degree,
        inboundRoutes: node.inboundRoutes,
        outboundRoutes: node.outboundRoutes,
        suppliersCount: node.suppliersSet.size,
        buyersCount: node.buyersSet.size,
        neighbors: Array.from(node.neighborsSet),
        supplierElemNumbers: node.supplierElemNumbers,
        buyerElemNumbers: node.buyerElemNumbers
      });
    });

    var model = {
      nodes: nodes,
      edges: edges,
      metadata: metadata,
      quantiles: [0, 0, 0]
    };

    applyVisualEncodings(model, opts);
    return model;
  }

  /**
   * Apply or update active metric visual encodings (Node `symbolSize`, Edge `lineStyle.width`,
   * and Node coloring) on an existing processed graph model without re-parsing HyperCube rows.
   *
   * @param {Object} model - Output of `processHyperCube`
   * @param {Object} settings - Visual & metric settings
   * @returns {Object} Updated model
   */
  function applyVisualEncodings(model, settings) {
    var opts = Object.assign({
      activeMetric: 'm0',
      hubSizeMode: 'total',
      colorMode: 'measureGradient',
      singleColorHex: '#1d4ed8',
      minLabelSize: 24
    }, settings || {});

    var activeMetric = opts.activeMetric === 'm1' ? 'm1' : 'm0';
    var hubSizeMode = opts.hubSizeMode || 'total';
    var colorMode = opts.colorMode || 'measureGradient';
    var singleColorHex = (opts.singleColorHex && String(opts.singleColorHex).trim()) || '#1d4ed8';
    var minLabelSize = Number(opts.minLabelSize) || 24;

    var nodes = model.nodes || [];
    var edges = model.edges || [];

    // 1. Compute Node active values & min/max for symbolSize [14, 75]
    var nodeVals = [];
    var minNodeVal = Infinity;
    var maxNodeVal = -Infinity;

    for (var i = 0; i < nodes.length; i++) {
      var val = getNodeActiveValue(nodes[i], activeMetric, hubSizeMode);
      nodes[i].activeValue = val;
      nodeVals.push(val);
      if (val < minNodeVal) minNodeVal = val;
      if (val > maxNodeVal) maxNodeVal = val;
    }

    if (nodes.length === 0) {
      minNodeVal = 0;
      maxNodeVal = 0;
    }

    var sortedVals = nodeVals.slice().sort(function (a, b) { return a - b; });
    var quantiles = computeQuantiles(sortedVals);
    model.quantiles = quantiles;

    // Sort hubs by activeValue descending so palette mode assigns distinct colors consistently
    var rankOrder = nodes.slice().sort(function (a, b) {
      return b.activeValue - a.activeValue || b.degree - a.degree;
    });
    var rankMap = new Map();
    for (var r = 0; r < rankOrder.length; r++) {
      rankMap.set(rankOrder[r].id, r);
    }

    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      var sSize = scaleSymbolSize(node.activeValue, minNodeVal, maxNodeVal, 14, 75);
      node.symbolSize = sSize;
      node.value = node.activeValue;

      // Determine node color based on colorMode
      var nodeColor = singleColorHex;
      var tierIndex = 0;
      if (node.activeValue > quantiles[2]) {
        tierIndex = 3;
      } else if (node.activeValue > quantiles[1]) {
        tierIndex = 2;
      } else if (node.activeValue > quantiles[0]) {
        tierIndex = 1;
      }
      node.tierIndex = tierIndex;
      node.tierLabel = MEASURE_TIER_PALETTE[tierIndex].label;

      if (colorMode === 'measureGradient') {
        nodeColor = MEASURE_TIER_PALETTE[tierIndex].color;
      } else if (colorMode === 'palette') {
        var rankIdx = rankMap.get(node.id) || 0;
        nodeColor = ECHARTS_HUB_PALETTE[rankIdx % ECHARTS_HUB_PALETTE.length];
      } else if (colorMode === 'singleColor') {
        nodeColor = singleColorHex;
      }

      node.itemStyle = {
        color: nodeColor,
        borderColor: '#ffffff',
        borderWidth: sSize >= 36 ? 2.5 : 1.5,
        shadowBlur: sSize >= 36 ? 12 : 5,
        shadowColor: 'rgba(15, 23, 42, 0.22)'
      };

      node.label = {
        show: sSize >= minLabelSize,
        position: 'right',
        formatter: '{b}',
        fontSize: sSize >= 42 ? 12 : 11,
        fontWeight: sSize >= 42 ? 600 : 500,
        color: '#0f172a',
        backgroundColor: 'rgba(255, 255, 255, 0.82)',
        padding: [2, 5],
        borderRadius: 3
      };
    }

    // 2. Compute Edge active values & min/max for lineStyle.width [1, 8]
    var minEdgeVal = Infinity;
    var maxEdgeVal = -Infinity;
    for (var e = 0; e < edges.length; e++) {
      var eVal = activeMetric === 'm1' ? edges[e].m1 : edges[e].m0;
      edges[e].activeValue = eVal;
      if (eVal < minEdgeVal) minEdgeVal = eVal;
      if (eVal > maxEdgeVal) maxEdgeVal = eVal;
    }

    if (edges.length === 0) {
      minEdgeVal = 0;
      maxEdgeVal = 0;
    }

    for (var k = 0; k < edges.length; k++) {
      var edge = edges[k];
      var width = scaleEdgeWidth(edge.activeValue, minEdgeVal, maxEdgeVal, 1, 8);
      edge.value = edge.activeValue;
      edge.lineStyle = {
        width: width,
        curveness: 0.3,
        color: 'source',
        opacity: 0.65
      };
    }

    return model;
  }

  /**
   * Build the HTML tooltip for Hub (Node) hover and Route (Edge) hover using Master Measure titles.
   *
   * @param {Object} params - ECharts tooltip formatter params
   * @param {Object} metadata - Extracted HyperCube metadata
   * @returns {string} HTML string
   */
  function formatTooltip(params, metadata) {
    var m0Title = (metadata && metadata.measures && metadata.measures[0])
      ? metadata.measures[0].title
      : 'Sum of Amount';
    var m1Title = (metadata && metadata.measures && metadata.measures[1])
      ? metadata.measures[1].title
      : 'Count of Activities';

    if (params && params.dataType === 'edge' && params.data) {
      var edge = params.data;
      return [
        '<div class="kra-tooltip kra-tooltip-edge">',
        '  <div class="kra-tooltip-title">',
        '    <span class="kra-tooltip-badge kra-badge-route">ROUTE</span> ',
        escapeHtml(edge.source) + ' &rarr; ' + escapeHtml(edge.target),
        '  </div>',
        '  <div class="kra-tooltip-divider"></div>',
        '  <div class="kra-tooltip-row">',
        '    <span class="kra-tooltip-label">' + escapeHtml(m0Title) + ':</span>',
        '    <span class="kra-tooltip-value">' + escapeHtml(edge.m0Text) + '</span>',
        '  </div>',
        '  <div class="kra-tooltip-row">',
        '    <span class="kra-tooltip-label">' + escapeHtml(m1Title) + ':</span>',
        '    <span class="kra-tooltip-value">' + escapeHtml(edge.m1Text) + '</span>',
        '  </div>',
        '</div>'
      ].join('');
    }

    if (params && (params.dataType === 'node' || params.data) && params.data) {
      var node = params.data;
      return [
        '<div class="kra-tooltip kra-tooltip-node">',
        '  <div class="kra-tooltip-title">',
        '    <span class="kra-tooltip-dot" style="background:' + escapeHtml(node.itemStyle && node.itemStyle.color ? node.itemStyle.color : '#2563eb') + '"></span>',
        '    <span>' + escapeHtml(node.name) + '</span>',
        '  </div>',
        '  <div class="kra-tooltip-divider"></div>',
        '  <div class="kra-tooltip-section">',
        '    <div class="kra-tooltip-row kra-tooltip-row-main">',
        '      <span class="kra-tooltip-label">' + escapeHtml(m0Title) + ' (Total):</span>',
        '      <span class="kra-tooltip-value">' + escapeHtml(node.total_m0_text) + '</span>',
        '    </div>',
        '    <div class="kra-tooltip-subrow">',
        '      Outbound (Supplier): <strong>' + escapeHtml(node.outbound_m0_text) + '</strong> &nbsp;|&nbsp; ',
        '      Inbound (Buyer): <strong>' + escapeHtml(node.inbound_m0_text) + '</strong>',
        '    </div>',
        '  </div>',
        '  <div class="kra-tooltip-section">',
        '    <div class="kra-tooltip-row kra-tooltip-row-main">',
        '      <span class="kra-tooltip-label">' + escapeHtml(m1Title) + ' (Total):</span>',
        '      <span class="kra-tooltip-value">' + escapeHtml(node.total_m1_text) + '</span>',
        '    </div>',
        '    <div class="kra-tooltip-subrow">',
        '      Outbound (Supplier): <strong>' + escapeHtml(node.outbound_m1_text) + '</strong> &nbsp;|&nbsp; ',
        '      Inbound (Buyer): <strong>' + escapeHtml(node.inbound_m1_text) + '</strong>',
        '    </div>',
        '  </div>',
        '  <div class="kra-tooltip-divider"></div>',
        '  <div class="kra-tooltip-row kra-tooltip-counterparties">',
        '    <span class="kra-tooltip-label">Connected Counterparties:</span>',
        '    <span class="kra-tooltip-value">' + escapeHtml(String(node.suppliersCount)) + ' Suppliers &nbsp;|&nbsp; ' + escapeHtml(String(node.buyersCount)) + ' Buyers</span>',
        '  </div>',
        '</div>'
      ].join('');
    }

    return '';
  }

  /**
   * Build the complete Apache ECharts configuration object modeled after the ECharts Hub Network:
   * - `series[0].type = 'graph'`
   * - `layout = 'force' | 'circular'`
   * - `roam = true`
   * - `edgeSymbol = ['none', 'arrow']` and `edgeSymbolSize = [4, 8]`
   * - `lineStyle = { curveness: 0.3, color: 'source', opacity: 0.65 }`
   * - `emphasis = { focus: 'adjacency', lineStyle: { width: 6, opacity: 1 } }`
   *
   * @param {Object} model - Processed graph model from `processHyperCube`
   * @param {Object} [settings] - Layout and visual configuration
   * @returns {Object} ECharts option object
   */
  function buildEChartsOption(model, settings) {
    var opts = Object.assign({
      layout: 'force',
      showArrows: true,
      forceRepulsion: 350,
      minLabelSize: 24,
      colorMode: 'measureGradient'
    }, settings || {});

    var layoutMode = opts.layout === 'circular' ? 'circular' : 'force';
    var showArrows = opts.showArrows !== false;
    var repulsion = Math.max(100, Math.min(1000, Number(opts.forceRepulsion) || 350));

    return {
      backgroundColor: 'transparent',
      color: ECHARTS_HUB_PALETTE,
      tooltip: {
        trigger: 'item',
        enterable: false,
        confine: true,
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        borderColor: 'rgba(148, 163, 184, 0.25)',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: '#f8fafc',
          fontSize: 12,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        },
        formatter: function (params) {
          return formatTooltip(params, model.metadata);
        }
      },
      animationDurationUpdate: 500,
      animationEasingUpdate: 'quinticInOut',
      series: [
        {
          id: 'kra-hub-graph',
          name: 'KRA Transaction Network',
          type: 'graph',
          layout: layoutMode,
          data: model.nodes,
          links: model.edges,
          roam: true,
          draggable: true,
          edgeSymbol: showArrows ? ['none', 'arrow'] : ['none', 'none'],
          edgeSymbolSize: [4, 8],
          circular: {
            rotateLabel: true
          },
          force: {
            repulsion: repulsion,
            edgeLength: [65, 185],
            gravity: 0.08,
            friction: 0.6,
            layoutAnimation: true
          },
          label: {
            show: true,
            position: 'right',
            formatter: '{b}'
          },
          labelLayout: {
            hideOverlap: true
          },
          scaleLimit: {
            min: 0.2,
            max: 6
          },
          lineStyle: {
            color: 'source',
            curveness: 0.3,
            opacity: 0.65
          },
          emphasis: {
            focus: 'adjacency',
            label: {
              show: true,
              fontWeight: 700,
              fontSize: 13
            },
            lineStyle: {
              width: 6,
              opacity: 1
            }
          }
        }
      ]
    };
  }

  return {
    MEASURE_TIER_PALETTE: MEASURE_TIER_PALETTE,
    ECHARTS_HUB_PALETTE: ECHARTS_HUB_PALETTE,
    extractMetadata: extractMetadata,
    formatMeasureValue: formatMeasureValue,
    fetchAllPages: fetchAllPages,
    scaleSymbolSize: scaleSymbolSize,
    scaleEdgeWidth: scaleEdgeWidth,
    getNodeActiveValue: getNodeActiveValue,
    processHyperCube: processHyperCube,
    applyVisualEncodings: applyVisualEncodings,
    formatTooltip: formatTooltip,
    buildEChartsOption: buildEChartsOption
  };
});
