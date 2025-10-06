# SST Pulumiで GitHub OIDC ロールを管理する方法

## 概要

CloudFormationではなく、SSTのPulumiを使ってGitHub OIDC IAMロールを管理できます。
`sst deploy --stage github-oidc`のような部分実行が可能です。

## メリット・デメリット

### ✅ SSTで管理するメリット

1. **統一された管理**: 全てがsst.config.ts内で完結
2. **TypeScript**: 型安全、自動補完
3. **部分デプロイ**: `--stage github-oidc`で分離実行
4. **依存関係解決**: Pulumiが自動管理
5. **状態管理**: SST統合の状態管理

### ❌ SSTで管理するデメリット

1. **循環依存の懸念**: GitHub ActionsがデプロイするIAMロールをSSTで管理
2. **初回デプロイ**: ローカルから手動実行必須
3. **緊急時の変更**: CI/CD経由になり即座に変更しづらい
4. **学習コスト**: Pulumi AWSリソースの書き方

### 💡 推奨アプローチ

**CloudFormation管理を推奨する理由:**
- **ブートストラップリソース**: CI/CD基盤は別管理が安全
- **変更頻度**: OIDCロールは滅多に変更しない
- **緊急対応**: AWS CLIで直接操作可能
- **責任分離**: インフラ基盤 vs アプリケーション

**SSTで管理する場合:**
- 小規模プロジェクト
- シングルアカウント
- チーム全員がSSTに習熟

---

## 実装例: SSTでOIDCロール管理

### sst.config.ts

```typescript
/// <reference path="./.sst/platform/config.d.ts" />

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
    // ========================================
    // GitHub OIDC ステージ（基盤インフラ）
    // ========================================
    if ($app.stage === "github-oidc") {
      // OIDC Provider（初回のみ作成）
      const oidcProvider = new aws.iam.OpenIdConnectProvider("GitHubOIDC", {
        url: "https://token.actions.githubusercontent.com",
        clientIdLists: ["sts.amazonaws.com"],
        thumbprintLists: [
          "6938fd4d98bab03faadb97b34396831e3780aea1",
          "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
        ],
      });

      // IAMポリシー: SST特有の権限を含む
      const sstDeployPolicy = new aws.iam.Policy("SSTDeployPolicy", {
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            // CloudFormation
            {
              Sid: "CloudFormationAccess",
              Effect: "Allow",
              Action: [
                "cloudformation:*",
              ],
              Resource: "*",
            },
            // S3: アプリバケット + SSTバケット
            {
              Sid: "S3Access",
              Effect: "Allow",
              Action: [
                "s3:*",
              ],
              Resource: [
                "arn:aws:s3:::magazine-cms-*",
                "arn:aws:s3:::magazine-cms-*/*",
                "arn:aws:s3:::sst-*",
                "arn:aws:s3:::sst-*/*",
              ],
            },
            // CloudFront
            {
              Sid: "CloudFrontAccess",
              Effect: "Allow",
              Action: [
                "cloudfront:*",
              ],
              Resource: "*",
            },
            // Lambda
            {
              Sid: "LambdaAccess",
              Effect: "Allow",
              Action: [
                "lambda:*",
              ],
              Resource: `arn:aws:lambda:*:${aws.getCallerIdentityOutput().accountId}:function:magazine-cms-*`,
            },
            // IAM: Lambda実行ロール
            {
              Sid: "IAMRoleAccess",
              Effect: "Allow",
              Action: [
                "iam:CreateRole",
                "iam:DeleteRole",
                "iam:GetRole",
                "iam:PassRole",
                "iam:AttachRolePolicy",
                "iam:DetachRolePolicy",
                "iam:PutRolePolicy",
                "iam:DeleteRolePolicy",
                "iam:GetRolePolicy",
                "iam:TagRole",
                "iam:UntagRole",
              ],
              Resource: `arn:aws:iam::${aws.getCallerIdentityOutput().accountId}:role/magazine-cms-*`,
            },
            // SSM: SST状態管理
            {
              Sid: "SSMParameterAccess",
              Effect: "Allow",
              Action: [
                "ssm:GetParameter",
                "ssm:GetParameters",
                "ssm:PutParameter",
                "ssm:DeleteParameter",
                "ssm:AddTagsToResource",
              ],
              Resource: `arn:aws:ssm:*:${aws.getCallerIdentityOutput().accountId}:parameter/sst/*`,
            },
            // VPC（Next.js用）
            {
              Sid: "VPCAccess",
              Effect: "Allow",
              Action: [
                "ec2:CreateVpc",
                "ec2:DeleteVpc",
                "ec2:DescribeVpcs",
                "ec2:CreateSubnet",
                "ec2:DeleteSubnet",
                "ec2:DescribeSubnets",
                "ec2:CreateRouteTable",
                "ec2:DeleteRouteTable",
                "ec2:CreateRoute",
                "ec2:DeleteRoute",
                "ec2:AssociateRouteTable",
                "ec2:CreateInternetGateway",
                "ec2:AttachInternetGateway",
                "ec2:CreateNatGateway",
                "ec2:DeleteNatGateway",
                "ec2:AllocateAddress",
                "ec2:ReleaseAddress",
                "ec2:CreateSecurityGroup",
                "ec2:DeleteSecurityGroup",
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:AuthorizeSecurityGroupEgress",
                "ec2:RevokeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupEgress",
                "ec2:CreateVpcEndpoint",
                "ec2:DeleteVpcEndpoint",
                "ec2:DescribeVpcEndpoints",
                "ec2:CreateTags",
              ],
              Resource: "*",
            },
            // 追加のサービス
            {
              Sid: "AdditionalServices",
              Effect: "Allow",
              Action: [
                "sts:GetCallerIdentity",
                "route53:*",
                "acm:*",
                "waf:*",
                "wafv2:*",
                "logs:*",
                "secretsmanager:*",
              ],
              Resource: "*",
            },
          ],
        }),
      });

      // GitHub Actions用IAMロール
      const githubRole = new aws.iam.Role("GitHubActionsRole", {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Federated: oidcProvider.arn,
              },
              Action: "sts:AssumeRoleWithWebIdentity",
              Condition: {
                StringEquals: {
                  "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                },
                StringLike: {
                  "token.actions.githubusercontent.com:sub": [
                    "repo:yourorg/magazine-cms:ref:refs/heads/main",
                    "repo:yourorg/magazine-cms:ref:refs/heads/develop",
                    "repo:yourorg/magazine-cms:ref:refs/heads/release/*",
                  ],
                },
              },
            },
          ],
        }),
        managedPolicyArns: [sstDeployPolicy.arn],
        tags: {
          Purpose: "GitHub Actions OIDC",
          ManagedBy: "SST",
        },
      });

      // 出力
      return {
        roleArn: githubRole.arn,
        roleName: githubRole.name,
      };
    }

    // ========================================
    // アプリケーションステージ（dev/stg/prod）
    // ========================================

    // VPC作成
    const vpc = new sst.aws.Vpc("AppVpc", {
      nat: $app.stage === "prod" ? "managed" : "ec2",
    });

    // Next.jsサイト
    const site = new sst.aws.Nextjs("Site", {
      vpc: {
        securityGroups: [/* ... */],
        subnets: vpc.privateSubnets,
      },
    });

    return {
      url: site.url,
    };
  },
});
```

---

## デプロイフロー

### 初回セットアップ（各環境ごと）

```bash
# 1. Dev環境のOIDCロール作成
AWS_PROFILE=magazine-cms-dev sst deploy --stage github-oidc

