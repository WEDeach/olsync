import * as path from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";
import type { Configuration } from "webpack";
const { DefinePlugin } = webpack;

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const rootPath=path.resolve(__dirname,"..");

const config: Configuration={
    mode: process.env.NODE_ENV==='production'? 'production':'development',
    devtool: process.env.NODE_ENV==='production'? false:'source-map',
    entry: {
        main: './src/entrypoint/js/main.ts',
        stableProcess: './src/entrypoint/js/stable.process.ts',
        lazerProcess: './src/entrypoint/js/lazer.process.ts',
        updaterWorker: './src/entrypoint/js/updater/updateWorker.ts',
    },
    target: "electron-main",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: { loader: 'ts-loader', options: { transpileOnly: true } },
            },
        ],
    },
    externals: [
        'crypto',
        'assert',
        'fs',
        'util',
        'os',
        'events',
        'child_process',
        'http',
        'https',
        'path',
        'electron',
        'original-fs',
        'realm',
        'rosu-pp-js',
        'better-sqlite3',
        'unbzip2-stream',
        'yauzl',
        'buffer',
        'stream',
        'string_decoder',
        'timers',
        'net',
    ],
    node: {
        __dirname: false,
    },
    output: {
        path: path.resolve(rootPath,"dist"),
        filename: "[name].js",
        libraryTarget: 'commonjs2',
    },
    plugins: [
        new DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(
                process.env.NODE_ENV==='production'? 'production':'development'
            ),
        }),
    ],
    resolve: {
        extensions: ['.ts','.tsx','.js'],
    },
};

export default config;