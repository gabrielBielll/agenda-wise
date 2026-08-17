import tsParser from "@typescript-eslint/parser";

const config = [
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-console": ["error", { allow: ["error"] }],
    },
  },
];

export default config;
