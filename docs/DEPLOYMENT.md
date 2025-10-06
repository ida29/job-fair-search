# デプロイメントガイド

このドキュメントでは、GitHub Actions + OIDCを使用したAWSへの安全な継続デプロイについて説明します。

## 目次

1. [デプロイ概要](#デプロイ概要)
2. [環境構成](#環境構成)
3. [自動デプロイ](#自動デプロイ)
4. [手動デプロイ](#手動デプロイ)
5. [運用ガイド](#運用ガイド)
6. [トラブルシューティング](#トラブルシューティング)

## デプロイ概要

このプロジェクトは、GitHub Actions と OIDC（OpenID Connect）を使用して、AWS に安全に継続デプロイされます。

### アーキテクチャ

```
GitHub Actions (OIDC)
  ↓ 一時的な認証情報
IAM Role（最小権限）
  ↓
SST Deploy
  ↓
CloudFront + Lambda@Edge + S3
```

## 環境構成

| 環境 | トリガー | AWS アカウント | デプロイ先 | 用途 |
|------|---------|---------------|-----------|------|
| **dev** | ローカル手動 | dev (861990677232) | https://d22cwy88fjmmi4.cloudfront.net | 開発・検証用 |
| **stg** | main プッシュ | stg (088206884575) | https://d2027pdceu86hb.cloudfront.net | ステージング環境 |
| **prod** | v* タグ | prod (390258260748) | https://d3f5ylooslds4t.cloudfront.net | 本番環境 |

## 自動デプロイ

### STG環境（mainブランチ）

mainブランチにプッシュすると、自動的にSTG環境にデプロイされます。

```bash
# 開発完了後、mainブランチにマージ
git checkout main
git pull origin main
git merge feature/my-feature
git push origin main
```

GitHub Actionsが自動的に以下を実行：
1. コードチェックアウト
2. 依存関係インストール
3. OIDC認証でAWS STGアカウントにアクセス
4. `npx sst deploy --stage stg` を実行

### PROD環境（v*タグ）

バージョンタグを作成してプッシュすると、本番環境にデプロイされます。

```bash
# バージョンタグを作成
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actionsが自動的にPROD環境にデプロイします。

**バージョニング規則:**
- `v1.0.0`: メジャーリリース
- `v1.1.0`: マイナー機能追加
- `v1.0.1`: パッチ・バグフィックス

### デプロイ状況の確認

```bash
# GitHub CLIでワークフロー確認
gh run list --limit 5

# 特定のワークフローを監視
gh run watch <run-id>

# ログの確認
gh run view <run-id> --log
```

## ローカル開発

### 通常の開発

```bash
npm run dev
```

Astro開発サーバーが http://localhost:4321 で起動します。
静的ページやコンポーネントの開発に最適です。

### SST Live Lambda開発モード

```bash
# AWS SSOログイン
npm run sso

# SST開発モード起動
npm run dev:sst
```

SST開発モードの特徴:
- **Live Lambda**: Lambdaコードの変更が即座に反映
- **AWS統合**: 実際のAWS環境と接続して開発
- **環境変数**: SSTリソースの値が自動注入
- **ホットリロード**: Astroとの統合でフルスタック開発

アクセスURL: http://localhost:4321

### 開発モードの選択

| 用途 | コマンド | メリット |
|------|---------|---------|
| 通常の開発 | `npm run dev` | 高速、AWS不要 |
| API/Lambda開発 | `npm run dev:sst` | 実環境と同じ挙動 |

## 手動デプロイ

### ローカルからのデプロイ

各環境に手動でデプロイする場合：

```bash
# Dev環境
npm run deploy:dev

# Stg環境
npm run deploy:stg

# Prod環境
npm run deploy:prod
```

または直接実行：

```bash
# Dev環境
AWS_PROFILE=job-fair-search-dev npx sst deploy --stage dev

# Stg環境
AWS_PROFILE=job-fair-search-stg npx sst deploy --stage stg

# Prod環境
AWS_PROFILE=job-fair-search-prod npx sst deploy --stage prod
```

### デプロイオプション

```bash
# 詳細ログ付きデプロイ
npx sst deploy --stage stg --print-logs

# 特定のリソースのみデプロイ
npx sst deploy --stage stg --target Web

# 確認なしでデプロイ
npx sst deploy --stage stg --yes
```

## 運用ガイド

### リソースの確認

```bash
# デプロイされているリソース一覧
npx sst console --stage stg

# CloudFormationスタック確認
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --profile job-fair-search-stg
```

### ログの確認

```bash
# Lambda関数のログ
aws logs tail /aws/lambda/job-fair-search-stg-WebServerApnortheast1Function \
  --follow \
  --profile job-fair-search-stg

# CloudFrontのアクセスログ（S3に保存されている場合）
aws s3 ls s3://job-fair-search-stg-logs/ --profile job-fair-search-stg
```

### リソースの削除

**⚠️ 注意**: 本番環境（prod）は保護されており、削除時にretainされます。

```bash
# Dev環境の削除
AWS_PROFILE=job-fair-search-dev npx sst remove --stage dev

# Stg環境の削除
AWS_PROFILE=job-fair-search-stg npx sst remove --stage stg

# Prod環境の削除（リソースは保持される）
AWS_PROFILE=job-fair-search-prod npx sst remove --stage prod
```

### ロールバック

問題が発生した場合、以前のタグを再デプロイ：

```bash
# 前のバージョンに戻す
git tag -d v1.0.1
git push origin :v1.0.1

# 正常なバージョンを再デプロイ
git tag v1.0.0-rollback
git push origin v1.0.0-rollback
```

または、CloudFormationスタックを前の状態に戻す：

```bash
aws cloudformation update-stack \
  --stack-name <stack-name> \
  --use-previous-template \
  --profile job-fair-search-prod
```

### モニタリング

#### CloudWatch メトリクス

- Lambda関数の実行回数・エラー率
- CloudFrontのリクエスト数
- S3のストレージ使用量

```bash
# Lambda関数のメトリクス確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=job-fair-search-prod-WebServerApnortheast1Function \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --profile job-fair-search-prod
```

## トラブルシューティング

### セットアップ手順

初回セットアップについては [SETUP.md](./SETUP.md) を参照してください。

### IAM ロールの作成

CloudFormation テンプレートを使用して、GitHub Actions 用の IAM ロールを作成します。

```bash
# 環境変数を設定
export AWS_ACCOUNT_ID="your-aws-account-id"
export GITHUB_ORG="your-github-org"
export GITHUB_REPO="job-fair-search"
export AWS_REGION="ap-northeast-1"  # または他のリージョン

# CloudFormation スタックを作成
aws cloudformation create-stack \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --template-body file://cloudformation/github-oidc-role.yml \
  --parameters \
    ParameterKey=GitHubOrg,ParameterValue=${GITHUB_ORG} \
    ParameterKey=GitHubRepo,ParameterValue=${GITHUB_REPO} \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ${AWS_REGION}

# スタック作成の完了を待つ
aws cloudformation wait stack-create-complete \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --region ${AWS_REGION}

# ロール ARN を取得
aws cloudformation describe-stacks \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --query 'Stacks[0].Outputs[?OutputKey==`RoleArn`].OutputValue' \
  --output text \
  --region ${AWS_REGION}
```

#### 2. GitHub Secrets の設定

GitHub CLI を使用して、必要なシークレットを設定します。

```bash
# GitHub CLI で認証（初回のみ）
gh auth login

# Secrets を設定
export ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --query 'Stacks[0].Outputs[?OutputKey==`RoleArn`].OutputValue' \
  --output text \
  --region ${AWS_REGION})

gh secret set AWS_ROLE_ARN --body "${ROLE_ARN}"
gh secret set AWS_REGION --body "${AWS_REGION}"

# 設定を確認
gh secret list
```

#### 3. デプロイの実行

以下のいずれかの方法でデプロイが自動的に実行されます：

- **main ブランチへのプッシュ**: `dev` ステージにデプロイ
- **`v*` タグの作成**: `production` ステージにデプロイ
- **手動実行**: GitHub Actions の UI から `workflow_dispatch` を実行

```bash
# 開発環境へのデプロイ（main ブランチにプッシュ）
git push origin main

# 本番環境へのデプロイ（タグを作成）
git tag v1.0.0
git push origin v1.0.0
```

### アーキテクチャ

このプロジェクトは、SST を使用して以下の 2 つの構成でデプロイできます：

1. **WebSSG (静的サイト)**
   - S3: 静的ファイルのホスティング
   - CloudFront: CDN による配信

2. **WebSSR (サーバーサイドレンダリング)**
   - Lambda@Edge: サーバーサイドレンダリング
   - CloudFront: CDN による配信
   - S3: アセットの保存

### セキュリティ

- **最小権限の原則**: IAM ロールは必要最小限の権限のみを付与
- **OIDC による認証**: 長期的な認証情報を保存せず、一時的な認証情報を使用
- **ブランチ/タグ制限**: `main` ブランチと `v*` タグからのみデプロイ可能
- **リソース制限**: IAM ポリシーでリソース名にプレフィックスを適用

### トラブルシューティング

#### デプロイが失敗する場合

1. **GitHub Secrets が正しく設定されているか確認**
   ```bash
   gh secret list
   ```

2. **IAM ロールの信頼関係を確認**
   ```bash
   aws iam get-role \
     --role-name ${GITHUB_REPO}-github-actions-role \
     --query 'Role.AssumeRolePolicyDocument'
   ```

3. **GitHub Actions のログを確認**
   - リポジトリの "Actions" タブから詳細なログを確認

#### OIDC Provider が既に存在する場合

既に GitHub OIDC Provider が存在する場合は、以下のようにパラメータを指定してスタックを作成します：

```bash
# 既存の OIDC Provider ARN を取得
export OIDC_PROVIDER_ARN=$(aws iam list-open-id-connect-providers \
  --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')].Arn" \
  --output text)

# CloudFormation スタックを作成（OIDC Provider ARN を指定）
aws cloudformation create-stack \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --template-body file://cloudformation/github-oidc-role.yml \
  --parameters \
    ParameterKey=GitHubOrg,ParameterValue=${GITHUB_ORG} \
    ParameterKey=GitHubRepo,ParameterValue=${GITHUB_REPO} \
    ParameterKey=OIDCProviderArn,ParameterValue=${OIDC_PROVIDER_ARN} \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ${AWS_REGION}
```

### リソースの削除

プロジェクトを完全に削除する場合は、以下の手順を実行します：

```bash
# SST のリソースを削除
npx sst remove --stage dev
npx sst remove --stage production

# CloudFormation スタックを削除
aws cloudformation delete-stack \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --region ${AWS_REGION}
```

### 参考資料

- [SST Documentation](https://sst.dev/)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
