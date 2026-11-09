import Phaser from 'phaser';
import { RESOLUTION, PALETTE, isDevPreviewModeRequested } from './ui/Layout.js';
import { BootScene } from './scenes/BootScene.js';
import { MainScene } from './scenes/MainScene.js';

export { isDevPreviewModeRequested };


export function createPhaserConfig(parentElementId = 'game-container') {
  return {
    type: Phaser.AUTO,
    parent: parentElementId,
    width: RESOLUTION.LOGICAL_WIDTH,
    height: RESOLUTION.LOGICAL_HEIGHT,
    backgroundColor: PALETTE.NIGHT_ASPHALT_DARK,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: RESOLUTION.LOGICAL_WIDTH,
      height: RESOLUTION.LOGICAL_HEIGHT
    },
    scene: [BootScene, MainScene]
  };
}
