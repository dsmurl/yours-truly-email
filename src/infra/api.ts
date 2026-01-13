import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as config from './config';
import { contactFormLambda } from './lambda';

// 0. Provider Configuration
// Using an explicit provider ensures that Pulumi is 100% aligned with the target region,
// which often resolves "Invalid ARN" or "Resource not found" errors in WAFv2.
const provider = new aws.Provider('aws-provider', {
  region: config.awsRegion as aws.Region,
});

// 1. WAF Web ACL
const webAcl = new aws.wafv2.WebAcl(
  config.prefixName('waf'),
  {
    scope: 'REGIONAL',
    defaultAction: { allow: {} },
    rules: [
      {
        name: 'RateLimit',
        priority: 1,
        action: { block: {} },
        statement: {
          rateBasedStatement: {
            limit: config.wafRateLimit,
            aggregateKeyType: 'IP',
          },
        },
        visibilityConfig: {
          cloudwatchMetricsEnabled: true,
          metricName: 'RateLimit',
          sampledRequestsEnabled: true,
        },
      },
      {
        name: 'CaptchaOnContact',
        priority: 2,
        action: { captcha: {} },
        statement: {
          byteMatchStatement: {
            searchString: '/contact',
            fieldToMatch: { uriPath: {} },
            textTransformations: [{ priority: 0, type: 'NONE' }],
            positionalConstraint: 'EXACTLY',
          },
        },
        visibilityConfig: {
          cloudwatchMetricsEnabled: true,
          metricName: 'CaptchaOnContact',
          sampledRequestsEnabled: true,
        },
      },
      {
        name: 'AWSManagedRulesCommonRuleSet',
        priority: 3,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesCommonRuleSet',
          },
        },
        visibilityConfig: {
          cloudwatchMetricsEnabled: true,
          metricName: 'AWSManagedRulesCommonRuleSet',
          sampledRequestsEnabled: true,
        },
      },
    ],
    visibilityConfig: {
      cloudwatchMetricsEnabled: true,
      metricName: config.prefixName('waf-metrics'),
      sampledRequestsEnabled: true,
    },
  },
  { provider },
);

// 2. API Gateway (HTTP API)
const api = new aws.apigatewayv2.Api(
  config.prefixName('api'),
  {
    protocolType: 'HTTP',
    corsConfiguration: {
      allowOrigins: config.allowedOrigins,
      allowMethods: ['POST', 'OPTIONS'],
      allowHeaders: ['content-type', 'x-amzn-waf-token'],
    },
  },
  { provider },
);

const integration = new aws.apigatewayv2.Integration(
  config.prefixName('integration'),
  {
    apiId: api.id,
    integrationType: 'AWS_PROXY',
    integrationUri: contactFormLambda.arn,
    payloadFormatVersion: '2.0',
  },
  { provider },
);

const route = new aws.apigatewayv2.Route(
  config.prefixName('route'),
  {
    apiId: api.id,
    routeKey: 'POST /contact',
    target: pulumi.interpolate`integrations/${integration.id}`,
  },
  { provider },
);

const stage = new aws.apigatewayv2.Stage(
  config.prefixName('stage'),
  {
    apiId: api.id,
    name: config.pulumiStack, // Use the stack name (e.g., 'dev') as the stage name
    autoDeploy: true,
    defaultRouteSettings: {
      throttlingBurstLimit: config.apiThrottlingBurst,
      throttlingRateLimit: config.apiThrottlingRate,
    },
  },
  { provider },
);

// 3. WAF Association
// Dynamically retrieve account and region to build a fully qualified ARN
const current = pulumi.output(aws.getCallerIdentity({}, { provider }));
const region = pulumi.output(aws.getRegion({}, { provider }));

const wafAssociation = new aws.wafv2.WebAclAssociation(
  config.prefixName('waf-assoc'),
  {
    // The "Triple Crown" ARN format: Account ID + Leading Slash + Alphanumeric Stage
    // This is the most exhaustive format for Regional WAFv2 + HTTP API Gateway
    resourceArn: pulumi.interpolate`arn:aws:apigateway:${region.name}:${current.accountId}:/apis/${api.id}/stages/${stage.name}`,
    webAclArn: webAcl.arn,
  },
  { dependsOn: [webAcl, stage], provider },
);

// 4. Lambda Permission
new aws.lambda.Permission(
  config.prefixName('api-permission'),
  {
    action: 'lambda:InvokeFunction',
    function: contactFormLambda.name,
    principal: 'apigateway.amazonaws.com',
    sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
  },
  { provider },
);

export const apiUrl = pulumi.interpolate`${api.apiEndpoint}/${stage.name}`;
