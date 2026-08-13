import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import * as logs from 'aws-cdk-lib/aws-logs';
import { copyStaticAssetsHooks } from './copy-static-assets';

/**
 * Stremio IPTV VOD — minimal serverless stack.
 *
 * Resources (and only these):
 *   - 1 AWS Lambda (Node.js, ARM64, esbuild bundle from src/lambda.js)
 *   - 1 public Lambda Function URL (authType NONE)
 *   - CloudWatch Logs (7 day retention)
 *
 * Deliberately NOT created: API Gateway, ALB, EC2/ECS/ECR/Fargate, VPC,
 * NAT Gateway, DynamoDB, provisioned concurrency, X-Ray, WAF, CloudFront.
 *
 * Cost protection: reservedConcurrentExecutions = 2 (public endpoint).
 */
export class StremioIptvVodStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Stable, predictable function name (useful for debugging/log groups).
    const FUNCTION_NAME = 'stremio-iptv-vod';
    // Compiled from infra/build/lib, so the repo root is three levels up.
    const repoRoot = path.join(__dirname, '..', '..', '..');

    // CloudWatch Logs with 7-day retention (no infinite retention).
    const logGroup = new logs.LogGroup(this, 'AddonLogGroup', {
      logGroupName: `/aws/lambda/${FUNCTION_NAME}`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const fn = new lambdaNodejs.NodejsFunction(this, 'AddonFunction', {
      functionName: FUNCTION_NAME,
      // entry + projectRoot: the app lives at the repository root (src/),
      // outside the infra/ package — point both at the repo explicitly.
      entry: path.join(repoRoot, 'src', 'lambda.js'),
      projectRoot: repoRoot,
      depsLockFilePath: path.join(repoRoot, 'package-lock.json'),
      handler: 'handler',
      // Node 24 on ARM64: all dependencies are pure JS, no native modules.
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      // Several external IPTV calls with up to 20s timeouts each may chain
      // within a single request.
      timeout: cdk.Duration.seconds(90),
      // Hard cap on concurrent executions: limits the blast radius of a
      // public endpoint without WAF/CloudFront (first version).
      reservedConcurrentExecutions: 2,
      logGroup,
      // Tracing disabled (default): keep the cost minimal.
      bundling: {
        minify: false,
        sourceMap: false,
        target: 'node24',
        // Copy non-JS assets (landing page + icon) into the bundle: esbuild
        // only emits JS, but the app reads them with fs.readFileSync /
        // express.static at runtime.
        commandHooks: copyStaticAssetsHooks(),
      },
    });

    // Public Function URL. CORS is intentionally NOT configured here: the
    // Express app already sets its own CORS headers (Access-Control-Allow-Origin),
    // and duplicating them would produce double headers.
    const functionUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: undefined,
    });

    new cdk.CfnOutput(this, 'FunctionUrl', { value: functionUrl.url });
    new cdk.CfnOutput(this, 'FunctionName', { value: fn.functionName });
  }
}
