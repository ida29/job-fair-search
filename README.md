# Job Fair Search

キュレーション型求人情報検索サイト

## 🚀 技術スタック

- **フレームワーク**: [Astro 5](https://astro.build/) - ハイブリッドレンダリング（SSG + SSR）
- **インフラ**: [SST 3](https://sst.dev/) - AWS上でのサーバーレスデプロイ
- **CI/CD**: GitHub Actions + OIDC
- **ホスティング**: AWS (CloudFront + Lambda@Edge + S3)

## 📁 プロジェクト構成

```
.
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions デプロイワークフロー
├── cloudformation/
│   └── github-oidc-role.yml    # OIDC IAMロール定義
├── docs/
│   ├── DEPLOYMENT.md           # デプロイメントガイド
│   └── SETUP.md                # セットアップガイド
├── src/
│   ├── components/
│   ├── layouts/
│   └── pages/
│       ├── index.astro         # トップページ（SSG）
│       └── api/
│           └── example.ts      # APIエンドポイント（SSR）
├── astro.config.mjs            # Astro設定
├── sst.config.ts               # SST設定
└── package.json
```

## 🌍 環境

| 環境 | トリガー | AWS アカウント | URL |
|------|---------|---------------|-----|
| **dev** | ローカル | dev | https://d22cwy88fjmmi4.cloudfront.net |
| **stg** | main ブランチ | stg | https://d2027pdceu86hb.cloudfront.net |
| **prod** | v* タグ | prod | https://d3f5ylooslds4t.cloudfront.net |

## 🔧 開発環境のセットアップ

### 必要な環境

- Node.js 20+
- AWS CLI
- GitHub CLI (gh)

### セットアップ手順

1. **依存関係のインストール**
   ```bash
   npm install
   ```

2. **ローカル開発サーバー起動**

   **通常の開発（推奨）:**
   ```bash
   npm run dev
   ```
   Astro開発サーバーが http://localhost:4321 で起動します。

   **Live Lambda付き開発（API/Lambda開発時）:**
   ```bash
   npm run sso        # AWS SSOログイン
   npm run dev:sst    # SST開発モード
   ```
   SST開発モードでAstroサーバー（http://localhost:4321）とLive Lambdaが起動します。

詳細は [docs/SETUP.md](./docs/SETUP.md) を参照してください。

## 🚀 デプロイ

### 自動デプロイ

- **STG環境**: `main` ブランチにプッシュすると自動デプロイ
- **PROD環境**: `v*` タグを作成すると自動デプロイ

```bash
# STG環境へのデプロイ
git push origin main

# PROD環境へのデプロイ
git tag v1.0.0
git push origin v1.0.0
```

### 手動デプロイ

```bash
# STG環境
AWS_PROFILE=job-fair-search-stg npx sst deploy --stage stg

# PROD環境
AWS_PROFILE=job-fair-search-prod npx sst deploy --stage prod
```

詳細は [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) を参照してください。

## 🎨 ハイブリッドレンダリング

このプロジェクトは、Astroのハイブリッドモードを使用しています：

- **デフォルト**: サーバーサイドレンダリング（SSR）
- **静的生成**: ページごとに `export const prerender = true;` を追加

```astro
---
// 静的生成（SSG）
export const prerender = true;
---

<h1>このページは事前レンダリングされます</h1>
```

```typescript
// APIエンドポイント（SSR）
export const prerender = false;

export async function GET() {
  return new Response(JSON.stringify({ data: "動的データ" }));
}
```

## 🔒 セキュリティ

- **OIDC認証**: GitHub ActionsからAWSへの認証に長期認証情報を使用しない
- **最小権限**: IAMロールは必要最小限の権限のみ付与
- **アクセス制限**: mainブランチとv*タグからのみデプロイ可能
- **環境分離**: dev/stg/prod で別々のAWSアカウント使用

## 📝 コマンド

### 開発

| コマンド | 説明 |
|---------|------|
| `npm run dev` | Astroローカル開発サーバー（http://localhost:4321） |
| `npm run dev:sst` | SST Live Lambda付き開発モード |
| `npm run build` | プロダクションビルド |
| `npm run preview` | ビルド結果のプレビュー |

### AWS認証

| コマンド | 説明 |
|---------|------|
| `npm run sso` | AWS SSOログイン（dev環境） |
| `npm run sso:dev` | Dev環境にSSOログイン |
| `npm run sso:stg` | Stg環境にSSOログイン |
| `npm run sso:prod` | Prod環境にSSOログイン |

### デプロイ

| コマンド | 説明 |
|---------|------|
| `npm run deploy:dev` | Dev環境へデプロイ |
| `npm run deploy:stg` | Stg環境へデプロイ |
| `npm run deploy:prod` | Prod環境へデプロイ |

### その他

| コマンド | 説明 |
|---------|------|
| `npx sst unlock --stage <stage>` | デプロイロック解除 |
| `npx sst remove --stage <stage>` | リソース削除 |
| `npx sst console --stage <stage>` | SSTコンソール起動 |

## 📚 ドキュメント

- [セットアップガイド](./docs/SETUP.md) - 初期セットアップ手順
- [デプロイメントガイド](./docs/DEPLOYMENT.md) - デプロイ方法と運用
- [Astro ドキュメント](https://docs.astro.build)
- [SST ドキュメント](https://sst.dev/)

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトはMITライセンスの下でライセンスされています。
