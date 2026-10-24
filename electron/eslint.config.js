const js = require("@eslint/js");

module.exports = [
  {
    // Packaged output and dead webpack-template scaffolding are not linted.
    ignores: [
      "out/**",
      ".webpack/**",
      "node_modules/**",
      "webpack.main.config.js",
      "webpack.renderer.config.js",
      "webpack.rules.js",
      "src/renderer.js",
    ],
  },
  {
    ...js.configs.recommended,
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        AbortController: "readonly",
        Blob: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
