# M3: 本番相当インフラ・主要連携完了（SST/OpenNext版）- 改善版

## 今回の知見を反映した主な改善点

### 🎯 Astro + SSTプロジェクトでの学び
1. **IAM権限は段階的に追加** - 最初から完璧を目指さず、エラーベースで追加
2. **OIDC設定の落とし穴** - SST特有の権限要件（SSM, S3タギング等）
3. **マルチアカウント運用** - 環境分離のベストプラクティス
4. **Live Lambda開発** - `sst dev`と通常開発の使い分け
5. **CloudFormation vs SST** - 外部リソース（OIDCロール等）はCloudFormation管理

---

## 方針転換による主な変更点
- **EKS不要** → Lambda + CloudFront + S3 構成
- **コンテナ化不要** → OpenNextが自動でLambda用にビルド
- **デプロイ**: ローカル(sst dev) → GitHub Actions(sst deploy)
- **Terraform → SST** (IaC統合)
- **Live Lambda使用** のため共通VPC設定が必要

---

## [Phase 1] アーキテクチャ設計・準備

### [Ticket 1-1] OpenNext/SST アーキテクチャ設計・コスト試算

#### 優先度: 🔴 高 | 期間: 3-5日

#### タスク

**1. OpenNext/SSTアーキテクチャ設計**
- [ ] OpenNext/SSTによるNext.jsホスティング方式を決定
- [ ] CDN構成を設計 (CloudFront + S3 + Lambda@Edge)
- [ ] ISR/SSRレンダリング戦略を決定
  - ページごとのレンダリング方式（Static/ISR/SSR）
  - revalidate時間設計
- [ ] ISRトリガー用アーキテクチャ設計 (API Route使用)

**2. VPC設計（Live Lambda用）**
- [ ] **共通VPC設計**
  - サブネット構成（パブリック/プライベート）
  - AZ分散戦略（2-AZ or 3-AZ）
  - CIDR設計
- [ ] **NAT Gateway設計**
  - 高可用性 vs コスト最適化の判断
  - マルチAZ構成 or シングルNAT
  - 💡 **推奨**: 開発・ステージングはシングルNAT、本番はマルチAZ
- [ ] **VPC Endpoint設計**
  - S3 Endpoint (Gateway型)
  - Secrets Manager Endpoint (Interface型)
  - CloudWatch Logs Endpoint (Interface型)
  - ECR Endpoint (Live Lambda用、必要に応じて)
  - 💡 **コスト最適化**: Interface型は必要最小限に
- [ ] **セキュリティグループ設計**
  - Lambda用SG（最小権限）
  - VPC Endpoint用SG
  - 将来のRDS等データベース用SG（予約）

**3. セキュリティ・監視設計**
- [ ] 監視・ロギング基本設計 (CloudWatch + Datadog連携)
- [ ] WAF設定設計
  - Rate limiting
  - Geo-blocking（必要に応じて）
  - Bot protection
  - 💡 **SSTでは自動化されないため、明示的に追加**
- [ ] CloudTrailログ設計（監査ログ）
- [ ] AWS Config設計（コンプライアンス）

**4. 運用設計**
- [ ] AWSリソースタグ戦略
  ```
  - Environment: dev/stg/prod
  - Project: magazine-cms
  - ManagedBy: SST
  - CostCenter: <部署コード>
  - Owner: <チーム名>
  - Repository: <GitHubリポジトリ>
  ```
- [ ] 権限モデル設計
  - 環境別アクセス制御
  - 最小権限原則の適用
  - 💡 **学び**: IAMロールはCloudFormation管理、アプリリソースはSST管理
- [ ] シークレット管理フロー
  - SST Secret使用方針
  - 環境別設定（dev/stg/prod）
  - ローテーション方針
  - 💡 **推奨**: `sst secret set`でCLIから登録、GitHub Secretsは使わない

**5. Notion CMS設計**
- [ ] Notion API連携方式設計
  - 認証方式（Integration Token）
  - データ取得パターン
  - キャッシュ戦略（ISR活用）
  - エラーハンドリング
- [ ] Notionデータモデル設計
  - データベース構造
  - プロパティ設計
  - リレーション設計
- [ ] Notion運用フロー設計
  - コンテンツ編集→公開フロー
  - プレビュー機能
  - 承認フロー（必要に応じて）

