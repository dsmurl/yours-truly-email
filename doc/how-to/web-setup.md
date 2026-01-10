# Frontend Integration Guide

This guide explains how to integrate your external static website with the Secure Serverless Contact Form API.

## 1. Prerequisites

- The backend API must be deployed and you should have the **API Base URL**.
- AWS WAF CAPTCHA must be configured on the `/contact` endpoint.
- You will need to include the AWS WAF JS (Challenge) script in your frontend.

## 2. Including AWS WAF CAPTCHA

To interact with a WAF-protected endpoint, your frontend needs to handle the CAPTCHA token. AWS WAF provides a
JavaScript SDK that handles this.

### How it works for the user:

- **Challenge mode**: AWS WAF can automatically determine if a challenge is needed.
- **Popup/Overlay**: If a CAPTCHA is required, the SDK will automatically display an overlay on your website with the
  CAPTCHA puzzle. Once the user solves it, the overlay disappears, and the SDK provides a token.

Add the following script to your HTML:

```html
<script src="https://{WAF_DOMAIN_OR_API_GATEWAY_URL}/js/container.js" defer></script>
```

## 3. Implementation Example (JavaScript)

The following example demonstrates how to collect form data, obtain a WAF token (which may trigger a popup), and send
the request.

```javascript
async function submitContactForm() {
  const form = document.getElementById('contact-form');
  const formData = {
    name: form.name.value,
    email: form.email.value,
    message: form.message.value,
    _honeypot: form._honeypot.value, // Hidden field to catch bots
  };

  try {
    // 1. Obtain the WAF token.
    // IMPORTANT: If AWS WAF decides a CAPTCHA is needed, calling this function
    // will automatically trigger the CAPTCHA popup to appear for the user.
    // The code will 'await' (pause) here until the user solves the puzzle.
    const wafToken = await window.AwsWafIntegration.getToken();

    // 2. Send the request to the API
    const response = await fetch('https://{api-id}.execute-api.{region}.amazonaws.com/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-amzn-waf-token': wafToken, // Pass the token in the header
      },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      alert('Email sent successfully!');
      form.reset();
    } else {
      const error = await response.json();
      console.error('Submission failed:', error);
      alert(`Failed to send email: ${error.message || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('Error during submission:', err);
    alert('An unexpected error occurred. Please try again later.');
  }
}
```

## 4. Anti-Abuse Best Practices for Frontend

- **Honeypot Field**: Include a visually hidden input field. Bots will likely fill it, causing the backend to silently
  discard the request.
  ```html
  <input type="text" name="_honeypot" style="display:none" tabindex="-1" autocomplete="off" />
  ```
- **Button Debouncing**: Disable the submit button immediately after clicking to prevent multiple submissions during
  the "loading" state.
- **HTTPS Only**: Ensure your static site is also hosted on HTTPS to avoid "Mixed Content" warnings when calling the
  API.

## 5. CORS Considerations

Ensure the domain where your website is hosted (e.g., `https://www.yourdomain.com`) is added to the `Allowed Origins` in
the API Gateway / Pulumi configuration. Browser-based requests will fail without this.
