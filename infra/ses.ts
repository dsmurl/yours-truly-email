import * as aws from '@pulumi/aws';
import * as config from './config';

// SES Identity for the Source Email
export const emailIdentity = new aws.ses.EmailIdentity('source-email-identity', {
  email: config.sourceEmail,
});

// SES Identity for the Destination Email (optional if different from Source)
export const destinationIdentity = new aws.ses.EmailIdentity('destination-email-identity', {
  email: config.destinationEmail,
});