**6. CI/CD設計**
- [ ] GitHub Actionsデプロイフロー設計
  - 環境別デプロイトリガー
    - mainブランチ → stg
    - release/* → prod (承認付き)
  - 💡 **学び**: タグではなくブランチベースの方が運用しやすい場合も
- [ ] OIDC設定設計
  - CloudFormationテンプレート準備
  - 環境別IAMロール
  - 💡 **重要**: SST特有の権限要件を事前に盛り込む

**7. コスト試算**
- [ ] AWSリソース別コスト試算
  - Lambda（実行回数、実行時間、メモリ）
  - CloudFront（リクエスト数、データ転送量）
  - S3（ストレージ、リクエスト）
  - NAT Gateway（データ転送量）
  - VPC Endpoint（時間料金、データ転送量）
  - WAF（リクエスト数、ルール数）
  - Datadog（ログ量、APMホスト数）
- [ ] 月間コスト見積もり作成
- [ ] コスト最適化ポイント整理

**8. 承認・レビュー**
- [ ] アーキテクチャ設計レビュー
- [ ] セキュリティレビュー
- [ ] コスト承認

#### 成果物
- [ ] アーキテクチャ設計書
- [ ] VPC設計書（ネットワーク図含む）
- [ ] IAM権限設計書
- [ ] コスト試算書
- [ ] リスク評価・対策案

---

## [Phase 2] 基盤インフラ構築

### [Ticket 2-1] 共通インフラ基盤構築（SST/Pulumi）

#### 優先度: 🔴 高 | 期間: 2-3日

#### タスク

**GitHub OIDC基盤（SST stage: github-oidc）**

- [ ] **sst.config.ts にOIDC基盤を実装**
  ```typescript
  // stage === "github-oidc" の場合のみ実行
  if ($app.stage === "github-oidc") {
    // OIDC Provider作成（既存チェック付き）
    // GitHub Actions IAMロール作成
    // 必要な権限ポリシー作成
  }
  ```

- [ ] **OIDC Provider実装**
  - 既存Provider確認ロジック
  - 存在しない場合のみ作成
  - 複数環境で共有可能

- [ ] **IAMロール・ポリシー実装**
  ```typescript
  // 💡 学び: 以下の権限を事前に含める
  // - ssm:* on /sst/*
  // - s3:* on sst-*
  // - s3:PutObjectTagging
  // - lambda:GetFunctionCodeSigningConfig
  // - cloudformation:*
  // - iam:* (Lambda実行ロール作成用)
  // - cloudfront:*
  // - route53:* (カスタムドメイン使用時)
  // - wafv2:* (WAF設定用)
  // - ec2:* (VPC管理用)
  // - logs:*, secretsmanager:*
  ```

- [ ] **各環境にデプロイ**
  ```bash
  # Dev環境
  AWS_PROFILE=magazine-cms-dev sst deploy --stage github-oidc
  # → Role ARN出力

  # Stg環境
  AWS_PROFILE=magazine-cms-stg sst deploy --stage github-oidc

  # Prod環境
  AWS_PROFILE=magazine-cms-prod sst deploy --stage github-oidc
  ```

- [ ] **GitHub Secrets設定**
  ```bash
  gh secret set AWS_ROLE_ARN_DEV --body "<output-role-arn>"
  gh secret set AWS_REGION_DEV --body "ap-northeast-1"
  # Stg/Prod環境も同様
  ```

**WAF構築（SST管理）**

- [ ] **WAF実装（アプリステージで作成）**
  ```typescript
  // WAFv2 WebACL作成
  const webAcl = new aws.wafv2.WebAcl("SiteWaf", {
    scope: "CLOUDFRONT",
    defaultAction: { allow: {} },
    rules: [
      {
        name: "RateLimit",
        priority: 1,
        action: { block: {} },
        statement: {
          rateBasedStatement: {
            limit: 2000,
            aggregateKeyType: "IP",
          },
        },
      },
      // AWS Managed Rules
      {
        name: "AWSManagedRulesCommonRuleSet",
        priority: 2,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesCommonRuleSet",
          },
        },
      },
    ],
  });

  // CloudFrontに関連付け
  const site = new sst.aws.Nextjs("Site", {
    transform: {
      cdn: {
        webAclId: webAcl.arn,
      },
    },
  });
  ```

#### 成果物
- [ ] sst.config.ts（OIDC基盤定義）
- [ ] デプロイスクリプト
- [ ] 権限検証レポート

#### 💡 重要な設計判断

**なぜstage分離するのか:**
1. **ライフサイクルの違い**
   - `github-oidc`: 初回のみデプロイ、滅多に変更しない
   - `dev/stg/prod`: 頻繁にデプロイ
2. **安全性**
   - アプリデプロイ失敗がOIDCロールに影響しない
3. **独立性**
   - OIDCロールの変更をアプリと切り離せる

**デプロイフロー:**
```bash
# 初回のみ（各AWSアカウントで1回）
sst deploy --stage github-oidc

# 以降はアプリのみデプロイ
sst deploy --stage dev
sst deploy --stage stg
sst deploy --stage prod
```

---

---

### [Ticket 2-2] package.json開発スクリプト整備

#### 優先度: 🟡 中 | 期間: 0.5日

#### タスク

- [ ] **package.json scripts作成**
  ```json
  {
    "scripts": {
      "dev": "next dev",
      "dev:sst": "sst dev --stage dev",
      "build": "next build",
      "sso": "aws sso login --profile magazine-cms-dev",
      "sso:dev": "aws sso login --profile magazine-cms-dev",
      "sso:stg": "aws sso login --profile magazine-cms-stg",
      "sso:prod": "aws sso login --profile magazine-cms-prod",
      "deploy:oidc:dev": "AWS_PROFILE=magazine-cms-dev sst deploy --stage github-oidc",
      "deploy:oidc:stg": "AWS_PROFILE=magazine-cms-stg sst deploy --stage github-oidc",
      "deploy:oidc:prod": "AWS_PROFILE=magazine-cms-prod sst deploy --stage github-oidc",
      "deploy:dev": "AWS_PROFILE=magazine-cms-dev sst deploy --stage dev",
      "deploy:stg": "AWS_PROFILE=magazine-cms-stg sst deploy --stage stg",
      "deploy:prod": "AWS_PROFILE=magazine-cms-prod sst deploy --stage prod"
    }
  }
  ```

#### 成果物
- [ ] package.json
- [ ] コマンドリファレンス

---

### [Ticket 2-3] SST/OpenNextインフラ構築

#### 優先度: 🔴 高 | 期間: 3-5日

#### タスク

**1. SSTプロジェクト初期化**
- [ ] SST/OpenNextインストール
  ```bash
  npm install sst open-next
  ```
- [ ] sst.config.ts作成・基本設定
  ```typescript
  export default $config({
    app(input) {
      return {
        name: "magazine-cms",
        removal: input?.stage === "prod" ? "retain" : "remove",
        protect: ["prod"].includes(input?.stage),
        home: "aws",
      };
    },
    async run() {
      // VPC構築
      // Next.jsサイト構築
      // WAF関連付け
    },
  });
  ```

**2. VPC構築（SST管理）**
- [ ] **VPC作成**
  ```typescript
  const vpc = new sst.aws.Vpc("AppVpc", {
    nat: $app.stage === "prod" ? "managed" : "ec2", // 💡 prodはマルチAZ NAT Gateway、dev/stgはコスト削減
    az: $app.stage === "prod" ? 2 : 1,
  });
  ```
- [ ] **VPC Endpoint作成**
  ```typescript
  // S3 Gateway Endpoint（無料）
  new aws.ec2.VpcEndpoint("S3Endpoint", {
    vpcId: vpc.id,
    serviceName: `com.amazonaws.${aws.getRegionOutput().name}.s3`,
  });

  // 必要に応じてInterface Endpoint追加
  ```
- [ ] **セキュリティグループ作成**
  ```typescript
  const lambdaSg = new aws.ec2.SecurityGroup("LambdaSg", {
    vpcId: vpc.id,
    egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
  });
  ```

**3. Next.jsサイト構築**
- [ ] **OpenNext設定**
  ```typescript
  const site = new sst.aws.Nextjs("Site", {
    path: "./",
    vpc: {
      securityGroups: [lambdaSg.id],
      subnets: vpc.privateSubnets,
    },
    environment: {
      // 環境変数
    },
    domain: $app.stage === "prod"
      ? { name: "magazine.example.com", dns: sst.cloudflare.dns() }
      : undefined,
  });
  ```
- [ ] **CloudFront設定カスタマイズ**
  ```typescript
  // WAF WebACL関連付け
  // キャッシュポリシー
  // Origin設定
  ```
- [ ] **/magazine/ パス設定**
  - CloudFront Behavior設定
  - 既存リバースプロキシとの統合方針に応じて調整

