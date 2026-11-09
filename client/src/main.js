import Phaser from 'phaser';
import { createPhaserConfig } from './game/config.js';

let gameInstance = null;

export function initGame() {
  if (gameInstance) {
    return gameInstance;
  }

  const config = createPhaserConfig('game-container');
  gameInstance = new Phaser.Game(config);

  if (typeof window !== 'undefined') {
    window.__PHASER_GAME__ = gameInstance;
  }

  return gameInstance;
}

initGame();
