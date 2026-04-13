const path = require('path');

module.exports = {
    mode: 'development',
    entry: path.resolve(__dirname, 'webpack-entry.js'),
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, '.tmp-build'),
        clean: true
    },
    devServer: {
        static: {
            directory: path.resolve(__dirname, 'dist')
        },
        hot: false,
        open: false,
        historyApiFallback: true
    }
};
