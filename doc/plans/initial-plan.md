# Secure Serverless Contact Form – AWS Implementation Plan

## Goal
Provide a public contact-form API that:
- Can be called from a static website
- Sends an email to a fixed recipient via AWS SES
- Is protected against spam and abuse
- Uses AWS-native security controls
- Is suitable for Infrastructure as Code (Pulumi)

---

## High-Level Architecture

Static Website (S3 + CloudFront)
→ API Gateway (HTTP API or REST API)
→ Lambda
→ SES (send email)

Security & Abuse Prevention:
- AWS WAF v2 (CAPTCHA + rate limiting)
- API Gateway throttling
- Strict Lambda-side validation

---

## AWS Components

### Frontend
- S3 bucket for static site content
- CloudFront distribution in front of S3
- Optional: Route53 + ACM certificate for custom domain

### Backend API
- API Gateway (HTTP API preferred)
- Single endpoint: `POST /contact`
- Lambda function as backend integration
- CloudWatch Logs enabled

### Email
- AWS SES
- Verified domain or sender email
- Emails always sent to a fixed recipient (hardcoded in Lambda)

### Security
- AWS WAF v2 Web ACL attached to API Gateway stage
- WAF CAPTCHA enforced on `/contact`
- Rate-based rule (per source IP)
- Optional AWS Managed Rules (CommonRuleSet, KnownBadInputs)

---

## Request Flow

1. User loads static site from CloudFront.
2. User submits contact form.
3. Browser sends POST request to `/contact` with JSON body.
4. AWS WAF evaluates request:
    - CAPTCHA challenge required
    - Rate limits enforced
    - Malicious patterns blocked
5. If allowed, API Gateway invokes Lambda.
6. Lambda validates payload and sends email via SES.
7. Lambda returns success or error response.

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
    - Name length
    - Email format
    - Message length (e.g. max 2000–4000 chars)
    - Reject CRLF/header injection
    - Optional honeypot field check
- Do NOT accept recipient address from client
- Send email via SES:
    - From: no-reply@yourdomain.com
    - To: fixed destination address
    - Reply-To: user-provided email (optional)
- Log request metadata (IP, timestamp, user-agent)
- Return structured JSON responses

---

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

- S3 bucket + CloudFront distribution
- API Gateway + custom domain + Route53 records
- Lambda function + IAM role/policies
- SES identity resources
- WAF Web ACL + rules + API Gateway association
- Outputs:
    - Website URL
    - API base URL
    - Key resource ARNs

---

## Suggested Defaults

- WAF rate limit: 20 requests / 5 minutes / IP
- API throttling: 2 RPS steady, 5 burst
- Message length cap: 4000 characters
- CloudWatch log retention: 30 days
