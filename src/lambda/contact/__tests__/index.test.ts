import { handler } from '../index';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock SES Client
jest.mock('@aws-sdk/client-ses');
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: (client: any) => client,
}));

describe('Contact Form Lambda Handler', () => {
  let mockEvent: Partial<APIGatewayProxyEvent>;
  let mockContext: Partial<Context>;
  let sesSendMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SOURCE_EMAIL = 'sender@example.com';
    process.env.DESTINATION_EMAIL = 'recipient@example.com';

    sesSendMock = jest.fn().mockResolvedValue({ MessageId: 'test-message-id' });
    (SESClient.prototype.send as jest.Mock) = sesSendMock;

    mockEvent = {
      httpMethod: 'POST',
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello world',
        _honeypot: '',
      }),
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1',
          userAgent: 'test-agent',
        },
      } as any,
    };

    mockContext = {
      awsRequestId: 'test-request-id',
    };
  });

  afterEach(() => {
    delete process.env.SOURCE_EMAIL;
    delete process.env.DESTINATION_EMAIL;
  });

  test('Success: Sends email with valid input', async () => {
    const result = await handler(mockEvent as APIGatewayProxyEvent, mockContext as Context);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Email sent successfully',
      requestId: 'test-request-id',
    });
    expect(sesSendMock).toHaveBeenCalled();
    const command = sesSendMock.mock.calls[0][0];
    // In SDK v3 mock, the command is the first argument
    expect(command.constructor.name).toBe('SendEmailCommand');
  });

  test('Anti-Abuse: Silent success when honeypot is filled', async () => {
    mockEvent.body = JSON.stringify({
      name: 'Bot',
      email: 'bot@example.com',
      message: 'I am a bot',
      _honeypot: 'filled!',
    });

    const result = await handler(mockEvent as APIGatewayProxyEvent, mockContext as Context);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Email sent successfully');
    expect(sesSendMock).not.toHaveBeenCalled(); // Critical: SES not called
  });

  test('Validation: Fails on missing fields', async () => {
    mockEvent.body = JSON.stringify({
      name: '',
      email: '',
      message: '',
    });

    const result = await handler(mockEvent as APIGatewayProxyEvent, mockContext as Context);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation failed');
    expect(body.errors).toHaveLength(3);
  });

  test('Validation: Fails on invalid email', async () => {
    mockEvent.body = JSON.stringify({
      name: 'John',
      email: 'not-an-email',
      message: 'Hello',
    });

    const result = await handler(mockEvent as APIGatewayProxyEvent, mockContext as Context);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).errors).toContain('Invalid email address.');
  });

  test('Security: Fails on CRLF injection', async () => {
    mockEvent.body = JSON.stringify({
      name: 'John\r\nInjection',
      email: 'test@example.com',
      message: 'Hello',
    });

    const result = await handler(mockEvent as APIGatewayProxyEvent, mockContext as Context);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).errors).toContain('Invalid input: characters not allowed.');
  });

  test('Method: Fails on non-POST request', async () => {
    mockEvent.httpMethod = 'GET';

    const result = await handler(mockEvent as APIGatewayProxyEvent, mockContext as Context);

    expect(result.statusCode).toBe(405);
    expect(JSON.parse(result.body).message).toBe('Method Not Allowed');
  });

  test('Config: Fails on missing environment variables', async () => {
    delete process.env.SOURCE_EMAIL;

    const result = await handler(mockEvent as APIGatewayProxyEvent, mockContext as Context);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal Server Error');
  });

  test('Downstream: Handles SES failure', async () => {
    sesSendMock.mockRejectedValue(new Error('SES Service Down'));

    const result = await handler(mockEvent as APIGatewayProxyEvent, mockContext as Context);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Failed to send email');
  });
});
