/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Next.js + OpenNext + Notion CMS
 * SST Configuration with GitHub OIDC
 *
 * Stages:
 * - github-oidc: GitHub Actions用IAMロール（初回のみ）
 * - dev/stg/prod: アプリケーション環境
 */

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
    // GitHub OIDC基盤ステージ
    // ========================================
    if ($app.stage === "github-oidc") {
      return await deployGitHubOIDC();
    }

    // ========================================
    // アプリケーションステージ（dev/stg/prod）
    // ========================================
    return await deployApplication();
  },
});

// ========================================
// GitHub OIDC基盤デプロイ関数
// ========================================
async function deployGitHubOIDC() {
  const accountId = aws.getCallerIdentityOutput().accountId;
  const region = aws.getRegionOutput().name;

  // 既存OIDC Provider確認
  const existingProviders = await aws.iam.getOpenIdConnectProviders({});
  const githubProviderArn = existingProviders.arns?.find(arn =>
    arn.includes("token.actions.githubusercontent.com")
  );

  let oidcProvider: aws.iam.OpenIdConnectProvider;

  if (githubProviderArn) {
    // 既存を参照
    console.log("Using existing GitHub OIDC Provider:", githubProviderArn);
    oidcProvider = aws.iam.OpenIdConnectProvider.get(
      "GitHubOIDC",
      githubProviderArn
    );
  } else {
    // 新規作成
    console.log("Creating new GitHub OIDC Provider");
    oidcProvider = new aws.iam.OpenIdConnectProvider("GitHubOIDC", {
      url: "https://token.actions.githubusercontent.com",
      clientIdLists: ["sts.amazonaws.com"],
      thumbprintLists: [
        "6938fd4d98bab03faadb97b34396831e3780aea1",
        "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
      ],
      tags: {
        ManagedBy: "SST",
        Purpose: "GitHub Actions OIDC",
      },
    });
  }

  // SST特有の権限を含むポリシー
  const sstDeployPolicy = new aws.iam.Policy("SSTDeployPolicy", {
    name: "magazine-cms-sst-deploy-policy",
    description: "Minimal permissions for SST deployment with lessons learned",
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        // CloudFormation
        {
          Sid: "CloudFormationAccess",
          Effect: "Allow",
          Action: [
            "cloudformation:CreateStack",
            "cloudformation:UpdateStack",
            "cloudformation:DeleteStack",
            "cloudformation:DescribeStacks",
            "cloudformation:DescribeStackEvents",
            "cloudformation:DescribeStackResources",
            "cloudformation:GetTemplate",
            "cloudformation:ValidateTemplate",
            "cloudformation:CreateChangeSet",
            "cloudformation:DescribeChangeSet",
            "cloudformation:ExecuteChangeSet",
            "cloudformation:DeleteChangeSet",
            "cloudformation:ListStacks",
          ],
          Resource: "*",
        },
        // S3: アプリバケット + SSTバケット
        {
          Sid: "S3Access",
          Effect: "Allow",
          Action: [
            "s3:CreateBucket",
            "s3:DeleteBucket",
            "s3:ListBucket",
            "s3:GetBucketLocation",
            "s3:GetBucketPolicy",
            "s3:PutBucketPolicy",
            "s3:DeleteBucketPolicy",
            "s3:PutBucketWebsite",
            "s3:PutBucketVersioning",
            "s3:PutBucketCORS",
            "s3:PutObject",
            "s3:GetObject",
            "s3:DeleteObject",
            "s3:PutBucketPublicAccessBlock",
            "s3:PutLifecycleConfiguration",
            "s3:PutObjectTagging", // 💡 重要: SST deployで必要
            "s3:GetObjectTagging",
            "s3:DeleteObjectTagging",
          ],
          Resource: [
            "arn:aws:s3:::magazine-cms-*",
            "arn:aws:s3:::magazine-cms-*/*",
            "arn:aws:s3:::sst-*", // 💡 SSTの状態管理バケット
            "arn:aws:s3:::sst-*/*",
          ],
        },
        // CloudFront
        {
          Sid: "CloudFrontAccess",
          Effect: "Allow",
          Action: [
            "cloudfront:CreateDistribution",
            "cloudfront:UpdateDistribution",
            "cloudfront:DeleteDistribution",
            "cloudfront:GetDistribution",
            "cloudfront:GetDistributionConfig",
            "cloudfront:ListDistributions",
            "cloudfront:TagResource",
            "cloudfront:UntagResource",
            "cloudfront:CreateInvalidation",
            "cloudfront:GetInvalidation",
            "cloudfront:CreateOriginAccessControl",
            "cloudfront:GetOriginAccessControl",
            "cloudfront:UpdateOriginAccessControl",
            "cloudfront:DeleteOriginAccessControl",
            "cloudfront:CreateFunction",
            "cloudfront:UpdateFunction",
            "cloudfront:DeleteFunction",
            "cloudfront:PublishFunction",
          ],
          Resource: "*",
        },
        // Lambda
        {
          Sid: "LambdaAccess",
          Effect: "Allow",
          Action: [
            "lambda:CreateFunction",
            "lambda:UpdateFunctionCode",
            "lambda:UpdateFunctionConfiguration",
            "lambda:DeleteFunction",
            "lambda:GetFunction",
            "lambda:GetFunctionConfiguration",
            "lambda:GetFunctionCodeSigningConfig", // 💡 重要: SST deployで必要
            "lambda:PublishVersion",
            "lambda:ListVersionsByFunction",
            "lambda:CreateAlias",
            "lambda:UpdateAlias",
            "lambda:DeleteAlias",
            "lambda:GetAlias",
            "lambda:InvokeFunction",
            "lambda:AddPermission",
            "lambda:RemovePermission",
            "lambda:TagResource",
            "lambda:UntagResource",
            "lambda:PutFunctionConcurrency",
            "lambda:DeleteFunctionConcurrency",
          ],
          Resource: `arn:aws:lambda:*:${accountId}:function:magazine-cms-*`,
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
            "iam:UpdateAssumeRolePolicy",
          ],
          Resource: `arn:aws:iam::${accountId}:role/magazine-cms-*`,
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
            "ssm:RemoveTagsFromResource",
          ],
          Resource: `arn:aws:ssm:*:${accountId}:parameter/sst/*`, // 💡 /sst/* 全体
        },
        // VPC関連（Next.js用）
        {
          Sid: "VPCAccess",
          Effect: "Allow",
          Action: [
            "ec2:CreateVpc",
            "ec2:DeleteVpc",
            "ec2:DescribeVpcs",
            "ec2:ModifyVpcAttribute",
            "ec2:CreateSubnet",
            "ec2:DeleteSubnet",
            "ec2:DescribeSubnets",
            "ec2:CreateRouteTable",
            "ec2:DeleteRouteTable",
            "ec2:DescribeRouteTables",
            "ec2:CreateRoute",
            "ec2:DeleteRoute",
            "ec2:AssociateRouteTable",
            "ec2:DisassociateRouteTable",
            "ec2:CreateInternetGateway",
            "ec2:AttachInternetGateway",
            "ec2:DetachInternetGateway",
            "ec2:DeleteInternetGateway",
            "ec2:DescribeInternetGateways",
            "ec2:CreateNatGateway",
            "ec2:DeleteNatGateway",
            "ec2:DescribeNatGateways",
            "ec2:AllocateAddress",
            "ec2:ReleaseAddress",
            "ec2:DescribeAddresses",
            "ec2:CreateSecurityGroup",
            "ec2:DeleteSecurityGroup",
            "ec2:DescribeSecurityGroups",
            "ec2:AuthorizeSecurityGroupIngress",
            "ec2:AuthorizeSecurityGroupEgress",
            "ec2:RevokeSecurityGroupIngress",
            "ec2:RevokeSecurityGroupEgress",
            "ec2:CreateVpcEndpoint",
            "ec2:DeleteVpcEndpoint",
            "ec2:DescribeVpcEndpoints",
            "ec2:ModifyVpcEndpoint",
            "ec2:CreateTags",
            "ec2:DescribeTags",
          ],
          Resource: "*",
        },
        // WAF
        {
          Sid: "WAFAccess",
          Effect: "Allow",
          Action: [
            "wafv2:CreateWebACL",
            "wafv2:UpdateWebACL",
            "wafv2:DeleteWebACL",
            "wafv2:GetWebACL",
            "wafv2:ListWebACLs",
            "wafv2:AssociateWebACL",
            "wafv2:DisassociateWebACL",
            "wafv2:TagResource",
            "wafv2:UntagResource",
          ],
          Resource: "*",
        },
        // Route53（カスタムドメイン使用時）
        {
          Sid: "Route53Access",
          Effect: "Allow",
          Action: [
            "route53:ListHostedZones",
            "route53:GetHostedZone",
            "route53:ChangeResourceRecordSets",
            "route53:GetChange",
            "route53:ListResourceRecordSets",
          ],
          Resource: "*",
        },
        // ACM（SSL証明書）
        {
          Sid: "ACMAccess",
          Effect: "Allow",
          Action: [
            "acm:ListCertificates",
            "acm:DescribeCertificate",
            "acm:RequestCertificate",
            "acm:DeleteCertificate",
            "acm:AddTagsToCertificate",
          ],
          Resource: "*",
        },
        // CloudWatch Logs
        {
          Sid: "LogsAccess",
          Effect: "Allow",
          Action: [
            "logs:CreateLogGroup",
            "logs:DeleteLogGroup",
            "logs:DescribeLogGroups",
            "logs:PutRetentionPolicy",
            "logs:TagLogGroup",
            "logs:UntagLogGroup",
          ],
          Resource: `arn:aws:logs:*:${accountId}:log-group:/aws/lambda/magazine-cms-*`,
        },
        // Secrets Manager（必要に応じて）
        {
          Sid: "SecretsAccess",
          Effect: "Allow",
          Action: [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
          ],
          Resource: `arn:aws:secretsmanager:*:${accountId}:secret:magazine-cms/*`,
        },
        // その他
        {
          Sid: "AdditionalServices",
          Effect: "Allow",
          Action: [
            "sts:GetCallerIdentity",
          ],
          Resource: "*",
        },
      ],
    }),
    tags: {
      ManagedBy: "SST",
      Stage: "github-oidc",
    },
  });

  // GitHub Actions用IAMロール
  const githubRole = new aws.iam.Role("GitHubActionsRole", {
    name: "magazine-cms-github-actions-role",
    assumeRolePolicy: oidcProvider.arn.apply(providerArn =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Federated: providerArn,
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
      })
    ),
    managedPolicyArns: [sstDeployPolicy.arn],
    tags: {
      Purpose: "GitHub Actions OIDC",
      ManagedBy: "SST",
      Stage: "github-oidc",
    },
  });

  // 出力
  return {
    oidcProviderArn: oidcProvider.arn,
    roleArn: githubRole.arn,
    roleName: githubRole.name,
    accountId: accountId,
    region: region,
  };
}