**4. タグ設定（全リソース統一）**
- [ ] **デフォルトタグ設定**
  ```typescript
  // sst.config.ts
  providers: {
    aws: {
      defaultTags: {
        tags: {
          Environment: $app.stage,
          Project: "magazine-cms",
          ManagedBy: "SST",
          CostCenter: "<部署コード>",
          Owner: "<チーム名>",
          Repository: "github.com/yourorg/magazine-cms",
        },
      },
    },
  },
  ```

**5. シークレット管理**
- [ ] **Notion API Key登録**
  ```bash
  # 各環境ごとに登録
  AWS_PROFILE=magazine-cms-dev sst secret set NOTION_API_KEY <key> --stage dev
  AWS_PROFILE=magazine-cms-stg sst secret set NOTION_API_KEY <key> --stage stg
  AWS_PROFILE=magazine-cms-prod sst secret set NOTION_API_KEY <key> --stage prod
  ```
- [ ] **Notion Integration Token登録**
  ```bash
  sst secret set NOTION_INTEGRATION_TOKEN <token> --stage <stage>
  ```
- [ ] **シークレットをNext.jsにバインド**
  ```typescript
  environment: {
    NOTION_API_KEY: process.env.NOTION_API_KEY,
  },
  ```
  💡 **学び**: GitHub Secretsではなく、SST Secretで一元管理

