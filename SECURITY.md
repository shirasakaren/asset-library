# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a vulnerability

The MGM Asset Library is an internal service. If you believe you have found a
security issue, please report it to the lab platform team directly instead of
opening a public issue:

- Email: `platform-security@labmgm.org`
- Subject prefix: `[ASSET-LIBRARY SECURITY]`

Please include reproduction steps, affected endpoints, and the impact you
expect. The platform team will acknowledge within 3 working days and will
coordinate a fix and release timeline with you.

## Scope

In scope: the API (`backend/`), the web client (`frontend/`), the worker
pipeline, and the deployment configuration in this repository. The Keycloak
realm and host infrastructure are owned by the platform team and are out of
scope for this repository.
