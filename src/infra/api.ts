import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as config from './config';
import { contactFormLambda } from './lambda';

// 1. WAF Web ACL
const webAcl = new aws.wafv2.WebAcl('contact-form-waf', {
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
    metricName: 'contactFormWaf',
    sampledRequestsEnabled: true,
  },
});

// 2. API Gateway (HTTP API)
const api = new aws.apigatewayv2.Api('contact-form-api', {
  protocolType: 'HTTP',
  corsConfiguration: {
    allowOrigins: config.allowedOrigins,
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['content-type', 'x-amzn-waf-token'],
  },
});

const integration = new aws.apigatewayv2.Integration('lambda-integration', {
  apiId: api.id,
  integrationType: 'AWS_PROXY',
  integrationUri: contactFormLambda.arn,
  payloadFormatVersion: '2.0',
});

const route = new aws.apigatewayv2.Route('contact-route', {
  apiId: api.id,
  routeKey: 'POST /contact',
  target: pulumi.interpolate`integrations/${integration.id}`,
});

const stage = new aws.apigatewayv2.Stage('api-stage', {
  apiId: api.id,
  name: '$default',
  autoDeploy: true,
  defaultRouteSettings: {
    throttlingBurstLimit: config.apiThrottlingBurst,
    throttlingRateLimit: config.apiThrottlingRate,
  },
});

// 3. Attach WAF to API Stage
const wafAssociation = new aws.wafv2.WebAclAssociation('waf-assoc', {
  resourceArn: stage.arn,
  webAclArn: webAcl.arn,
});

// 4. Lambda Permission
new aws.lambda.Permission('api-gateway-permission', {
  action: 'lambda:InvokeFunction',
  function: contactFormLambda.name,
  principal: 'apigateway.amazonaws.com',
  sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

export const apiUrl = api.apiEndpoint;