**6. 監視・ロギング設定**
- [ ] **CloudWatch Logs設定**
  ```typescript
  // Lambda関数のログ保持期間
  logRetention: "one_week", // dev/stg
  logRetention: "one_month", // prod
  ```
- [ ] **CloudWatch Alarms設定**
  - Lambda エラー率 > 5%
  - Lambda 実行時間 > 10秒
  - CloudFront 5xx エラー率 > 1%
- [ ] **X-Ray トレーシング有効化**（オプション）

**7. Datadog連携設定**
- [ ] **Datadog Forwarder Lambda設定**
  ```typescript
  // CloudWatch Logs → Datadog
  // 💡 SSTではDatadog統合をカスタムリソースで追加
  ```
- [ ] **Datadog Lambda Extension設定**
  ```typescript
  // メトリクス、トレース送信
  layers: [
    `arn:aws:lambda:ap-northeast-1:464622532012:layer:Datadog-Extension:XX`,
    `arn:aws:lambda:ap-northeast-1:464622532012:layer:Datadog-Node20:XX`,
  ],
  environment: {
    DD_API_KEY: process.env.DD_API_KEY,
    DD_SITE: "datadoghq.com",
    DD_ENV: $app.stage,
    DD_SERVICE: "magazine-cms",
  },
  ```
- [ ] Datadog APM設定
- [ ] カスタムメトリクス・ダッシュボード設計
- [ ] アラート設定

**8. コスト試算**
- [ ] **Lambda コスト**
  - 想定実行回数/月
  - 平均実行時間
  - メモリ設定
- [ ] **CloudFront コスト**
  - 想定リクエスト数/月
  - データ転送量
- [ ] **NAT Gateway コスト**
  - データ処理料金
  - 時間料金
  - 💡 **高コスト要注意**: マルチAZ構成は月額 $64.8〜
- [ ] **VPC Endpoint コスト**
  - Interface型は時間料金 + データ転送料金
- [ ] **S3 コスト**
  - ストレージ容量
  - リクエスト数
- [ ] **WAF コスト**
  - WebACL料金
  - ルール料金
  - リクエスト料金
- [ ] **Datadog コスト**
  - ログインデックス量
  - APMホスト数
- [ ] **月間総コスト見積もり作成**
- [ ] **コスト最適化案**
  - Lambda メモリ最適化
  - CloudFront キャッシュ戦略
  - S3 ライフサイクルポリシー
  - VPC Endpoint の必要性精査

#### 成果物
- [ ] アーキテクチャ図（draw.io等）
- [ ] VPC設計書（ネットワーク図、CIDR一覧）
- [ ] IAM権限設計書
- [ ] コスト試算書（Excel/Sheets）
- [ ] セキュリティ要件書
- [ ] リスク評価・対策案

#### レビュー観点
- [ ] セキュリティベストプラクティス準拠
- [ ] コスト妥当性
- [ ] スケーラビリティ
- [ ] 運用性

---

### [Ticket 1-2] ローカル開発環境セットアップ

#### 優先度: 🟡 中 | 期間: 1-2日

#### タスク

**1. プロジェクトセットアップ**
- [ ] Next.js プロジェクト作成
- [ ] SST/OpenNext依存関係追加
- [ ] TypeScript設定
- [ ] ESLint/Prettier設定

**2. 開発用スクリプト整備**
- [ ] **package.json scripts**
  ```json
  {
    "scripts": {
      "dev": "next dev",
      "dev:sst": "sst dev --stage dev",
      "build": "next build",
      "sso": "aws sso login --profile magazine-cms-dev",
      "sso:dev": "aws sso login --profile magazine-cms-dev",
      "sso:stg": "aws sso login --profile magazine-cms-stg",
      "sso:prod": "aws sso login --profile magazine-cms-prod",
      "deploy:dev": "sst deploy --stage dev",
      "deploy:stg": "sst deploy --stage stg",
      "deploy:prod": "sst deploy --stage prod"
    }
  }
  ```
  💡 **学び**: AWS_PROFILEをスクリプトに含めると便利

**3. AWS SSO設定**
- [ ] 各環境用プロファイル設定
  - magazine-cms-dev
  - magazine-cms-stg
  - magazine-cms-prod

**4. 開発ドキュメント作成**
- [ ] README.md
- [ ] docs/SETUP.md
- [ ] docs/DEVELOPMENT.md
  - 通常開発とLive Lambda開発の使い分け
  - 💡 **学び**: 明確に使い分けを記載

#### 成果物
- [ ] 動作する開発環境
- [ ] セットアップドキュメント

---

## [Phase 3] インフラ実装

### [Ticket 3-1] SST基盤インフラ実装

#### 優先度: 🔴 高 | 期間: 3-5日 | 依存: Ticket 1-1, 2-1

#### タスク