// ========================================
// アプリケーションデプロイ関数
// ========================================
async function deployApplication() {
  const accountId = aws.getCallerIdentityOutput().accountId;

  // ========================================
  // VPC構築
  // ========================================
  const vpc = new sst.aws.Vpc("AppVpc", {
    // Prodはマルチaz、Dev/Stgはシングルでコスト削減
    nat: $app.stage === "prod" ? "managed" : "ec2",
    az: $app.stage === "prod" ? 2 : 1,
  });

  // VPC Endpoint: S3（Gateway型、無料）
  const s3Endpoint = new aws.ec2.VpcEndpoint("S3Endpoint", {
    vpcId: vpc.id,
    serviceName: `com.amazonaws.${aws.getRegionOutput().name}.s3`,
    vpcEndpointType: "Gateway",
    routeTableIds: vpc.privateSubnets.apply(subnets =>
      // Route tableを取得する必要あり（実装時に調整）
      []
    ),
    tags: {
      Name: `magazine-cms-${$app.stage}-s3-endpoint`,
      Environment: $app.stage,
      ManagedBy: "SST",
    },
  });

  // Lambda用セキュリティグループ
  const lambdaSg = new aws.ec2.SecurityGroup("LambdaSg", {
    vpcId: vpc.id,
    description: "Security group for Lambda functions",
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow all outbound traffic",
      },
    ],
    tags: {
      Name: `magazine-cms-${$app.stage}-lambda-sg`,
      Environment: $app.stage,
      ManagedBy: "SST",
    },
  });

  // ========================================
  // WAF構築
  // ========================================
  const webAcl = new aws.wafv2.WebAcl("SiteWaf", {
    name: `magazine-cms-${$app.stage}-waf`,
    description: "WAF for Next.js site",
    scope: "CLOUDFRONT",
    defaultAction: {
      allow: {},
    },
    rules: [
      // Rate limiting
      {
        name: "RateLimit",
        priority: 1,
        action: {
          block: {},
        },
        statement: {
          rateBasedStatement: {
            limit: 2000,
            aggregateKeyType: "IP",
          },
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudwatchMetricsEnabled: true,
          metricName: "RateLimit",
        },
      },
      // AWS Managed Rules: Core Rule Set
      {
        name: "AWSManagedRulesCommonRuleSet",
        priority: 2,
        overrideAction: {
          none: {},
        },
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesCommonRuleSet",
          },
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudwatchMetricsEnabled: true,
          metricName: "AWSManagedRulesCommonRuleSet",
        },
      },
      // AWS Managed Rules: Known Bad Inputs
      {
        name: "AWSManagedRulesKnownBadInputsRuleSet",
        priority: 3,
        overrideAction: {
          none: {},
        },
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesKnownBadInputsRuleSet",
          },
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudwatchMetricsEnabled: true,
          metricName: "AWSManagedRulesKnownBadInputsRuleSet",
        },
      },
    ],
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudwatchMetricsEnabled: true,
      metricName: `magazine-cms-${$app.stage}-waf`,
    },
    tags: {
      Environment: $app.stage,
      ManagedBy: "SST",
    },
  });

  // ========================================
  // Next.jsサイト
  // ========================================
  const site = new sst.aws.Nextjs("Site", {
    path: "./",

    // VPC統合（Live Lambda用）
    vpc: {
      securityGroups: [lambdaSg.id],
      subnets: vpc.privateSubnets,
    },

    // 環境変数
    environment: {
      NEXT_PUBLIC_STAGE: $app.stage,
      // Notion API Key（SST Secretから注入）
      NOTION_API_KEY: new sst.Secret("NotionApiKey").value,
      NOTION_INTEGRATION_TOKEN: new sst.Secret("NotionIntegrationToken").value,
    },

    // Lambda設定
    server: {
      memory: $app.stage === "prod" ? "2 GB" : "1 GB",
      timeout: "30 seconds",
      logging: {
        retention: $app.stage === "prod" ? "1 month" : "1 week",
      },
    },

    // CloudFront設定
    transform: {
      cdn: {
        // WAF関連付け
        webAclId: webAcl.arn,

        // キャッシュ設定
        defaultCacheBehavior: {
          compress: true,
        },

        // カスタムドメイン（prod のみ）
        ...(($app.stage === "prod") && {
          aliases: ["magazine.example.com"],
          viewerCertificate: {
            acmCertificateArn: "<ACM証明書ARN>",
            sslSupportMethod: "sni-only",
          },
        }),
      },
    },

    // タグ
    tags: {
      Environment: $app.stage,
      Project: "magazine-cms",
      ManagedBy: "SST",
    },
  });

  // ========================================
  // CloudWatch Alarms
  // ========================================
  const errorAlarm = new aws.cloudwatch.MetricAlarm("LambdaErrorAlarm", {
    name: `magazine-cms-${$app.stage}-lambda-errors`,
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 2,
    metricName: "Errors",
    namespace: "AWS/Lambda",
    period: 300,
    statistic: "Sum",
    threshold: 10,
    alarmDescription: "Lambda error rate is too high",
    dimensions: {
      FunctionName: site.nodes.server.name, // Next.js Lambda関数名
    },
    tags: {
      Environment: $app.stage,
      ManagedBy: "SST",
    },
  });

  // ========================================
  // 出力
  // ========================================
  return {
    url: site.url,
    vpcId: vpc.id,
    wafAclArn: webAcl.arn,
  };
}
```

---

## 使い方

### 初回セットアップ

```bash
# 1. Dev環境のOIDCロールをデプロイ
npm run sso:dev
npm run deploy:oidc:dev

