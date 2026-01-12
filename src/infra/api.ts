import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as config from './config';
import { contactFormLambda } from './lambda';

// 1. WAF Web ACL
const webAcl = new aws.wafv2.WebAcl(config.prefixName('waf'), {
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
});

// 2. API Gateway (HTTP API)
const api = new aws.apigatewayv2.Api(config.prefixName('api'), {
  protocolType: 'HTTP',
  corsConfiguration: {
    allowOrigins: config.allowedOrigins,
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['content-type', 'x-amzn-waf-token'],
  },
});

const integration = new aws.apigatewayv2.Integration(config.prefixName('integration'), {
  apiId: api.id,
  integrationType: 'AWS_PROXY',
  integrationUri: contactFormLambda.arn,
  payloadFormatVersion: '2.0',
});

const route = new aws.apigatewayv2.Route(config.prefixName('route'), {
  apiId: api.id,
  routeKey: 'POST /contact',
  target: pulumi.interpolate`integrations/${integration.id}`,
});

const stage = new aws.apigatewayv2.Stage(config.prefixName('stage'), {
  apiId: api.id,
  name: config.pulumiStack, // Use the stack name (e.g., 'dev') as the stage name
  autoDeploy: true,
  defaultRouteSettings: {
    throttlingBurstLimit: config.apiThrottlingBurst,
    throttlingRateLimit: config.apiThrottlingRate,
  },
});

// 3. Attach WAF to API Stage
const current = pulumi.output(aws.getCallerIdentity({}));
const region = pulumi.output(aws.getRegion({}));

/*
const wafAssociation = new aws.wafv2.WebAclAssociation(config.prefixName('waf-assoc'), {
  // FINAL FIX for WAFv2 and API Gateway V2 (HTTP APIs):
  // For HTTP APIs, the ARN MUST include the Account ID when associating with WAFv2,
  // AND it MUST NOT have the leading slash after the account ID.
  // Format: arn:aws:apigateway:{region}:{account-id}:apis/{api-id}/stages/{stage-name}
  resourceArn: pulumi.interpolate`arn:aws:apigateway:${region.name}:${current.accountId}:apis/${api.id}/stages/${stage.name}`,
  webAclArn: webAcl.arn,
}, { dependsOn: [webAcl, stage] });
*/

// 4. Lambda Permission
new aws.lambda.Permission(config.prefixName('api-permission'), {
  action: 'lambda:InvokeFunction',
  function: contactFormLambda.name,
  principal: 'apigateway.amazonaws.com',
  sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

export const apiUrl = pulumi.interpolate`${api.apiEndpoint}/${stage.name}`;
