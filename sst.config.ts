/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "job-fair-search",
      removal: input?.stage === "prod" ? "retain" : "remove",
      protect: ["prod"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    // ========================================
    // GitHub OIDC基盤ステージ
    // ========================================
    if ($app.stage === "github-oidc") {
      const { deployGitHubOIDC } = await import("./sst/github-oidc.js");
      return await deployGitHubOIDC();
    }

    // ========================================
    // アプリケーションステージ（dev/stg/prod）
    // ========================================

    // --- Astro ハイブリッドモード（SSG + 必要に応じてSSR） ---
    // デフォルトは静的生成、ページごとに `export const prerender = false;` でSSR有効化
    const site = new sst.aws.Astro("Web", {
      // path は省略可（デフォルトはカレントディレクトリ）
      // buildCommand は Default "npm run build"。省略可。
      // domain: "example.com", // 必要に応じて設定
    });

    return {
      url: site.url,
    };
  },
});
