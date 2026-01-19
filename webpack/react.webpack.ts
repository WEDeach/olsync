import HtmlWebpackPlugin from "html-webpack-plugin";
import * as path from "path";
import { Configuration as WebpackConfiguration,EnvironmentPlugin } from "webpack";
import { Configuration as WebpackDevServerConfiguration } from "webpack-dev-server";

const rootPath=path.resolve(__dirname,"..");

interface Configuration extends WebpackConfiguration {
    devServer?: WebpackDevServerConfiguration;
}

const config: Configuration={
    resolve: {
        extensions: [".tsx",".ts",".js"],
        //mainFields: ["main", "module", "browser"],
    },
    entry: path.resolve(rootPath,"src/renderer","index.tsx"),
    target: ['web','electron-renderer'],
    devtool: process.env.NODE_ENV==='production'? false:'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif)$/i,
                type: "asset/resource",
            },
        ],
    },
    node: {
        __dirname: false,
    },
    devServer: {
        static: {
            directory: path.resolve(rootPath,"dist/renderer"),
            publicPath: "/",
        },
        port: 3519,
        historyApiFallback: true,
        compress: true,
    },
    output: {
        path: path.resolve(rootPath,"dist/renderer"),
        filename: "js/renderer.js",
    },
    plugins: [
        new EnvironmentPlugin({
            NODE_ENV: process.env.NODE_ENV==='production'? 'production':'development',
        }),
        new HtmlWebpackPlugin({ template: path.resolve(rootPath,"src/renderer","index.ejs") }),
    ],
};

export default config;