const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const PAGES = ['RelationshipExplorer', 'ConfigurationPage', 'HealthPage'];

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: PAGES.reduce((entries, page) => {
      entries[page] = path.resolve(__dirname, 'src/main/webapp/pages', page, 'index.jsx');
      return entries;
    }, {}),
    output: {
      path: path.resolve(__dirname, 'appserver/static/build/pages'),
      filename: '[name]/App.js',
      // Splunk Web serves this bundle from /static/app/graphlens/build/... ;
      // publicPath is left relative so the same build works whether Splunk
      // mounts the app under / or under a custom MRSPARKLE_ROOT_PATH.
      publicPath: 'auto',
      clean: true,
    },
    devtool: isProduction ? false : 'cheap-module-source-map',
    resolve: {
      extensions: ['.js', '.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: 'babel-loader',
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: '[name]/App.css' }),
    ],
    optimization: {
      minimize: isProduction,
      // No code-splitting/runtime chunk: Splunk Web loads each page's
      // bundle directly by <script src>, so every page bundle must be
      // fully self-contained (no shared runtime file to also wire up in
      // the Mako templates).
      splitChunks: false,
      runtimeChunk: false,
    },
    performance: {
      hints: false,
    },
  };
};