**1. VPC実装**
- [ ] sst.config.tsにVPC定義
- [ ] NAT Gateway設定
- [ ] VPC Endpoint作成
- [ ] セキュリティグループ作成
- [ ] **動作確認**
  - VPC作成確認
  - サブネット確認
  - ルートテーブル確認

**2. Next.jsサイト実装**
- [ ] OpenNext設定
- [ ] VPC統合
- [ ] 環境変数設定
- [ ] タグ設定
- [ ] **動作確認**
  - ローカルビルド成功
  - `sst deploy --stage dev` 成功
  - CloudFrontディストリビューション作成確認
  - Lambda関数作成確認

**3. WAF統合**
- [ ] CloudFormationで作成したWebACLをCloudFrontに関連付け
- [ ] WAFルール動作確認

**4. 監視・ログ設定実装**
- [ ] CloudWatch Logs設定
- [ ] CloudWatch Alarms作成
- [ ] X-Ray設定（オプション）

**5. Datadog統合実装**
- [ ] Datadog Forwarder設定
- [ ] Lambda Extension設定
- [ ] APM設定
- [ ] ダッシュボード作成

**6. デプロイテスト**
- [ ] **Dev環境デプロイ**
  ```bash
  npm run sso:dev
  npm run deploy:dev
  ```
- [ ] **Stg環境デプロイ**
  ```bash
  npm run deploy:stg
  ```
- [ ] **Prod環境デプロイ**
  ```bash
  npm run deploy:prod
  ```
- [ ] 各環境の動作確認
- [ ] VPC内Lambdaからのインターネット接続確認
  - NAT Gateway経由の外部API呼び出しテスト
  - Notion API接続テスト

**7. Live Lambda動作確認**
- [ ] `npm run dev:sst` で起動
- [ ] ローカルでのLambda実行確認
- [ ] ホットリロード確認
- [ ] AWS統合確認（S3アクセス等）

#### 成果物
- [ ] 動作するsst.config.ts
- [ ] デプロイ済みインフラ（全環境）
- [ ] 動作確認レポート

#### 💡 ハマりポイント対策（今回の学び）
- [ ] **デプロイロックエラー**: `npx sst unlock --stage <stage>` で解除
- [ ] **権限エラー**: エラーメッセージから必要な権限を特定→CloudFormation更新
- [ ] **SSMパラメータ権限**: `/sst/*` 全体へのアクセスを許可
- [ ] **S3バケット権限**: `sst-*` バケットへのアクセスを許可
- [ ] **タギング権限**: S3オブジェクトタギング権限を忘れずに

---

### [Ticket 3-2] GitHub Actionsパイプライン実装

#### 優先度: 🔴 高 | 期間: 2-3日 | 依存: Ticket 2-1, 3-1

#### タスク

**1. ワークフロー実装**
- [ ] **.github/workflows/deploy-dev.yml**
  ```yaml
  name: Deploy to Dev
  on:
    push:
      branches: [develop]
  permissions:
    id-token: write
    contents: read
  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20  # 💡 学び: Node.js 20推奨
        - run: npm ci
        - uses: aws-actions/configure-aws-credentials@v4
          with:
            role-to-assume: ${{ secrets.AWS_ROLE_ARN_DEV }}
            aws-region: ${{ secrets.AWS_REGION_DEV }}
        - run: npx sst deploy --stage dev --print-logs
  ```

- [ ] **.github/workflows/deploy-stg.yml**
  ```yaml
  # mainブランチ → stgデプロイ
  ```

- [ ] **.github/workflows/deploy-prod.yml**
  ```yaml
  # release/* ブランチ → prodデプロイ（承認付き）
  on:
    push:
      branches: [release/*]
  jobs:
    deploy:
      environment: production  # GitHub Environment承認
  ```

**2. GitHub Environments設定**
- [ ] production環境作成
- [ ] 承認者設定
- [ ] シークレット設定（環境別）

**3. 通知設定**
- [ ] Slackデプロイ通知
  - デプロイ開始
  - デプロイ成功
  - デプロイ失敗
  - ロールバック

**4. パイプライン動作確認**
- [ ] Dev環境自動デプロイテスト
- [ ] Stg環境自動デプロイテスト
- [ ] Prod環境承認フロー確認
- [ ] エラー時の通知確認

#### 成果物
- [ ] GitHub Actionsワークフロー
- [ ] デプロイ手順書
- [ ] ロールバック手順書

---

## [Phase 4] Notion CMS連携実装

### [Ticket 4-1] Notion API基盤実装

#### 優先度: 🔴 高 | 期間: 3-5日 | 依存: Ticket 3-1

#### タスク

**1. Notion Integration設定**
- [ ] Notion Integrationを作成
- [ ] 必要なデータベース・ページへのアクセス権限を付与
- [ ] API Key/Integration Token発行
- [ ] **SST Secretに登録**
  ```bash
  sst secret set NOTION_API_KEY <key> --stage dev
  sst secret set NOTION_INTEGRATION_TOKEN <token> --stage dev
  ```

