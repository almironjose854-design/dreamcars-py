import vinext from "vinext";
import { defineConfig } from "vite";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  r2_buckets: [
    {
      binding: "BUCKET",
      bucket_name: "site-creator-r2",
    },
  ],
};

export default defineConfig(async () => {
  configureToolEnvironment(process.cwd());

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
