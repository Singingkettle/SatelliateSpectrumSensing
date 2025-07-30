const CracoCesiumPlugin = require('craco-cesium')

module.exports = {
  plugins: [
    {
      plugin: CracoCesiumPlugin(),
    },
  ],
  // Add Babel plugins for on-demand importing of Ant Design components & icons
  babel: {
    plugins: [
      // Automatically import component CSS as well
      ['import', { libraryName: 'antd', libraryDirectory: 'es', style: true }],

    ],
  },
}
