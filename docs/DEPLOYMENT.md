# デプロイメントガイド

## GitHub Actions + OIDC による AWS へのデプロイ

このプロジェクトは、GitHub Actions と OIDC（OpenID Connect）を使用して、AWS に安全に継続デプロイされます。

### セットアップ手順

#### 1. IAM ロールの作成

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
