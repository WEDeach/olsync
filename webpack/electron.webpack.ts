import * as path from "path";
import * as fs from "fs";
import { Configuration,DefinePlugin } from "webpack";

const rootPath=path.resolve(__dirname,"..");

function resolvePath(...segments: string[]) {
    return path.resolve(rootPath,...segments);
}

const entry: { [key: string]: string[] }={};
const entrypointsPath="src/entrypoint/js";
const supportedExts=new Set(['.ts','.tsx']);
fs.readdirSync(resolvePath(entrypointsPath),{ withFileTypes: true }).forEach((item) => {
    if(item.isFile()) {
        const filename=item.name;
        const ext=path.extname(filename);

        if(supportedExts.has(ext)) {
            const entryName=path.basename(filename,ext);

            if(entry[entryName]==null) {
                entry[entryName]=[];
            }
            entry[entryName].push(resolvePath(entrypointsPath,filename));
        }
    }
});

const config: Configuration={
    mode: process.env.NODE_ENV==='production'? 'production':'development',
    devtool: process.env.NODE_ENV==='production'? false:'source-map',
    entry: './src/entrypoint/js/main.ts',
    target: "electron-main",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
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
        'realm'
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
        extensions: ['.ts','.tsx'],
    },
};

export default config;