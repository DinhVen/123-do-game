'use strict';

const logger = require('../logger');

class SequentialEventQueue {
  constructor(handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new TypeError('SequentialEventQueue requires a handler function.');
    }
    this.handler = handler;
    this.maxQueueLength = options.maxQueueLength || 1000;
    this.queue = [];
    this.isProcessing = false;
    this.isStopped = false;
  }

  stop() {
    this.isStopped = true;
    this.queue.length = 0;
  }

  enqueue(event) {
    if (this.isStopped) {
      return {
        ok: false,
        error: 'Server event queue is stopped.'
      };
    }
    if (this.queue.length >= this.maxQueueLength) {
      logger.warn('Server Event Queue reached max capacity, dropping event', {
        eventId: event && event.eventId,
        maxQueueLength: this.maxQueueLength
      });
      return {
        ok: false,
        error: 'Server event queue is full.'
      };
    }

    let resultHolder = null;
    let errorHolder = null;

    this.queue.push({
      event,
      onComplete: (res) => {
        resultHolder = res;
      },
      onError: (err) => {
        errorHolder = err;
      }
    });

    this.drainSync();

    if (errorHolder) {
      throw errorHolder;
    }
    return resultHolder;
  }

  drainSync() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      while (this.queue.length > 0 && !this.isStopped) {
        const item = this.queue.shift();
        try {
          const res = this.handler(item.event);
          item.onComplete(res);
        } catch (err) {
          logger.error('Error processing event in SequentialEventQueue', {
            eventId: item.event && item.event.eventId,
            error: err.message
          });
          item.onError(err);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  getLength() {
    return this.queue.length;
  }
}

module.exports = {
  SequentialEventQueue
};
