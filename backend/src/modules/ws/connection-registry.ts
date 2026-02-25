import { Injectable } from '@nestjs/common';
import type WebSocket from 'ws';

/**
 * Per-process map of `userId` → open sockets. The gateway consults this when
 * an inbound `ws:fanout` Redis message arrives, so the message is delivered
 * to every tab/device the user has open against THIS replica.
 */
@Injectable()
export class ConnectionRegistry {
  private readonly sockets = new Map<string, Set<WebSocket>>();

  add(userId: string, socket: WebSocket): void {
    let set = this.sockets.get(userId);
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socket);
  }

  remove(userId: string, socket: WebSocket): void {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.sockets.delete(userId);
  }

  forUser(userId: string): WebSocket[] {
    return Array.from(this.sockets.get(userId) ?? []);
  }

  totalSockets(): number {
    let count = 0;
    for (const set of this.sockets.values()) count += set.size;
    return count;
  }
}
