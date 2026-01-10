# Project Deployment Guide (AWS & Pulumi)

This guide provides step-by-step instructions for launching the Secure Serverless Contact Form into your AWS account
using Pulumi.

## 1. Prerequisites

Before you begin, ensure you have the following tools installed and configured:

- **AWS CLI**: [Installed](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and configured
  with credentials (`aws configure`).
- **Node.js & pnpm**: [Node.js](https://nodejs.org/) (v20+) and [pnpm](https://pnpm.io/installation) (
  `npm install -g pnpm`).
- **Pulumi CLI**: [Installed](https://www.pulumi.com/docs/get-started/install/) and authenticated (`pulumi login`).

## 2. AWS Permissions for Deployment

The IAM user or role executing the deployment must have sufficient permissions to create the following resources:

- **IAM**: Create Roles and Policies for the Lambda function.
- **Lambda**: Create and update the function.
- **API Gateway (v2)**: Create APIs, Stages, Integrations, and Routes.
- **WAF v2**: Create Web ACLs and Associations.
- **SES**: Create Email Identities (verification).
- **CloudWatch**: Create Log Groups.

### Deployment Policy

A specific IAM policy for the deployment user/role is provided in `infra/policy/yours-truly-email-deploy-policy.json`.
You can create a custom policy in the AWS Console using this JSON to grant the exact permissions needed.

If you are using an IAM Role (recommended for CI/CD or cross-account deployment), you must also configure a **Trust
Policy** to allow your user or service to assume that role. A template is provided in `infra/policy/trust-policy.json`.

### Trust Policy

The `infra/policy/trust-policy.json` file contains a template for an IAM Role Trust Policy. This project uses **GitHub
Actions OIDC (OpenID Connect)** to allow only this specific repository to assume the deployment role.

1. **Configure AWS OIDC Provider**: If not already present, add `token.actions.githubusercontent.com` as an Identity
   Provider in your AWS IAM console.
2. **Update the Template**: Replace `ACCOUNT_ID`, `YOUR_GITHUB_ORG`, and `YOUR_REPO_NAME` in `trust-policy.json` with
   your actual values.
3. **Restricted Access**: The `StringLike` condition ensures that only workflows running in your specific GitHub
   repository can assume this role, providing a high level of security.

### Minimum Permissions

If you prefer to manage permissions manually, ensure the role covers:

## 3. Initial Setup

1. **Install Dependencies**:

   ```bash
   pnpm install
   ```

2. **Initialize Pulumi Stack**:
   Navigate to the `infra` directory and create a new stack (e.g., `dev`):
   ```bash
   cd infra
   pulumi stack init dev
   ```

## 4. Configuration

The project requires several configuration values. Set these using the `pulumi config` command from the `infra`
directory.

| Key                | Description                                                   | Example                          |
| :----------------- | :------------------------------------------------------------ | :------------------------------- |
| `sourceEmail`      | The verified email address that sends the email.              | `noreply@yourdomain.com`         |
| `destinationEmail` | The email address where you want to receive form submissions. | `yourname@gmail.com`             |
| `allowedOrigins`   | A JSON array of origins allowed to call the API (CORS).       | `["https://www.yourdomain.com"]` |

### Command Examples:

```bash
# Set emails
pulumi config set sourceEmail sender@example.com
pulumi config set destinationEmail receiver@example.com

# Set allowed origins (JSON format)
pulumi config set --path allowedOrigins '["https://example.com", "http://localhost:3000"]'
```

## 5. Deployment

Follow these steps to build the code and deploy the infrastructure:

1. **Build the Lambda Source**:
   From the **project root**, run the build script to compile TypeScript to JavaScript in the `dist/` folder:

   ```bash
   pnpm build
   ```

2. **Deploy with Pulumi**:
   From the `infra/` directory, run:
   ```bash
   pulumi up
   ```
   Review the plan and select `yes` to perform the deployment.

## 6. Post-Deployment Steps

1. **Verify Email Identities**:
   AWS SES will send verification emails to both the `sourceEmail` and `destinationEmail`. **You must click the links in
   those emails** before SES will allow the Lambda to send messages.

2. **Note the API Endpoint**:
   Once `pulumi up` completes, it will output the `apiUrl`. You will need this for your frontend integration (see
   `doc/how-to/web-setup.md`).

3. **SES Sandbox**:
   New AWS accounts are placed in the "SES Sandbox" by default. In the sandbox, you can only send emails to verified
   addresses. If you want to send emails to any user-provided email (as a confirmation), you must request
   a [limit increase](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) to move out of the
   sandbox. However, since this project sends to a **fixed** destination email (which you verify), the sandbox is
   usually sufficient.

## 7. Maintenance & Updates

- **Code Changes**: If you modify `src/index.ts`, run `pnpm build` and then `pulumi up` from the `infra` directory.
- **Infrastructure Changes**: Modify the files in `infra/` and run `pulumi up`.
- **Destroying Resources**: To tear down the infrastructure and stop costs:
  ```bash
  pulumi destroy
  ```
