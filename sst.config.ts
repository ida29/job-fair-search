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
    // --- SSG（静的サイト: S3 + CloudFront） ---
    new sst.aws.StaticSite("WebSSG", {
      // path は省略可（デフォルトはカレントディレクトリ）
      build: {
        command: "npm run build",
        output: "dist",
      },
      // domain: "ssg.example.com", // 必要に応じて設定
    });

    // --- SSR（CloudFront + Lambda + S3） ---
    new sst.aws.Astro("WebSSR", {
      // path は省略可（デフォルトはカレントディレクトリ）
      // buildCommandは、Default "npm run build"。省略可。
      // domain: "ssr.example.com", // 必要に応じて設定
    });
  },
});