# 出力されたRole ARNをメモ
# 例: arn:aws:iam::123456789012:role/magazine-cms-github-oidc-GitHubActionsRole-xxx

# 2. GitHub Secretsに登録
gh secret set AWS_ROLE_ARN_DEV --body "arn:aws:iam::..."
gh secret set AWS_REGION_DEV --body "ap-northeast-1"

# 3. Stg/Prod環境も同様に実行
AWS_PROFILE=magazine-cms-stg sst deploy --stage github-oidc
AWS_PROFILE=magazine-cms-prod sst deploy --stage github-oidc
```

### アプリケーションデプロイ

```bash
# ローカルから
npm run deploy:dev   # → sst deploy --stage dev
npm run deploy:stg   # → sst deploy --stage stg
npm run deploy:prod  # → sst deploy --stage prod

# CI/CDから（GitHub Actionsが自動実行）
git push origin main  # → stg
git push origin release/v1.0.0  # → prod
```

---

## ステージ分離のメリット

### `--stage github-oidc` 分離

1. **責任範囲の明確化**
   - `github-oidc`: CI/CD基盤（変更頻度: 低）
   - `dev/stg/prod`: アプリケーション（変更頻度: 高）

2. **独立したライフサイクル**
   - OIDCロールは一度作成したら滅多に変更しない
   - アプリは頻繁にデプロイ

3. **安全性**
   - アプリのデプロイ失敗がOIDCロールに影響しない
   - ロールバック時の影響範囲が限定的

4. **マルチアカウント対応**
   - 各AWSアカウントで`github-oidc`ステージをデプロイ
   - アプリステージは環境ごとに異なるアカウント

---

## ディレクトリ構成例

```
magazine-cms/
├── sst.config.ts           # 全ステージの定義
├── package.json
├── .github/
│   └── workflows/
│       ├── deploy-dev.yml
│       ├── deploy-stg.yml
│       └── deploy-prod.yml
├── docs/
│   ├── SETUP.md
│   └── DEPLOYMENT.md
└── src/
    └── ...