# 出力例:
# ✓ Complete
#   roleArn: arn:aws:iam::123456789012:role/magazine-cms-github-actions-role
#   roleName: magazine-cms-github-actions-role

# 2. GitHub Secretsに登録
gh secret set AWS_ROLE_ARN_DEV --body "arn:aws:iam::123456789012:role/magazine-cms-github-actions-role"
gh secret set AWS_REGION_DEV --body "ap-northeast-1"

# 3. Stg/Prod環境も同様
npm run deploy:oidc:stg
npm run deploy:oidc:prod
```

### アプリケーションデプロイ

```bash
# Notion APIキーを登録（初回のみ）
AWS_PROFILE=magazine-cms-dev sst secret set NotionApiKey <key> --stage dev
AWS_PROFILE=magazine-cms-dev sst secret set NotionIntegrationToken <token> --stage dev

# デプロイ
npm run deploy:dev
npm run deploy:stg
npm run deploy:prod
```

### 開発モード

```bash
# 通常開発
npm run dev  # → http://localhost:3000

# Live Lambda開発
npm run sso
npm run dev:sst
```

---

## デプロイ順序

### 初回セットアップ時

1. **各環境でOIDC基盤デプロイ**
   ```
   Dev account  → sst deploy --stage github-oidc
   Stg account  → sst deploy --stage github-oidc
   Prod account → sst deploy --stage github-oidc
   ```

2. **GitHub Secrets設定**

3. **アプリデプロイ**
   ```
   sst deploy --stage dev
   sst deploy --stage stg
   sst deploy --stage prod
   ```

### 通常運用時

- OIDCロール: 変更しない（またはローカルから手動）
- アプリ: CI/CDで自動デプロイ

---

## トラブルシューティング

### OIDC基盤の更新が必要な場合

```bash
# ローカルから手動実行
AWS_PROFILE=magazine-cms-dev sst deploy --stage github-oidc

