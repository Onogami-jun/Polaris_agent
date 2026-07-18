const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';
  return {
    entry: './src/index.tsx',
    target: 'web',
    output: { path: path.resolve(__dirname, '..', 'build'), filename: 'bundle.[contenthash:8].js', clean: true, publicPath: isDev ? '/' : './' },
    resolve: { extensions: ['.ts', '.tsx', '.js', '.jsx'] },
    module: {
      rules: [
        { test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ },
        { test: /\.css$/, use: ['style-loader', 'css-loader'] },
        { test: /\.(png|svg|jpg|jpeg|gif)$/, type: 'asset/resource' },
      ],
    },
    plugins: [new HtmlWebpackPlugin({ template: './public/index.html', title: 'Polaris' })],
    devServer: { port: 3000, hot: true, historyApiFallback: true },
    devtool: isDev ? 'eval-source-map' : false,
  };
};
