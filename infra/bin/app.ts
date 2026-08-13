#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StremioIptvVodStack } from '../lib/stremio-iptv-vod-stack';

const app = new cdk.App();

// Region: AWS_REGION (set by the deploy role in CI) > CDK context > us-east-1.
// Virginia is intentionally the default: for this small personal workload it
// keeps Lambda and CloudWatch pricing at the lowest broadly available level.
const region = process.env.AWS_REGION || app.node.tryGetContext('region') || 'us-east-1';

new StremioIptvVodStack(app, 'StremioIptvVodStack', {
  env: {
    region,
    // Deploy to the account of the assumed role (GitHub OIDC); no hardcoded
    // account, so the same stack works in any account without changes.
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  description: 'Stremio IPTV VOD addon: public Lambda + Function URL (stream-only, direct IPTV URLs)',
});

app.synth();
