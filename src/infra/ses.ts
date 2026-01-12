import * as aws from '@pulumi/aws';
import * as config from './config';

// SES Identity for the Source Email
export const emailIdentity = new aws.ses.EmailIdentity(config.prefixName('source-identity'), {
  email: config.sourceEmail,
});

// SES Identity for the Destination Email (optional if different from Source)
export const destinationIdentity = new aws.ses.EmailIdentity(
  config.prefixName('destination-identity'),
  {
    email: config.destinationEmail,
  },
);
