# セットアップガイド

このドキュメントでは、開発環境のセットアップからデプロイまでの詳細な手順を説明します。

## 目次

1. [前提条件](#前提条件)
2. [プロジェクトのセットアップ](#プロジェクトのセットアップ)
3. [AWS環境のセットアップ](#aws環境のセットアップ)
4. [GitHub Actions + OIDCのセットアップ](#github-actions--oidcのセットアップ)
5. [トラブルシューティング](#トラブルシューティング)

## 前提条件

### 必要なツール

- **Node.js**: 20.x以上
- **npm**: 10.x以上
- **AWS CLI**: 2.x以上
- **GitHub CLI (gh)**: 2.x以上
- **Git**: 2.x以上

### インストール確認

```bash
node --version  # v20.x.x 以上
npm --version   # 10.x.x 以上
aws --version   # aws-cli/2.x.x 以上
gh --version    # gh version 2.x.x 以上
```

## プロジェクトのセットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/ida29/job-fair-search.git
cd job-fair-search
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. ローカル開発サーバーの起動

**通常の開発（推奨）:**
```bash
npm run dev
```

ブラウザで http://localhost:4321 を開いて動作確認します。

**Live Lambda付き開発:**
```bash
# AWS SSOログイン
npm run sso

# SST開発モード起動
npm run dev:sst
```

SST開発モードでは:
- Astro開発サーバーが自動起動（http://localhost:4321）
- AWS Lambda関数がローカルで実行される（Live Lambda）
- コード変更時に自動的にLambdaが更新される

## AWS環境のセットアップ

このプロジェクトは3つの環境（dev, stg, prod）を使用します。各環境は別々のAWSアカウントで管理されます。

### AWS SSO設定

各環境用のAWS SSOプロファイルを設定します：

```bash
# AWS SSO設定（初回のみ）
aws configure sso

# プロファイル名の例:
# - job-fair-search-dev
# - job-fair-search-stg
# - job-fair-search-prod
```

各プロファイルに対して以下の設定を行います：
- **SSO Start URL**: 組織のSSO URL
- **SSO Region**: ap-northeast-1（東京リージョン）
- **Account**: 各環境のAWSアカウントID
- **Role**: AdministratorAccess
- **Default Region**: ap-northeast-1

### SSO ログイン

```bash
# Dev環境
aws sso login --profile job-fair-search-dev

# Stg環境
aws sso login --profile job-fair-search-stg

# Prod環境
aws sso login --profile job-fair-search-prod
```

### アカウント確認

```bash
# 現在のアカウント情報を確認
aws sts get-caller-identity --profile job-fair-search-dev
```

## GitHub Actions + OIDCのセットアップ

GitHub ActionsからAWSへ安全にアクセスするため、OIDCを使用します。

### 1. IAMロールの作成

各環境（stg, prod）に対してCloudFormationスタックを作成します：

```bash
# 環境変数を設定
export GITHUB_ORG="ida29"
export GITHUB_REPO="job-fair-search"

# STG環境のIAMロール作成
aws cloudformation create-stack \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --template-body file://cloudformation/github-oidc-role.yml \
  --parameters \
    ParameterKey=GitHubOrg,ParameterValue=${GITHUB_ORG} \
    ParameterKey=GitHubRepo,ParameterValue=${GITHUB_REPO} \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-1 \
  --profile job-fair-search-stg

# 完了を待つ
aws cloudformation wait stack-create-complete \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --region ap-northeast-1 \
  --profile job-fair-search-stg

# PROD環境のIAMロール作成
aws cloudformation create-stack \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --template-body file://cloudformation/github-oidc-role.yml \
  --parameters \
    ParameterKey=GitHubOrg,ParameterValue=${GITHUB_ORG} \
    ParameterKey=GitHubRepo,ParameterValue=${GITHUB_REPO} \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-1 \
  --profile job-fair-search-prod

# 完了を待つ
aws cloudformation wait stack-create-complete \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --region ap-northeast-1 \
  --profile job-fair-search-prod
```

### 2. ロールARNの取得

```bash
# STG環境のロールARN
aws cloudformation describe-stacks \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --query 'Stacks[0].Outputs[?OutputKey==`RoleArn`].OutputValue' \
  --output text \
  --region ap-northeast-1 \
  --profile job-fair-search-stg

# PROD環境のロールARN
aws cloudformation describe-stacks \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --query 'Stacks[0].Outputs[?OutputKey==`RoleArn`].OutputValue' \
  --output text \
  --region ap-northeast-1 \
  --profile job-fair-search-prod
```

### 3. GitHub Secretsの設定

GitHub CLIを使用してシークレットを設定します：

```bash
# GitHub CLIで認証（初回のみ）
gh auth login

# STG環境のシークレット設定
export STG_ROLE_ARN="arn:aws:iam::088206884575:role/job-fair-search-github-actions-role"
gh secret set AWS_ROLE_ARN_STG --body "${STG_ROLE_ARN}"
gh secret set AWS_REGION_STG --body "ap-northeast-1"

# PROD環境のシークレット設定
export PROD_ROLE_ARN="arn:aws:iam::390258260748:role/job-fair-search-github-actions-role"
gh secret set AWS_ROLE_ARN_PROD --body "${PROD_ROLE_ARN}"
gh secret set AWS_REGION_PROD --body "ap-northeast-1"

# 設定確認
gh secret list
```

### 4. デプロイテスト

#### ローカルでのデプロイ

```bash
# Dev環境（ローカルテスト用）
AWS_PROFILE=job-fair-search-dev npx sst deploy --stage dev

# Stg環境（ローカルテスト用）
AWS_PROFILE=job-fair-search-stg npx sst deploy --stage stg

# Prod環境（ローカルテスト用）
AWS_PROFILE=job-fair-search-prod npx sst deploy --stage prod
```

#### GitHub Actionsでの自動デプロイ

```bash
# STG環境へのデプロイ（mainブランチにプッシュ）
git push origin main

# PROD環境へのデプロイ（タグを作成）
git tag v0.0.1
git push origin v0.0.1
```

## IAMポリシーの詳細

作成されるIAMロールには以下の権限が付与されます：

### 主要な権限

1. **CloudFormation**: スタックの作成・更新・削除
2. **S3**: アセットとステートファイルの管理
3. **CloudFront**: CDNの管理
4. **Lambda**: サーバーレス関数の管理
5. **IAM**: Lambda実行ロールの管理
6. **SSM Parameter Store**: SSTステート管理

### セキュリティ設計

- **最小権限の原則**: 必要最小限の権限のみ付与
- **リソース制限**: プレフィックスベースでリソースを制限
- **ブランチ/タグ制限**: mainブランチとv*タグのみデプロイ可能
- **OIDC認証**: 長期認証情報を使用しない

## トラブルシューティング

### デプロイロックエラー

同時デプロイによりロックが発生した場合：

```bash
# ロック解除
AWS_PROFILE=job-fair-search-stg npx sst unlock --stage stg
```

### 権限エラー

IAMポリシーで権限不足のエラーが出た場合、CloudFormationテンプレートを更新：

```bash
# スタック更新
aws cloudformation update-stack \
  --stack-name ${GITHUB_REPO}-github-oidc \
  --template-body file://cloudformation/github-oidc-role.yml \
  --parameters \
    ParameterKey=GitHubOrg,ParameterValue=${GITHUB_ORG} \
    ParameterKey=GitHubRepo,ParameterValue=${GITHUB_REPO} \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-1 \
  --profile job-fair-search-stg
```

### GitHub Actions失敗時

1. **ログの確認**
   ```bash
   gh run list --limit 5
   gh run view <run-id> --log
   ```

2. **ロールの信頼関係確認**
   ```bash
   aws iam get-role \
     --role-name job-fair-search-github-actions-role \
     --query 'Role.AssumeRolePolicyDocument' \
     --profile job-fair-search-stg
   ```

### SST関連のエラー

```bash
# キャッシュのクリア
rm -rf .sst

# 依存関係の再インストール
rm -rf node_modules package-lock.json
npm install
```

## 次のステップ

- [デプロイメントガイド](./DEPLOYMENT.md)を確認
- Astroのページを追加（`src/pages/`）
- コンポーネントを作成（`src/components/`）
- APIエンドポイントを実装（`src/pages/api/`）

## 参考資料

- [Astro Documentation](https://docs.astro.build)
- [SST Documentation](https://sst.dev/)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
