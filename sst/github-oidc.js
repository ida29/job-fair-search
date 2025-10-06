/**
 * GitHub OIDC基盤
 *
 * このファイルは GitHub Actions用のOIDC Provider と IAMロールを定義します。
 * `sst deploy --stage github-oidc` で各AWSアカウントに1回だけデプロイします。
 *
 * デプロイ方法:
 * - AWS_PROFILE=job-fair-search-dev sst deploy --stage github-oidc
 * - AWS_PROFILE=job-fair-search-stg sst deploy --stage github-oidc
 * - AWS_PROFILE=job-fair-search-prod sst deploy --stage github-oidc
 */

/**
 * GitHub OIDC基盤をデプロイ
 */
export async function deployGitHubOIDC() {
  const accountId = aws.getCallerIdentityOutput({}).accountId;
  const region = aws.getRegionOutput({}).name;

  // ========================================
  // OIDC Provider
  // ========================================

  // 既存のGitHub OIDC Providerを使用
  // CloudFormationで作成済みのProviderを参照
  const oidcProviderArn = $interpolate`arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`;

  // Pulumiで既存リソースを参照する場合は、ARN文字列をそのまま使用
  // new でインポートするとエラーになるため、arnは文字列で直接参照

  // ========================================
  // IAM Policy（SST特有の権限含む）
  // ========================================

  const sstDeployPolicy = new aws.iam.Policy("SSTDeployPolicy", {
    name: "job-fair-search-sst-deploy-policy",
    description:
      "Minimal permissions for SST deployment (based on actual deployment experience)",
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        // CloudFormation
        {
          Sid: "CloudFormationAccess",
          Effect: "Allow",
          Action: ["cloudformation:*"],
          Resource: "*",
        },
        // S3: アプリバケット + SSTバケット
        {
          Sid: "S3Access",
          Effect: "Allow",
          Action: ["s3:*"], // 簡略化（本番では細分化推奨）
          Resource: [
            "arn:aws:s3:::job-fair-search-*",
            "arn:aws:s3:::job-fair-search-*/*",
            "arn:aws:s3:::sst-*", // ✅ SSTの状態管理バケット
            "arn:aws:s3:::sst-*/*",
          ],
        },
        // CloudFront
        {
          Sid: "CloudFrontAccess",
          Effect: "Allow",
          Action: ["cloudfront:*"],
          Resource: "*",
        },
        // Lambda
        {
          Sid: "LambdaAccess",
          Effect: "Allow",
          Action: ["lambda:*"],
          Resource: `arn:aws:lambda:*:*:function:job-fair-search-*`,
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
            "iam:ListAttachedRolePolicies",
            "iam:ListRolePolicies",
            "iam:TagRole",
            "iam:UntagRole",
            "iam:UpdateAssumeRolePolicy",
          ],
          Resource: `arn:aws:iam::*:role/job-fair-search-*`,
        },
        // SSM Parameter Store: SST状態管理
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
            "ssm:DescribeParameters",
          ],
          Resource: `arn:aws:ssm:*:*:parameter/sst/*`, // ✅ /sst/* 全体
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
          Resource: `arn:aws:logs:*:*:log-group:/aws/lambda/job-fair-search-*`,
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
        // その他
        {
          Sid: "AdditionalServices",
          Effect: "Allow",
          Action: ["sts:GetCallerIdentity"],
          Resource: "*",
        },
      ],
    }),
    tags: {
      ManagedBy: "SST",
      Stage: "github-oidc",
    },
  });

  // ========================================
  // GitHub Actions IAMロール
  // ========================================

  const githubRole = new aws.iam.Role("GitHubActionsRole", {
    name: "job-fair-search-github-actions-role-sst",
    description: "IAM Role for GitHub Actions with OIDC authentication (SST managed)",
    assumeRolePolicy: $jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Federated: oidcProviderArn,
            },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              },
              StringLike: {
                "token.actions.githubusercontent.com:sub": [
                  "repo:ida29/job-fair-search:ref:refs/heads/main",
                  "repo:ida29/job-fair-search:ref:refs/heads/develop",
                  "repo:ida29/job-fair-search:ref:refs/tags/v*",
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
      Stage: "github-oidc",
      Repository: "ida29/job-fair-search",
    },
  });

  // ========================================
  // 出力
  // ========================================

  return {
    oidcProviderArn: oidcProviderArn,
    roleArn: githubRole.arn,
    roleName: githubRole.name,
    accountId: accountId,
    region: region,
  };
}
