import path from 'path';
import { Configuration, ProvidePlugin } from 'webpack';

const config: Configuration = {
  mode: 'production',
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.webpack.json'
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  output: {
    filename: 'eos-transit-algosigner-provider.min.js',
    path: path.resolve(__dirname, 'umd'),
    libraryTarget: 'umd',
    library: ['WAL', 'providers', 'algosigner'],
    libraryExport: 'default'
  },
  plugins: [
    new ProvidePlugin({
      'window.WAL': ['eos-transit', 'default']
    })
  ],
  externals: {
    'eos-transit': 'WAL'
  },
  stats: {
    colors: true
  }
};

export default config;
