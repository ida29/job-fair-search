/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "job-fair-search",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    // --- Astro ハイブリッドモード（SSG + 必要に応じてSSR） ---
    // デフォルトは静的生成、ページごとに `export const prerender = false;` でSSR有効化
    new sst.aws.Astro("Web", {
      // path は省略可（デフォルトはカレントディレクトリ）
      // buildCommand は Default "npm run build"。省略可。
      // domain: "example.com", // 必要に応じて設定
    });
  },
});
