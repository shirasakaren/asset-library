// Lightweight liveness probe used by the container healthcheck
// (`wget http://127.0.0.1:3000/health`). Kept dependency-free so it stays
// green even when downstream services (backend API, Keycloak) are degraded.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' }, { status: 200 });
}
