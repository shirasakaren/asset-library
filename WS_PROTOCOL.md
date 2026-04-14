# MGM Asset Library — WebSocket protocol

This document is the contract between the backend's notification gateway and
its consumers (web frontend, Unity plugin, Unreal plugin).

## Endpoint

`wss://asset-api.labmgm.org/ws`

In development the same endpoint is `ws://localhost:4000/ws` (no TLS).

## Authentication (handshake)

The server validates the handshake before upgrading. Pass one of:

- `?token=<keycloak access token>` — web client.
- `?pluginToken=<plugin device token>` — Unity / Unreal plugin (issued by
  `POST /auth/plugin/exchange`).

A failed authentication closes the socket with code `4401` and reason
`unauthenticated`.

After a successful handshake the server immediately sends:

```json
{ "type": "hello", "id": "<uuid>", "ts": 1716192000000, "payload": { "userId": "cln…", "serverTime": "2026-05-20T03:00:00.000Z" } }
```

## Direction

Server → client only. Clients **never** push application messages. Inbound
frames are ignored on the application layer (we still update the liveness
timer when we see one).

## Envelope

Every server-emitted application message uses the same envelope:

```json
{
  "type": "notification:new",
  "id": "<uuid>",
  "ts": 1716192000000,
  "payload": { ... }
}
```

`type` values currently in use:

| `type`                  | When                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `hello`                 | Sent once after successful handshake.                                 |
| `notification:new`      | A new in-app notification was created for this user.                  |
| `notification:read`     | An open tab marked one notification as read (multi-device sync).      |
| `notification:read-all` | An open tab marked all notifications as read.                         |