**2. Notion APIクライアント実装**
- [ ] @notionhq/client セットアップ
- [ ] API接続テスト
- [ ] **VPC内Lambdaからの外部API接続確認**
  - NAT Gateway経由の接続確認
  - タイムアウト設定調整
  - リトライロジック実装
  - 💡 **重要**: VPC内LambdaはNAT Gateway必須

**3. データ取得ロジック実装**
- [ ] Notionデータベース取得
- [ ] ページコンテンツ取得
- [ ] リレーションデータ取得
- [ ] エラーハンドリング
  - Notion API制限対応（Rate Limit: 3req/sec）
  - タイムアウト処理
  - フォールバック処理

**4. キャッシュ戦略実装**
- [ ] ISR設定
  ```typescript
  // pages/magazine/[slug].tsx
  export async function getStaticProps() {
    return {
      props: { ... },
      revalidate: 3600, // 1時間
    };
  }
  ```
- [ ] On-demand Revalidation実装
- [ ] キャッシュ戦略ドキュメント化

#### 成果物
- [ ] Notion APIクライアントライブラリ
- [ ] データ取得関数
- [ ] ユニットテスト

---

### [Ticket 4-2] Notion Webhook → ISR連携実装

#### 優先度: 🟡 中 | 期間: 2-3日 | 依存: Ticket 4-1

#### タスク

**1. Webhook受信エンドポイント実装**
- [ ] **API Route作成**
  ```typescript
  // app/api/webhook/notion/route.ts
  export async function POST(request: Request) {
    // Webhook署名検証
    // ISR revalidation
  }
  ```
- [ ] **SST API定義**
  ```typescript
  // sst.config.tsでAPI Gatewayエンドポイント作成
  ```

**2. Webhook署名検証実装**
- [ ] Notion Webhook署名検証
- [ ] リプレイ攻撃対策
- [ ] IPホワイトリスト（必要に応じて）

**3. ISR Revalidation実装**
- [ ] revalidatePath() 実装
- [ ] revalidateTag() 実装
- [ ] エラーハンドリング
- [ ] ロギング

**4. Notion Webhook設定**
- [ ] NotionでWebhook作成
- [ ] エンドポイントURL設定
- [ ] イベントタイプ選択

**5. エンドツーエンドテスト**
- [ ] **テストシナリオ実行**
  1. Notionでコンテンツ編集
  2. Webhook発火確認
  3. API Route受信確認
  4. ISR実行確認
  5. サイト更新確認（キャッシュクリア）
- [ ] **異常系テスト**
  - Webhook署名エラー
  - Revalidation失敗
  - タイムアウト

#### 成果物
- [ ] Webhook受信API
- [ ] ISR連携機能
- [ ] テスト結果レポート

---

## [Phase 5] セキュリティ強化・最終確認

### [Ticket 5-1] セキュリティ強化・監査

#### 優先度: 🟡 中 | 期間: 2-3日

#### タスク

**1. IAMアクセス分析**
- [ ] IAM Access Analyzerでの過剰権限チェック
- [ ] 未使用権限の削除
- [ ] 最小権限原則の再確認

**2. セキュリティ監査**
- [ ] CloudTrailログ有効化・監査ログ保存設定
- [ ] AWS Config有効化
  - タグ必須化ルール
  - 暗号化必須ルール
  - パブリックアクセス禁止ルール
- [ ] セキュリティグループ見直し
- [ ] VPCフローログ有効化・分析設定

**3. シークレット運用強化**
- [ ] シークレットローテーション方針実装（必要に応じて）
- [ ] シークレットアクセス監査
- [ ] 緊急時のシークレット無効化手順

**4. WAF最適化**
- [ ] Rate limitingチューニング
- [ ] ブロックルール検証
- [ ] ログ分析・誤検知調整

**5. GuardDuty/Security Hub**
- [ ] GuardDuty有効化（VPC Finding含む）
- [ ] Security Hub有効化
- [ ] 検出事項の対応

#### 成果物
- [ ] セキュリティ監査レポート
- [ ] 改善対応完了証跡
- [ ] セキュリティ運用手順書

---

### [Ticket 5-2] 運用ドキュメント整備

#### 優先度: 🟡 中 | 期間: 2-3日

#### タスク

**1. 運用手順書作成**
- [ ] **デプロイ手順**
  - ローカルデプロイ
  - CI/CDデプロイ
  - ロールバック手順
  - 💡 **学び**: コマンド例を具体的に記載
- [ ] **トラブルシューティングガイド**
  - よくあるエラーと対処法
  - デプロイロックエラー
  - 権限エラー
  - VPC接続エラー
  - 💡 **学び**: 実際に遭遇したエラーを全て記載
- [ ] **モニタリング手順**
  - CloudWatch確認方法
  - Datadog確認方法
  - ログ検索方法
