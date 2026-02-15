import { test as setup, expect } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Logs each test persona into Keycloak via the direct-grant flow and
 * persists their Auth.js session as a Playwright storage state JSON.
 *
 * Required environment for setup to run:
 *   E2E_BASE_URL         — frontend URL under test (defaults to http://localhost:3000)
 *   E2E_KEYCLOAK_ISSUER  — same as KEYCLOAK_ISSUER on the server
 *   E2E_KEYCLOAK_CLIENT  — confidential client id (e.g. mgm-asset-library-web)
 *   E2E_KEYCLOAK_SECRET  — client secret
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   E2E_CONTRIB_EMAIL / E2E_CONTRIB_PASSWORD
 *   E2E_USER_EMAIL / E2E_USER_PASSWORD
 *
 * The test realm must allow the "Direct access grants" flow on the client.
 */

const PERSONAS = ['admin', 'contributor', 'user'] as const;
type Persona = (typeof PERSONAS)[number];

interface PersonaCreds {
  email: string;
  password: string;
}

function readCreds(persona: Persona): PersonaCreds | null {
  const PREFIX: Record<Persona, string> = {
    admin: 'E2E_ADMIN',
    contributor: 'E2E_CONTRIB',
    user: 'E2E_USER',
  };
  const email = process.env[`${PREFIX[persona]}_EMAIL`];
  const password = process.env[`${PREFIX[persona]}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
