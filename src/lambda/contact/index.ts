import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import * as AWSXRay from 'aws-xray-sdk-core';

// Instrument SES client with X-Ray for distributed tracing
const ses = AWSXRay.captureAWSv3Client(new SESClient({}));

/**
 * Structured logger to ensure all logs are JSON and include trace information
 */
const logger = (level: 'INFO' | 'ERROR' | 'WARN', message: string, data?: any) => {
  console.log(
    JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...data,
    }),
  );
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  const requestId = context.awsRequestId;
  const destinationEmail = process.env.DESTINATION_EMAIL;
  const sourceEmail = process.env.SOURCE_EMAIL;

  logger('INFO', 'Received request', {
    requestId,
    httpMethod: event.httpMethod,
    path: event.path,
    sourceIp: event.requestContext?.identity?.sourceIp,
    userAgent: event.requestContext?.identity?.userAgent,
  });

  // Basic method check
  if (event.httpMethod !== 'POST') {
    logger('WARN', 'Method not allowed', { requestId, method: event.httpMethod });
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed', requestId }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, email, message, _honeypot } = body;

    // 1. Silent Honeypot Check
    if (_honeypot && _honeypot.length > 0) {
      logger('WARN', 'Honeypot triggered', { requestId, _honeypot });
      // Return 200 to fool the bot
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Email sent successfully', requestId }),
      };
    }

    // 2. Validation
    const validationErrors: string[] = [];
    if (!name || name.length < 1 || name.length > 100)
      validationErrors.push('Name must be between 1 and 100 characters.');
    if (!email || !EMAIL_REGEX.test(email) || email.length < 5 || email.length > 254)
      validationErrors.push('Invalid email address.');
    if (!message || message.length < 1 || message.length > 4000)
      validationErrors.push('Message must be between 1 and 4000 characters.');

    // Reject CRLF to prevent header injection
    if (
      name?.includes('\r') ||
      name?.includes('\n') ||
      email?.includes('\r') ||
      email?.includes('\n')
    ) {
      validationErrors.push('Invalid input: characters not allowed.');
    }

    if (validationErrors.length > 0) {
      logger('WARN', 'Validation failed', { requestId, validationErrors });
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Validation failed', errors: validationErrors, requestId }),
      };
    }

    // 3. Configuration Check
    if (!sourceEmail || !destinationEmail) {
      logger('ERROR', 'Missing environment variables', {
        requestId,
        sourceEmail,
        destinationEmail,
      });
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal Server Error', requestId }),
      };
    }

    // 4. Send Email
    const params = {
      Destination: {
        ToAddresses: [destinationEmail],
      },
      Message: {
        Body: {
          Text: {
            Data: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
          },
        },
        Subject: {
          Data: `New Contact Form Submission from ${name}`,
        },
      },
      Source: sourceEmail,
      ReplyToAddresses: [email],
    };

    const sesResponse = await ses.send(new SendEmailCommand(params));
    logger('INFO', 'Email sent successfully', { requestId, messageId: sesResponse.MessageId });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // CORS handled by API Gateway normally, but good to have
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({ message: 'Email sent successfully', requestId }),
    };
  } catch (error: any) {
    logger('ERROR', 'Error processing request', {
      requestId,
      error: error.message,
      stack: error.stack,
    });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to send email', requestId }),
    };
  }
};
