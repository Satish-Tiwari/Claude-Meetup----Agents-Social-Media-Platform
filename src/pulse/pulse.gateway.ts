import {
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

const PULSE_ROOM = 'pulse';

/**
 * Real-time side of the Pulse feed. Shares the Socket.IO server with the
 * signalling gateway (same port); viewers opt in with `pulse-subscribe`.
 */
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class PulseGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('pulse-subscribe')
  subscribe(@ConnectedSocket() client: Socket) {
    client.join(PULSE_ROOM);
    return { ok: true };
  }

  @SubscribeMessage('pulse-unsubscribe')
  unsubscribe(@ConnectedSocket() client: Socket) {
    client.leave(PULSE_ROOM);
  }

  emitPost(post: unknown) {
    this.server?.to(PULSE_ROOM).emit('pulse-post', post);
  }

  emitReaction(update: unknown) {
    this.server?.to(PULSE_ROOM).emit('pulse-reaction', update);
  }

  emitAgent(status: unknown) {
    this.server?.to(PULSE_ROOM).emit('pulse-agent', status);
  }
}
