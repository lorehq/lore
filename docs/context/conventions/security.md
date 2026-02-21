---
required: true
---
# Security

## 1. No Secrets in the Repo

**Credentials, tokens, and keys never touch version control. Period.**

- Never write passwords, API keys, tokens, private keys, or connection strings into any file — docs, code, configs, or comments.
- Don't document "where the password is" with the actual value. Reference the secret manager, vault, or env var name — not the secret itself.
- If you encounter a secret in the repo, flag it immediately. Don't commit over it, move it, or reference it.
- `.env` files, credential JSONs, and key files belong in `.gitignore`. If they're not there, add them before doing anything else.

## 2. Assume Everything Is Visible

**Treat every committed file as public.**

- Even private repos get cloned, forked, shared, and leaked. Write accordingly.
- Don't embed internal URLs with auth tokens in query strings.
- Don't log or capture API responses that contain sensitive data.
- Sanitize examples: use `example.com`, `TOKEN_HERE`, `<your-api-key>` — never real values.

## 3. Validate at Boundaries

**Trust internal code. Verify external input.**

- Validate user input, API request bodies, webhook payloads, and anything from outside the system boundary.
- Don't add defensive validation inside internal function calls that you control.
- Parameterize all database queries. No string concatenation with user input.
- Escape output in the appropriate context (HTML, shell, SQL) before rendering or executing.

## 4. Least Privilege

**Grant the minimum access required. Nothing more.**

- Service accounts, API keys, and tokens should have the narrowest scope possible.
- Don't use admin/root credentials for routine operations.
- When documenting access patterns, note what permissions are required — not how to escalate them.
- Prefer short-lived tokens over long-lived ones. Document rotation procedures, not the tokens themselves.
