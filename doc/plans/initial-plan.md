# Secure Serverless Contact Form – AWS Implementation Plan

## Goal

Provide a public contact-form API that:

- Can be called from an external static website
- Sends an email to a fixed recipient via AWS SES
- Is protected against spam and abuse
- AWS-native security controls: WAF v2 (CAPTCHA, Rate Limiting, IP Reputation)
- Cost-efficient: Rejects abuse early; minimal Lambda execution
- Observable: Structured logging and metrics for debugging
- Configurable: Managed via Pulumi and Environment Variables

---

## Security & Abuse Prevention:

- **CORS Configuration**: Restrict browser-based requests to specific allowed origins.
- **AWS WAF v2 (Defense in Depth)**:
  - **CAPTCHA**: Enforce on `/contact` to prevent automated bot submissions. This makes automated abuse "expensive" as
    it requires solving or paying for CAPTCHA bypass services.
  - **Rate Limiting**: Block IPs that exceed a threshold (e.g., 20 requests per 5 minutes). This limits the volume of
    abuse a single attacker can generate.
  - **Origin/Referer Check**: Verify headers at the WAF level. While spoofable by non-browser clients, it provides a
    barrier against lazy automated tools.
  - **Geo-Blocking (Optional)**: Block traffic from countries where you don't expect users, further reducing the
    attack surface.
- **API Gateway Throttling**: Hard limits on requests per second (RPS) to protect backend costs and resources.
- **Strict Lambda-side Validation**: Ensure payload integrity, field lengths, and data formats to prevent injection or
  resource exhaustion.
- **Cost Protection**: By using WAF and Throttling _before_ Lambda, we ensure that unauthorized or abusive requests are
  rejected early, minimizing Lambda execution costs.

---

## Anti-Abuse Strategy: Making Abuse Expensive

To achieve the goal of making abuse time-consuming and low-value, the following "Defense in Depth" layers are employed:

1. **The CAPTCHA Wall**: By requiring a valid WAF CAPTCHA token, we force any automated script to either integrate with
   a CAPTCHA-solving service (costly) or use manual human labor (slow).
2. **IP Intelligence**: WAF can be configured to use AWS Managed Rules for "IP Reputation" and "Anonymous IP" (VPNs,
   Tor, Proxies) to automatically block known sources of abuse.
3. **Payload Deduplication (Optional)**: Use a short-lived DynamoDB cache (e.g., 10 mins) to store a hash of the
   sender's IP and message. If a duplicate arrives within the window, the Lambda returns 200 (Success) but does not
   trigger SES, preventing recipient inbox flooding without leaking that the request was ignored.
4. **Tight SES Quotas**: Configure SES sending limits to a low ceiling initially. This ensures that even if all other
   layers fail, the system cannot be used as a high-volume spam relay.
5. **Silent Honeypot**: The hidden `_honeypot` field tricks simple bots into revealing themselves. The Lambda will
   accept the request but skip the SES call, wasting the bot's time.

---

## API Specification

### Endpoint: `POST /contact`

#### Request Payload (JSON)

| Field       | Type   | Description             | Validation                      |
| :---------- | :----- | :---------------------- | :------------------------------ |
| `name`      | string | Full name of the sender | 1-100 characters                |
| `email`     | string | Reply-to email address  | Valid email format, 5-254 chars |
| `message`   | string | Message body            | 1-4000 characters               |
| `_honeypot` | string | Hidden honeypot field   | Must be empty                   |

#### Success Response (200 OK)

```json
{
  "message": "Email sent successfully",
  "requestId": "uuid"
}
```

#### Error Responses

- **400 Bad Request**: Missing fields or validation failure.
- **403 Forbidden**: WAF blocked (CAPTCHA failed or Rate Limit exceeded).
- **405 Method Not Allowed**: Using GET/PUT/DELETE instead of POST.
- **429 Too Many Requests**: API Gateway throttling triggered.
- **500 Internal Server Error**: Downstream failure (SES or Lambda error).

---

## AWS Components

### Backend API

- API Gateway (HTTP API preferred)
- Single endpoint: `POST /contact`
- **CORS enabled**: `Allow-Origin` restricted to the configured external site(s).
- Lambda function as backend integration
- CloudWatch Logs enabled

### Email

- AWS SES
- Verified domain or sender email
- Emails always sent to a fixed recipient (hardcoded or env var in Lambda)

### Security

- AWS WAF v2 Web ACL attached to API Gateway stage
- WAF CAPTCHA enforced on `/contact`
- Rate-based rule (per source IP)
- (Optional) String match rule on `Origin` or `Referer` headers to ensure requests come from expected sites.
- Optional AWS Managed Rules (CommonRuleSet, KnownBadInputs)

---

## Request Flow

1. User submits contact form on external static site.
2. Browser sends POST request to `/contact` with JSON body.
3. AWS WAF evaluates request:
   - CAPTCHA challenge required
   - Rate limits enforced
   - Malicious patterns blocked
4. If allowed, API Gateway invokes Lambda.
5. Lambda validates payload and sends email via SES.
6. Lambda returns success or error response.

---

## WAF Configuration (Recommended)

Attach Web ACL to API Gateway stage with rules:

1. CAPTCHA rule
   - Always require CAPTCHA for `/contact` endpoint
   - Blocks requests before Lambda executes

2. Rate-based rule
   - Example: Block if > 20 requests per 5 minutes per IP
   - Scoped to `/contact`

3. Managed rule sets (optional)
   - AWSManagedRulesCommonRuleSet
   - AWSManagedRulesKnownBadInputsRuleSet

---