- [ ] **緊急対応手順**
  - インシデント対応フロー
  - ロールバック手順
  - エスカレーション手順

**2. 開発者向けドキュメント**
- [ ] README.md（概要、クイックスタート）
- [ ] docs/SETUP.md（初期セットアップ）
- [ ] docs/DEVELOPMENT.md（開発方法）
- [ ] docs/DEPLOYMENT.md（デプロイ方法）
- [ ] docs/ARCHITECTURE.md（アーキテクチャ）
- [ ] docs/NOTION.md（Notion運用）

**3. runbook作成**
- [ ] デプロイフロー
- [ ] ロールバックフロー
- [ ] スケールアップ/ダウン手順
- [ ] コスト最適化施策

#### 成果物
- [ ] 運用ドキュメント一式
- [ ] runbook

---

## [Phase 6] 最終検証・リリース準備

### [Ticket 6-1] 統合テスト・負荷テスト

#### 優先度: 🟡 中 | 期間: 2-3日

#### タスク

**1. 機能テスト**
- [ ] 全ページの表示確認
- [ ] ISR動作確認
- [ ] Notion連携動作確認
- [ ] Webhook動作確認

**2. 性能テスト**
- [ ] CloudFrontキャッシュヒット率測定
- [ ] Lambda実行時間測定
- [ ] Notion API レスポンス時間測定
- [ ] TTFBサ測定

**3. 負荷テスト**
- [ ] 想定トラフィックでの負荷テスト
- [ ] スパイクテスト
- [ ] Lambda同時実行数確認
- [ ] NAT Gatewayスループット確認

**4. セキュリティテスト**
- [ ] WAF動作確認
- [ ] Rate limiting動作確認
- [ ] 脆弱性スキャン

#### 成果物
- [ ] テスト結果レポート
- [ ] 性能ベンチマーク
- [ ] 改善提案

---

### [Ticket 6-2] 本番リリース準備

#### 優先度: 🔴 高 | 期間: 1-2日

#### タスク

**1. 本番前チェックリスト**
- [ ] カスタムドメイン設定完了
- [ ] SSL証明書設定完了
- [ ] WAF設定完了
- [ ] 監視・アラート設定完了
- [ ] バックアップ戦略確認
- [ ] ロールバック手順確認
- [ ] 緊急連絡先確認

**2. ドキュメント最終確認**
- [ ] 全ドキュメント更新確認
- [ ] スクリーンショット更新
- [ ] リンク切れチェック

**3. ステークホルダー確認**
- [ ] デモ実施
- [ ] 最終承認取得

#### 成果物
- [ ] リリース判定会議資料
- [ ] 承認記録

---

## 改善されたポイント（今回の知見反映）

### ✅ IAM権限設計
- **Before**: 最小権限を目指して不足エラー続出
- **After**: SST特有の権限要件を事前に盛り込んだテンプレート作成
- **具体的**: `ssm:*` on `/sst/*`, `s3:*` on `sst-*`, `s3:PutObjectTagging`, `lambda:GetFunctionCodeSigningConfig`

### ✅ インフラ管理の分離
- **Before**: 全てSST or 全てTerraform
- **After**:
  - **CloudFormation**: OIDC Provider/Roles, WAF（SST外リソース）
  - **SST**: アプリケーションインフラ（VPC, Lambda, CloudFront）
- **理由**: 責任範囲の明確化、変更頻度の違い

### ✅ 開発体験の向上
- **npm run sso**: ワンコマンドでSSO認証
- **npm run dev**: 通常開発（高速）
- **npm run dev:sst**: Live Lambda開発（実環境）
- **npm run deploy:*****: 環境別デプロイ簡略化
- **AWS_PROFILE内包**: コマンド実行時のプロファイル指定不要

### ✅ マルチアカウント戦略
- **環境分離**: dev/stg/prod で別AWSアカウント
- **OIDC認証**: 環境ごとに別IAMロール
- **GitHub Secrets**: 環境別にサフィックス付き（`_DEV`, `_STG`, `_PROD`）

### ✅ コスト最適化の視点
- **NAT Gateway**: dev/stgはシングル、prodはマルチAZ
- **VPC Endpoint**: Gateway型優先、Interface型は最小限
- **Lambda**: メモリ最適化、タイムアウト設定
- **ログ保持**: dev/stgは短期、prodは長期

### ✅ トラブルシューティング強化
- **実際に遭遇したエラーを全て記載**
  - デプロイロックエラー → `sst unlock`
  - 権限エラー → CloudFormation更新手順
  - VPC接続エラー → NAT Gateway確認
- **デバッグコマンド追加**
  - `--print-logs` オプション
  - ログ確認コマンド
  - 状態確認コマンド

