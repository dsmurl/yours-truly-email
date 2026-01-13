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

A specific IAM policy called `yours-truely-email-creator-policy` for the deployment user/role is provided in `infra/policy/yours-truly-email-deploy-policy.json`.
You can create a custom policy in the AWS Console using this JSON to grant the exact permissions needed.

If you need to tear down the infrastructure, a corresponding destroy policy is provided in `infra/policy/yours-truly-email-destroy-policy.json`. This policy grants the minimum permissions required to delete the resources created by this project.

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
   Navigate to the `src/infra` directory and create a new stack (e.g., `dev`):
   ```bash
   cd src/infra
   pulumi stack init dev
   ```

## 4. Configuration

The project requires several configuration values. Use the **`.env`** file to manage these settings.

1.  Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
2.  Open `.env` and fill in your values.
3.  If you are using [Granted](https://granted.dev/) to assume AWS roles, you can run:
    ```bash
    assume <your-profile-name>
    # The AWS credentials will be automatically injected into your session
    ```

## 5. Deployment

Follow these steps to build the code and deploy the infrastructure:

1.  **Build the Lambda Source**:
    From the **project root**, run the build script to compile TypeScript to JavaScript in the `dist/` folder:

    ```bash
    pnpm build
    ```

2.  **Deploy with Pulumi**:
    From the root, you can run Pulumi while pointing to the infrastructure directory:
    ```bash
    pulumi up --cwd src/infra
    ```
    Review the plan and select `yes` to perform the deployment.

## 6. Post-Deployment Steps

1. **Verify Email Identities**:
   AWS SES will send verification emails to both the `sourceEmail` and `destinationEmail`. **You must click the links in
   those emails** before SES will allow the Lambda to send messages.

2. **Note the API Endpoint**:
   Once `pulumi up` completes, it will output the `apiUrl`. You will need this for your frontend integration (see
   `doc/how-to/web-setup.md`).

3. **WAF Association**:
   The infrastructure automatically attempts to link your API Gateway Stage to the WAF Web ACL. 

   - **Troubleshooting "Invalid ARN"**: If you see a `WAFInvalidParameterException: The ARN isn't valid`, this is likely due to AWS caching a "shorthand" ARN from a previous failed attempt. 
   - **Fix**: The best way to resolve this is to perform a clean deployment:
     ```bash
     pnpm build
     pulumi destroy --cwd src/infra
     pulumi up --cwd src/infra
     ```
   - **Manual Verification**: In the AWS Console, your API (HTTP API) will be listed under **WAF & Shield** > **Web ACLs** > [Your ACL] > **Associated AWS resources** > **Add AWS resources** > **API Gateway REST API**.

4. **SES Sandbox**:
   New AWS accounts are placed in the "SES Sandbox" by default. In the sandbox, you can only send emails to verified
   addresses. If you want to send emails to any user-provided email (as a confirmation), you must request
   a [limit increase](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) to move out of the
   sandbox. However, since this project sends to a **fixed** destination email (which you verify), the sandbox is
   usually sufficient.

## 7. Maintenance & Updates

- **Code Changes**: If you modify `src/lambda/contact/index.ts`, run `pnpm build` and then `pulumi up --cwd src/infra`.
- **Infrastructure Changes**: Modify the files in `src/infra/` and run `pulumi up --cwd src/infra`.
- **Destroying Resources**: To tear down the infrastructure and stop costs:
  1. (Optional) Apply the `yours-truly-email-destroy-policy.json` to your deployment role if your current permissions are insufficient for deletion.
  2. Run the destroy command:
     ```bash
     pulumi destroy --cwd src/infra
     ```
