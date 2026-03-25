import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [".next/**", "dist-desktop/**", "node_modules/**", "electron/**/*.cjs", "next.config.js"],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

export default config;
