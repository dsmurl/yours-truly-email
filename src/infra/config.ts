import * as pulumi from '@pulumi/pulumi';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = new pulumi.Config();

/**
 * Helper to get configuration from Environment Variables
 */
function getConfig(envVar: string): string;
function getConfig(envVar: string, defaultValue: string): string;
function getConfig(envVar: string, defaultValue?: string): string {
  const value = process.env[envVar] || defaultValue;
  if (value === undefined) {
    throw new Error(`Environment Variable "${envVar}" is required.`);
  }
  return value;
}

function getObjectConfig<T>(envVar: string): T {
  const envValue = process.env[envVar];
  if (envValue) {
    try {
      return JSON.parse(envValue) as T;
    } catch (e) {
      throw new Error(`Failed to parse Environment Variable "${envVar}" as JSON.`);
    }
  }

  throw new Error(`Environment Variable "${envVar}" is required.`);
}

function getNumberConfig(envVar: string, defaultValue: number): number {
  const value = process.env[envVar] ? Number(process.env[envVar]) : defaultValue;
  return value;
}

export const allowedOrigins = getObjectConfig<string[]>('ALLOWED_ORIGINS');
export const destinationEmail = getConfig('DESTINATION_EMAIL');
export const sourceEmail = getConfig('SOURCE_EMAIL');
export const awsRegion = getConfig('AWS_REGION', 'us-west-2');
export const pulumiStack = getConfig('PULUMI_STACK', 'dev');

// Ensure AWS SDK and Pulumi AWS provider use the region from .env
process.env.AWS_REGION = awsRegion;

const projectName = getConfig('PROJECT_NAME', 'my');

/**
 * Helper to prefix names for consistent naming across resources
 */
export function prefixName(name: string): string {
  return `${projectName}-your-truely-email-${name}`;
}

export const wafRateLimit = getNumberConfig('WAF_RATE_LIMIT', 20);
export const apiThrottlingBurst = getNumberConfig('API_THROTTLING_BURST', 10);
export const apiThrottlingRate = getNumberConfig('API_THROTTLING_RATE', 2);
