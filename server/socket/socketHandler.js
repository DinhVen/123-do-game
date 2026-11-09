'use strict';

const logger = require('../logger');

function isLocalAddress(remoteAddress = '') {
  return (
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1'
  );
}

function isAuthorizedMockRequest(socket, payload, config) {
  const remoteAddr =
    (socket.handshake && socket.handshake.address) ||
    (socket.conn && socket.conn.remoteAddress) ||
    '';
  const providedToken =
    (payload && payload.token) ||
    (socket.handshake && socket.handshake.auth && socket.handshake.auth.token) ||
    '';

  if (config.adminToken && config.adminToken.length > 0) {
    return providedToken === config.adminToken;
  }
  return isLocalAddress(remoteAddr);
}

function registerSocketHandlers(io, mockService, config, gameStateManager = null) {
  io.on('connection', (socket) => {
    logger.info('Socket.io client connected', { socketId: socket.id });

    if (gameStateManager) {
      const initialSnapshot = gameStateManager.getSnapshot();
      socket.emit('game:state_snapshot', {
        stateVersion: initialSnapshot.stateVersion,
        state: initialSnapshot
      });
    }

    socket.on('client:ready', (clientInfo = {}, ack) => {
      const clientType =
        clientInfo && typeof clientInfo.clientType === 'string'
          ? clientInfo.clientType
          : 'obs';

      const currentSnapshot = gameStateManager ? gameStateManager.getSnapshot() : null;
      const handshakePayload = {
        status: 'connected',
        phase: config.app.phase,
        mode: config.app.defaultMode,
        clientType,
        serverTimestamp: Date.now(),
        stateVersion: currentSnapshot ? currentSnapshot.stateVersion : 0,
        state: currentSnapshot
      };

      socket.emit('server:ready', handshakePayload);
      if (currentSnapshot) {
        socket.emit('game:state_snapshot', {
          stateVersion: currentSnapshot.stateVersion,
          state: currentSnapshot
        });
      }
      if (typeof ack === 'function') {
        ack({ ok: true, ...handshakePayload });
      }
    });

    socket.on('client:request_snapshot', (payload = {}, ack) => {
      if (!gameStateManager) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'GameStateManager not initialized.' });
        }
        return;
      }
      const snapshot = gameStateManager.getSnapshot();
      const responsePayload = {
        stateVersion: snapshot.stateVersion,
        state: snapshot
      };
      socket.emit('game:state_snapshot', responsePayload);
      if (typeof ack === 'function') {
        ack({ ok: true, ...responsePayload });
      }
    });

    socket.on('mock:trigger_event', (data = {}, ack) => {
      try {
        if (!isAuthorizedMockRequest(socket, data, config)) {
          const authError = {
            ok: false,
            error: 'Unauthorized mock trigger request.'
          };
          socket.emit('mock:event_error', authError);
          if (typeof ack === 'function') {
            ack(authError);
          }
          return;
        }

        const rawEvent =
          data && data.rawEvent !== undefined ? data.rawEvent : data;
        const result = mockService.processMockEvent(rawEvent);

        if (!result.ok) {
          socket.emit('mock:event_error', result);
        }
        if (typeof ack === 'function') {
          ack(result);
        }
      } catch (err) {
        logger.error('Error handling mock:trigger_event', {
          error: err.message
        });
        const errResp = { ok: false, error: 'Internal mock event handler error.' };
        socket.emit('mock:event_error', errResp);
        if (typeof ack === 'function') {
          ack(errResp);
        }
      }
    });

    socket.on('error', (err) => {
      logger.warn('Socket client error', {
        socketId: socket.id,
        error: err && err.message ? err.message : 'Unknown socket error'
      });
    });

    socket.on('disconnect', (reason) => {
      logger.info('Socket.io client disconnected', {
        socketId: socket.id,
        reason
      });
    });
  });
}

module.exports = {
  registerSocketHandlers,
  isLocalAddress
};
