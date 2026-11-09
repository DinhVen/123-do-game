import Phaser from 'phaser';
import { PALETTE } from '../ui/Layout.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Task 2.1 uses pure Phaser Graphics, Shapes, and Text placeholders.
    // No external images or spritesheets are loaded.
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.NIGHT_ASPHALT_DARK);
    this.scene.start('MainScene');
  }
}
