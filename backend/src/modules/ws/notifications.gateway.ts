import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server as WsServer } from 'ws';
import type WebSocket from 'ws';
import type { IncomingMessage } from 'node:http';
import { URL } from 'node:url';
import { KeycloakJwksProvider } from '../../infra/keycloak/keycloak-jwks.provider';
import { PluginTokenService } from '../../infra/keycloak/plugin-token.service';
import { PrincipalResolverService } from '../../infra/keycloak/principal-resolver.service';
import { ConnectionRegistry } from './connection-registry';
import { WsFanoutService } from '../notifications/ws-fanout.service';
import { NotificationsService } from '../notifications/notifications.service';

const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_TIMEOUT_MS = 90_000;

interface AuthedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
  lastSeenAt?: number;
}

/**
 * `/ws` gateway. Validates the handshake against Keycloak or a plugin device
 * token, joins the socket to `user:<userId>`, ships an initial `hello`, and
 * forwards every Redis-fanout message destined for that user.
 *
 * Heartbeats every 30 s — sockets without a pong in 90 s are closed.
 *
 * The gateway lives in API-mode only (workers don't serve HTTP for this
 * endpoint). Cross-replica fan-out is handled by `WsFanoutService`.
 */
@WebSocketGateway({ path: '/ws' })
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsGateway.name);
  @WebSocketServer() server!: WsServer;
  private unsubscribe?: () => void;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly jwks: KeycloakJwksProvider,
    private readonly pluginTokens: PluginTokenService,
    private readonly registry: ConnectionRegistry,
    private readonly wsFanout: WsFanoutService,
    private readonly notifications: NotificationsService,
    private readonly principals: PrincipalResolverService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.wsFanout.subscribe((message) => {
      for (const socket of this.registry.forUser(message.userId)) {
        if (socket.readyState === socket.OPEN) {
          socket.send(
            JSON.stringify({
              type: message.type,
              id: message.id,
              ts: message.ts,
              payload: message.payload,
            }),
          );
        }
      }
    });
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  afterInit(): void {
    this.logger.log('WS gateway online at /ws');
  }

  async handleConnection(socket: AuthedSocket, request: IncomingMessage): Promise<void> {
    let userId: string | null = null;
    try {
      userId = await this.authenticate(request);
    } catch (err) {
      this.logger.debug(`WS auth failed: ${(err as Error).message}`);
    }
    if (!userId) {
      socket.send(JSON.stringify({ type: 'error', payload: { code: 'auth.unauthenticated' } }));
      socket.close(4401, 'unauthenticated');
      return;
    }
    socket.userId = userId;
    socket.isAlive = true;
    socket.lastSeenAt = Date.now();
    this.registry.add(userId, socket);

    socket.on('pong', () => {
      socket.isAlive = true;
      socket.lastSeenAt = Date.now();
    });
    socket.on('message', () => {
      // Client → server messages are not part of the protocol. Treat any
      // inbound traffic as a liveness signal but don't act on it.
      socket.lastSeenAt = Date.now();
    });

    socket.send(
      JSON.stringify(
        this.notifications.newWsEnvelope('hello', {
          userId,
          serverTime: new Date().toISOString(),
        }),
      ),
    );
  }

  handleDisconnect(socket: AuthedSocket): void {
    if (socket.userId) this.registry.remove(socket.userId, socket);
  }

  private async authenticate(request: IncomingMessage): Promise<string | null> {
    const fullUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const bearer = fullUrl.searchParams.get('token');
    const pluginToken = fullUrl.searchParams.get('pluginToken');
    if (bearer) {
      const claims = await this.jwks.verify(bearer);
      // Reuse the HTTP guard's Redis-cached principal resolution (same
      // `authz:principal:<sub>` key) so reconnects within the cache window skip
      // the Postgres lookup and admin promote/demote invalidation covers WS too.
      const { user } = await this.principals.resolvePrincipal(claims);
      return user.id;
    }
    if (pluginToken) {
      const verified = await this.pluginTokens.verifyAndTouch(pluginToken);
      return verified?.user.id ?? null;
    }
    return null;
  }

  private tick(): void {
    const now = Date.now();
    for (const [userId, set] of (
      this.registry as unknown as {
        sockets: Map<string, Set<AuthedSocket>>;
      }
    ).sockets.entries()) {
      for (const socket of set) {
        if (!socket.isAlive || (socket.lastSeenAt && now - socket.lastSeenAt > IDLE_TIMEOUT_MS)) {
          this.registry.remove(userId, socket);
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        try {
          socket.ping();
        } catch {
          // ignore — next tick will close it via the liveness flag
        }
      }
    }
  }
}
