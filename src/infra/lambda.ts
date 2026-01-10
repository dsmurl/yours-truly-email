import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as config from './config';

// 1. Lambda Role
const lambdaRole = new aws.iam.Role('contact-form-lambda-role', {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: 'lambda.amazonaws.com' }),
});

// 2. IAM Policies
new aws.iam.RolePolicy('contact-form-lambda-policy', {
  role: lambdaRole.id,
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: ['ses:SendEmail', 'ses:SendRawEmail'],
        Effect: 'Allow',
        Resource: '*', // Ideally restricted to specific SES identity ARN
      },
      {
        Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        Effect: 'Allow',
        Resource: 'arn:aws:logs:*:*:*',
      },
      {
        Action: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
        Effect: 'Allow',
        Resource: '*',
      },
    ],
  },
});

// 3. Lambda Function
export const contactFormLambda = new aws.lambda.Function('contact-form-handler', {
  code: new pulumi.asset.AssetArchive({
    '.': new pulumi.asset.FileArchive('../../dist/lambda/contact'), // Assumes build step is run
  }),
  runtime: aws.lambda.Runtime.NodeJS20dX,
  handler: 'index.handler',
  role: lambdaRole.arn,
  environment: {
    variables: {
      DESTINATION_EMAIL: config.destinationEmail,
      SOURCE_EMAIL: config.sourceEmail,
    },
  },
  tracingConfig: {
    mode: 'Active',
  },
});
