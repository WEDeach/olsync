import * as path from "path";
import { Configuration,DefinePlugin } from "webpack";
const nodeExternals=require('webpack-node-externals');

const rootPath=path.resolve(__dirname,"..");

const config: Configuration={
    mode: process.env.NODE_ENV==='production'? 'production':'development',
    resolve: {
        extensions: ['.ts','.tsx','.js','.jsx','.html','.scss','.svg'],
    },
    entry: path.resolve(rootPath,"src/entrypoint/js","preload.ts"),
    target: 'electron-preload',
    externals: [
        nodeExternals({
            // Anyting related to webpack, we want to keep in the bundle
            allowlist: [
                /webpack(\/.*)?/,
                'electron-devtools-installer',
            ],
        }),
    ],
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
            }
        ],
    },
    node: {
        __dirname: false,
    },
    output: {
        path: path.resolve(rootPath,"dist","js"),
        filename: "preload.b.js",
        libraryTarget: 'commonjs2',
    },
    plugins: [
        new DefinePlugin({
            'process.env': {
                NODE_ENV: JSON.stringify(process.env.NODE_ENV||'development'),
            },
        }),
    ],
};

export default config;