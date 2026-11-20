import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    ".sites-runtime/**",
  ]),
  {
    rules: {
      // Vinext serves dynamic Cloudinary/R2 URLs directly; its image pipeline
      // does not provide the optimization contract expected by next/image.
      "@next/next/no-img-element": "off",
      // Hash navigation and top-level admin exits intentionally use anchors.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);

export default eslintConfig;