# 権限追加などの変更を反映
```

### OIDC基盤の削除

```bash
# 注意: アプリが動作しなくなる
AWS_PROFILE=magazine-cms-dev sst remove --stage github-oidc
```

### ステージ確認

```bash
# 各ステージの状態確認
sst console --stage github-oidc
sst console --stage dev
sst console --stage stg
sst console --stage prod
```

---

## まとめ

### ✅ SST Pulumi完結のメリット

1. **TypeScript統一**: 全てのインフラがTypeScriptで定義
2. **型安全**: エディタの補完・型チェック
3. **状態管理統一**: SST経由でPulumi状態管理
4. **ステージ分離**: `--stage github-oidc`で基盤とアプリを分離
5. **柔軟性**: 必要に応じてリソース追加が容易

### ⚠️ 注意点

1. **初回デプロイ**: 各環境でローカルから手動実行必須
2. **循環依存回避**: OIDCロール変更時はローカルから実行
3. **学習コスト**: Pulumi AWSリソースの書き方を習得

### 🎯 推奨運用フロー

```
[初回のみ]
1. sst deploy --stage github-oidc (各AWSアカウント)
2. GitHub Secrets設定

[日常運用]
3. git push → GitHub Actions → sst deploy --stage dev/stg/prod
4. OIDCロールは滅多に変更しない

[OIDC変更時]
5. ローカルから sst deploy --stage github-oidc
```

この方式なら、全てSST/Pulumiで完結しながら、基盤とアプリのライフサイクルを分離できます！