```

---

## sst.config.ts の構造（推奨）

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
    // ========================================
    // ステージ判定で処理を分岐
    // ========================================

    // GitHub OIDC基盤ステージ
    if ($app.stage === "github-oidc") {
      return await deployGitHubOIDC();
    }

    // アプリケーションステージ（dev/stg/prod）
    return await deployApplication();
  },
});

// ========================================
// GitHub OIDC基盤デプロイ
// ========================================
async function deployGitHubOIDC() {
  // 既存のOIDC Provider確認
  const existingProviders = await aws.iam.getOpenIdConnectProviders({});
  const githubProvider = existingProviders.arns?.find(arn =>
    arn.includes("token.actions.githubusercontent.com")
  );

  let oidcProvider;
  if (githubProvider) {
    // 既存を使用
    oidcProvider = aws.iam.OpenIdConnectProvider.get(
      "GitHubOIDC",
      githubProvider
    );
  } else {
    // 新規作成
    oidcProvider = new aws.iam.OpenIdConnectProvider("GitHubOIDC", {
      // ...
    });
  }

  // IAMポリシー
  const sstDeployPolicy = new aws.iam.Policy("SSTDeployPolicy", {
    // ... 先ほどのポリシー定義
  });

  // GitHub Actions用ロール
  const githubRole = new aws.iam.Role("GitHubActionsRole", {
    // ... 先ほどのロール定義
  });

  return {
    roleArn: githubRole.arn,
    roleName: githubRole.name,
    oidcProviderArn: oidcProvider.arn,
  };
}

// ========================================
// アプリケーションデプロイ
// ========================================
async function deployApplication() {
  // VPC
  const vpc = new sst.aws.Vpc("AppVpc", {
    // ...
  });

  // Next.js
  const site = new sst.aws.Nextjs("Site", {
    // ...
  });

  return {
    url: site.url,
  };
}
```

---

## 実装パターン比較

### パターン1: 完全CloudFormation分離（現在の実装・推奨）

```
cloudformation/github-oidc-role.yml  ← 初回手動デプロイ
  ↓
GitHub Actions（OIDC認証）
  ↓
sst deploy --stage dev/stg/prod  ← アプリデプロイ
```

**メリット:**
- 循環依存なし
- 緊急時にAWS CLIで直接操作
- CI/CD基盤とアプリの明確な分離

**デメリット:**
- 2つの管理ツール（CloudFormation + SST）

---

### パターン2: SST完全統合（stage分離）

```
sst deploy --stage github-oidc  ← 初回ローカルから手動
  ↓
GitHub Actions（OIDC認証）
  ↓
sst deploy --stage dev/stg/prod  ← アプリデプロイ
```

**メリット:**
- 全てTypeScript（sst.config.ts）
- 統一された管理
- Pulumi状態管理

**デメリット:**
- 初回デプロイは手動必須
- OIDCロール変更もCI/CD経由

---

### パターン3: ハイブリッド（柔軟性重視）

```
# 基盤リソース: CloudFormation
cloudformation/
├── oidc-provider.yml      # OIDC Provider（1回のみ）
└── base-infrastructure.yml # VPC、WAF等

# アプリリソース: SST
sst.config.ts              # Next.js、Lambda等
```

**メリット:**
- 適材適所
- 変更頻度に応じた管理ツール選択

**デメリット:**
- 複雑性増加
- チーム学習コスト

---

## 実践的な推奨事項

### 小〜中規模プロジェクト
→ **パターン1（CloudFormation分離）** を推奨
- シンプル
- トラブル時の対応が容易
- 今回のAstro実装と同じ

### 大規模・複雑なプロジェクト
→ **パターン3（ハイブリッド）** を検討
- 基盤はCloudFormation/Terraform
- アプリケーションはSST
- 責任範囲が明確

### フルSST採用チーム
→ **パターン2（SST完全統合）** も選択肢
- チーム全員がSST習熟
- TypeScript統一
- 初回デプロイの手間は許容

---

## 移行手順（CloudFormation → SST）

もし将来的にSSTに統合したい場合:

```bash
# 1. CloudFormationスタック削除（リソースは保持）
aws cloudformation delete-stack \
  --stack-name magazine-cms-github-oidc \
  --retain-resources GitHubActionsRole

# 2. SSTでインポート
sst deploy --stage github-oidc --import

# 3. 既存リソースをPulumi管理下に移行
```

⚠️ **注意**: 慎重な計画と検証が必要

---

## まとめ

| 項目 | CloudFormation | SST（stage分離） |
|------|---------------|-----------------|
| **管理ツール** | AWS CLI | SST CLI |
| **定義言語** | YAML | TypeScript |
| **初回デプロイ** | AWS CLI | ローカルSST |
| **変更デプロイ** | AWS CLI or CI/CD | CI/CD or ローカル |
| **緊急対応** | ⭐️ 容易 | やや複雑 |
| **学習コスト** | 低 | 中〜高 |
| **責任分離** | ⭐️ 明確 | コード内分離 |
| **統一性** | - | ⭐️ TypeScript統一 |

### 💡 最終推奨

**今回のAstro実装と同じく、CloudFormation分離を推奨します。**

理由:
1. CI/CD基盤は安定性最優先
2. トラブル時の対応が容易
3. 責任範囲が明確
4. チームメンバーの学習コスト低減

ただし、将来的にSSTへの統合も技術的には可能です。
