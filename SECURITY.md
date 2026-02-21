# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email the maintainers or use [GitHub's private vulnerability reporting](../../security/advisories/new)
3. Include steps to reproduce and potential impact

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Scope

Lore is a convention-based framework with no runtime server or network services. Security concerns are primarily:

- Hook scripts that execute on every tool use (potential for injection if hooks are modified)
- Shell scripts that parse file content (potential for command injection via crafted filenames or content)
- Docker configuration for the docs server (container isolation)

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.10.x   | Yes       |