## API Gateway Configuration

- Enable request throttling:
  - Steady state: 1–2 RPS
  - Burst: 5–10 requests
- Enable access logs
- Restrict methods to POST on `/contact`

---

## Lambda Responsibilities

- Validate HTTP method and path
- Validate input:
  - Name: string, 1-100 characters
  - Email: string, valid email regex, 5-254 characters
  - Message: string, 1-4000 characters
  - Reject CRLF/header injection in name and email
  - Optional honeypot field check (if field `_honeypot` is present and not empty, silently discard or return 200
    without sending)
- Do NOT accept recipient address from client
- Send email via SES:
  - From: `SOURCE_EMAIL` (verified identity)
  - To: `DESTINATION_EMAIL` (fixed recipient)
  - Reply-To: user-provided email
  - Subject: "New Contact Form Submission from [Name]"
- Log request metadata (IP, timestamp, user-agent) using CloudWatch
- Return structured JSON responses with `requestId` (context.awsRequestId)

---

## IAM Permissions (Least Privilege)

### Lambda Execution Role

- `ses:SendEmail` and `ses:SendRawEmail`:
  - Resource: `arn:aws:ses:REGION:ACCOUNT-ID:identity/SOURCE_EMAIL`
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`:
  - Resource: `arn:aws:logs:REGION:ACCOUNT-ID:log-group:/aws/lambda/FUNCTION_NAME:*`

---

## Pulumi Project Structure

```text
/infrastructure
├── index.ts        # Main stack file (orchestrates resources)
├── api.ts          # API Gateway and WAF resources
├── lambda.ts       # Lambda and IAM resources
├── ses.ts          # SES identity and verification (optional/manual)
└── config.ts       # Pulumi configuration helpers
/src
└── index.ts        # Lambda handler code
```

## SES Configuration

- Verify sending domain or email address
- Enable DKIM if using domain identity
- Ensure account is out of SES sandbox (or verify recipient)
- Grant Lambda IAM permissions:
  - ses:SendEmail
  - ses:SendRawEmail

---

## Optional Enhancements

- DynamoDB table for deduplication:
  - Hash (IP + message)
  - TTL 10–30 minutes
  - Reject duplicate submissions
- Origin/Referer check in Lambda (non-security speed bump)
- CloudWatch alarms for:
  - Lambda errors
  - Sudden spikes in blocked WAF requests

---

## Pulumi Deliverables

- API Gateway (HTTP API) using AWS-provided default endpoint
- Lambda function + IAM role/policies
- SES identity resources
- WAF Web ACL + rules + API Gateway association
- Outputs:
  - API base URL (AWS-generated endpoint)
  - Key resource ARNs

---

## Configuration

The solution is designed to be configurable via Pulumi and Environment Variables:

1. **Allowed Origins**: Configured in Pulumi for API Gateway CORS settings.
2. **Recipient Email**: Set via Lambda environment variable `DESTINATION_EMAIL`.
3. **Sender Email**: Set via Lambda environment variable `SOURCE_EMAIL` (must be SES verified).
4. **WAF Rate Limits**: Configured in Pulumi (default: 20 per 5 min).
5. **WAF CAPTCHA**: Can be enabled/disabled or scoped to specific paths in Pulumi.

---

## Observability & Debugging

### 1. Logging (CloudWatch Logs)

- **Lambda Logs**:
  - Structured JSON logging for easier querying in CloudWatch Logs Insights.
  - Log incoming event metadata (sanitized), validation results, and SES response metadata.
  - Log `awsRequestId` in every log statement to trace execution.
- **API Gateway Access Logs**:
  - Capture `$context.identity.sourceIp`, `$context.requestTime`, `$context.httpMethod`, `$context.routeKey`,
    `$context.status`, and `$context.wafResponseCode`.
- **WAF Logs**:
  - Enable sampled requests or full logging to S3/CloudWatch to debug blocked requests and CAPTCHA failures.

### 2. Metrics & Alarms (CloudWatch Metrics)

- **Error Rates**: Alarm if Lambda errors exceed a threshold (e.g., > 1% over 15 mins).
- **Latency**: Track `Duration` of Lambda execution to detect SES delays.
- **WAF Blocks**: Alarm on high rates of `BlockedRequests` which might indicate a sustained bot attack.
- **SES Reputation**: Monitor SES bounce and complaint rates (via SES dashboard/alarms).

### 3. Distributed Tracing (AWS X-Ray)

- Enable X-Ray tracing for API Gateway and Lambda.
- Visualize the request flow from API Gateway to Lambda to SES to identify bottlenecks or failures in the chain.

---

## Testing & Verification Strategy

### 1. Local Development (Pre-deployment)

- **Unit Tests**: Use `jest` to test the Lambda handler in isolation.
  - Mock `SESClient` to verify it's called with the correct parameters.
  - Test all validation rules (too long, too short, invalid email, missing fields).
  - Test honeypot logic.
- **Local API Simulation**: Use a simple script to invoke the handler with various `APIGatewayProxyEvent` objects.

### 2. Post-deployment (Integration)

- **Manual Verification**: Use `curl` or Postman to hit the API endpoint.
  - Verify CORS headers are present.
  - Verify WAF blocks requests without CAPTCHA token (if CAPTCHA is set to mandatory).
- **Automated Integration Tests**: A script that sends valid and invalid requests to the live endpoint and checks for
  expected status codes.

---

## Suggested Defaults

- WAF rate limit: 20 requests / 5 minutes / IP
- API throttling: 2 RPS steady, 5 burst
- Message length cap: 4000 characters
- CloudWatch log retention: 30 days