### ✅ ドキュメント構造
```
docs/
├── SETUP.md           # 初期セットアップ（詳細手順）
├── DEVELOPMENT.md     # 開発方法（Live Lambda含む）
├── DEPLOYMENT.md      # デプロイ・運用（詳細）
├── ARCHITECTURE.md    # アーキテクチャ図・設計
└── TROUBLESHOOTING.md # トラブルシューティング（実例ベース）
```

---

## タイムライン（改善版）

| Phase | 期間 | 主なマイルストーン |
|-------|------|------------------|
| Phase 1 | Week 1 | アーキテクチャ設計完了、承認取得 |
| Phase 2 | Week 1-2 | OIDC基盤、開発環境構築完了 |
| Phase 3 | Week 2-3 | インフラ実装、CI/CD構築完了 |
| Phase 4 | Week 3-4 | Notion連携実装完了 |
| Phase 5 | Week 4 | セキュリティ強化、ドキュメント整備完了 |
| Phase 6 | Week 5 | テスト・リリース準備完了 |

---

## リスク管理（今回の経験から）

### 🚨 高リスク項目

1. **IAM権限不足によるデプロイ失敗**
   - **対策**: SST特有権限を事前に全て付与
   - **検出**: 初回デプロイで確認
   - **対応**: CloudFormationスタック更新（5分）

2. **VPC内Lambdaの外部API接続失敗**
   - **対策**: NAT Gateway必須、タイムアウト設定
   - **検出**: 開発段階でNotion API接続テスト
   - **対応**: VPC設定見直し

3. **デプロイロック競合**
   - **対策**: `sst unlock`コマンド用意
   - **検出**: 同時デプロイ時
   - **対応**: ロック解除後リトライ

4. **コスト超過**
   - **対策**: NAT Gateway、VPC Endpointの適切な設計
   - **検出**: AWS Cost Explorerで日次確認
   - **対応**: 不要リソースの削除、構成見直し

5. **Notion API Rate Limit**
   - **対策**: リトライロジック、バックオフ実装
   - **検出**: 負荷テスト時
   - **対応**: キャッシュ戦略の見直し

---

## 確認事項（優先度付き）

### 🔴 必須確認事項

1. **AWSアカウント構成**
   - マルチアカウント（dev/stg/prod別）推奨
   - シングルアカウントの場合は環境タグで厳密に分離

2. **既存VPCとの統合**
   - 新規VPC作成を推奨（SST管理下）
   - 既存VPCとの連携が必要な場合はVPC Peering

3. **/magazine/ ルーティング**
   - 独立したCloudFront構成を推奨
   - 既存リバースプロキシとの統合は複雑化するためなるべく避ける

4. **GitHub Actions環境**
   - GitHub-hosted runners推奨（セットアップ不要）

5. **本番デプロイ承認**
   - GitHub Environmentsでの承認フロー必須

### 🟡 要確認事項

6. **既存Terraform資産**
   - SST単独管理を推奨
   - 必要に応じてTerraform→SST移行

7. **既存タグ規約**
   - 組織規約に準拠したタグ設計

8. **Datadog設定**
   - 既存Organization確認
   - APIキー取得

9. **Notion運用体制**
   - 編集権限管理
   - 承認フロー（必要に応じて）

10. **NAT Gateway構成**
    - 本番: マルチAZ（高可用性）
    - dev/stg: シングル（コスト削減）

---

## 成功のポイント

### 💡 段階的アプローチ
1. まずdev環境で全て動作確認
2. 次にstg環境でCI/CD確認
3. 最後にprod環境リリース

### 💡 早期の失敗検証
- IAM権限エラーは初回デプロイで全て洗い出す
- VPC統合は早期にテスト
- Notion API接続は開発初期に確認

### 💡 ドキュメントファースト
- セットアップ手順は実行しながら記載
- エラーと解決策は必ず記録
- コマンド例は実際に動くものを記載

### 💡 自動化優先
- 手動作業は極力排除
- npm scriptsで全て実行可能に
- ワンコマンドデプロイを実現

---

## 参考資料

- [SST Documentation](https://sst.dev/)
- [OpenNext Documentation](https://open-next.js.org/)
- [Next.js ISR](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration)
- [Notion API](https://developers.notion.com/)
- [AWS VPC Best Practices](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-best-practices.html)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)

---

## 補足: AstroとNext.jsの違い

| 項目 | Astro + SST | Next.js + OpenNext |
|------|-------------|-------------------|
| **SST Component** | `sst.aws.Astro` | `sst.aws.Nextjs` |
| **Live Lambda** | ✅ 対応 | ✅ 対応 |
| **VPC統合** | オプション | Live Lambda使用時必須 |
| **ISR** | 部分対応 | フル対応 |
| **デプロイ** | ほぼ同じ | ほぼ同じ |
| **ハマりポイント** | astro-sstバージョン | OpenNext設定 |

**Next.js特有の注意点:**
- OpenNext設定が複雑になる場合がある
- Middleware使用時のLambda@Edge制約
- App RouterとPages Routerで挙動が異なる
