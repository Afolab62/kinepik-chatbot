import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "public/visualizations/**",
      "lib/server/tools/__pycache__/**",
      "**/*.pyc",
    ],
  },
];

export default eslintConfig;
