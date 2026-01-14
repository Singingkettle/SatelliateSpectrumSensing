const CracoCesiumPlugin = require('craco-cesium')

module.exports = {
  plugins: [
    {
      plugin: CracoCesiumPlugin(),
    },
  ],
  // Note: babel-plugin-import is not needed for antd v5+
  // antd v5 uses CSS-in-JS, so no separate CSS import is required
}
