import * as pulumi from '@pulumi/pulumi';

const config = new pulumi.Config();

export const allowedOrigins = config.requireObject<string[]>('allowedOrigins');
export const destinationEmail = config.require('destinationEmail');
export const sourceEmail = config.require('sourceEmail');

export const wafRateLimit = config.getNumber('wafRateLimit') || 20;
export const apiThrottlingBurst = config.getNumber('apiThrottlingBurst') || 10;
export const apiThrottlingRate = config.getNumber('apiThrottlingRate') || 2;
