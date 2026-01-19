const path=require('path');
const { merge }=require('webpack-merge');

module.exports=(env,argv) => {
    const isDevelopment=argv.mode==='development';

    const baseConfig=require('./webpack.base.js')(env,argv);

    return merge(baseConfig,{
        entry: {
            renderer: './src/renderer.tsx',
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                },
                {
                    test: /\.(jpe?g|png|gif)$/i,
                    type: 'asset/resource',
                },
            ],
        },
        output: {
            filename: '[name].bundle.js',
            chunkFilename: '[name].renderer.bundle.js',
            publicPath: isDevelopment? 'http://localhost:8080/':'',
        },
        target: 'electron-renderer',
        plugins: [
            new HtmlWebpackPlugin({ template: path.resolve(rootPath,"src/renderer","index.ejs") }),
        ]
    });
};