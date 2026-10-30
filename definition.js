/**
 * @file definition.js
 * @description Qlik Sense Property Panel configuration for KRA Transaction Network (kra-hub-network).
 * Supports native Qlik Master Dimensions & Master Measures (qLibraryId) via standard
 * `uses: "dimensions"` and `uses: "measures"`, plus Appearance > Network Settings.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KRAHubNetworkDefinition = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return {
    type: 'items',
    component: 'accordion',
    items: {
      // 1. Dimensions: Supplier (Dim 0: Origin / Outbound) & Buyer (Dim 1: Destination / Inbound)
      dimensions: {
        uses: 'dimensions',
        min: 2,
        max: 2,
        description: function ( properties ) {
          return 'Dim 1: Supplier (Origin / Outbound) | Dim 2: Buyer (Destination / Inbound)';
        }
      },

      // 2. Measures: Master Measure 1 (Sum of Amount) & optional Master Measure 2 (Count of Activities)
      measures: {
        uses: 'measures',
        min: 1,
        max: 2,
        description: function ( properties ) {
          return 'Measure 1: Sum of Amount | Measure 2 (Optional): Count of Activities / Transactions';
        }
      },

      // 3. Sorting
      sorting: {
        uses: 'sorting'
      },

      // 4. Add-ons (Data Handling / Calculation Condition / Zero Values)
      addons: {
        uses: 'addons',
        items: {
          dataHandling: {
            uses: 'dataHandling'
          }
        }
      },

      // 5. Appearance > Network Settings
      appearance: {
        uses: 'settings',
        items: {
          networkSettings: {
            type: 'items',
            label: 'Network Settings',
            items: {
              // 1. Default Active Metric
              defaultMetric: {
                type: 'string',
                component: 'dropdown',
                label: 'Default Active Metric',
                ref: 'props.defaultMetric',
                defaultValue: 'm0',
                options: [
                  {
                    value: 'm0',
                    label: 'Measure 1 (Amount)'
                  },
                  {
                    value: 'm1',
                    label: 'Measure 2 (Activities)'
                  }
                ]
              },

              // 2. Hub Size Calculation
              hubSizeMode: {
                type: 'string',
                component: 'dropdown',
                label: 'Hub Size Calculation',
                ref: 'props.hubSizeMode',
                defaultValue: 'total',
                options: [
                  {
                    value: 'total',
                    label: 'Total (Inbound + Outbound)'
                  },
                  {
                    value: 'outbound',
                    label: 'Outbound Only (Supplier)'
                  },
                  {
                    value: 'inbound',
                    label: 'Inbound Only (Buyer)'
                  }
                ]
              },

              // 3. Node Coloring Mode
              colorMode: {
                type: 'string',
                component: 'dropdown',
                label: 'Node Coloring Mode',
                ref: 'props.colorMode',
                defaultValue: 'measureGradient',
                options: [
                  {
                    value: 'measureGradient',
                    label: 'Color by Active Measure Tiers'
                  },
                  {
                    value: 'palette',
                    label: 'ECharts Multi-Color Hub Palette'
                  },
                  {
                    value: 'singleColor',
                    label: 'Single Solid Color'
                  }
                ]
              },

              // 3b. Customizable Hex Picker for Single Theme Color
              singleColorHex: {
                type: 'string',
                label: 'Single Theme Color (Hex)',
                ref: 'props.singleColorHex',
                defaultValue: '#1d4ed8',
                expression: 'optional',
                show: function (data) {
                  return data && data.props && data.props.colorMode === 'singleColor';
                }
              },

              // 4. Default Layout
              defaultLayout: {
                type: 'string',
                component: 'dropdown',
                label: 'Default Layout',
                ref: 'props.defaultLayout',
                defaultValue: 'force',
                options: [
                  {
                    value: 'force',
                    label: 'Force (Hub Network)'
                  },
                  {
                    value: 'circular',
                    label: 'Circular (Ring)'
                  }
                ]
              },

              // 5. Show Directional Arrows
              showArrows: {
                type: 'boolean',
                component: 'switch',
                label: 'Show Directional Arrows',
                ref: 'props.showArrows',
                defaultValue: true,
                options: [
                  {
                    value: true,
                    label: 'Shown'
                  },
                  {
                    value: false,
                    label: 'Hidden'
                  }
                ]
              },

              // 6. Min Bubble Size to Show Permanent Label
              minLabelSize: {
                type: 'number',
                component: 'slider',
                label: 'Min Bubble Size to Show Permanent Label',
                ref: 'props.minLabelSize',
                min: 10,
                max: 60,
                step: 1,
                defaultValue: 24
              },

              // 7. Force Repulsion / Node Spacing
              forceRepulsion: {
                type: 'number',
                component: 'slider',
                label: 'Force Repulsion / Node Spacing',
                ref: 'props.forceRepulsion',
                min: 100,
                max: 1000,
                step: 25,
                defaultValue: 350
              },

              // 8. Max Edges Limit (Supports up to 25,000 rows via backendApi.getData pagination)
              maxEdges: {
                type: 'number',
                label: 'Max Edges Limit (Max 25,000)',
                ref: 'props.maxEdges',
                defaultValue: 2500,
                min: 50,
                max: 25000
              }
            }
          }
        }
      }
    }
  };
});
