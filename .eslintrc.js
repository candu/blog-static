/* eslint-env node */
module.exports = {
  extends: ["eslint:recommended", "prettier"],
  ignorePatterns: ["*.json", "node_modules"],
  root: true,
  rules: {
    "no-return-await": "warn",
    "no-constant-condition": ["error", { checkLoops: false }],
    eqeqeq: ["warn", "always"],
    "object-shorthand": ["error", "always"],
  },
};
