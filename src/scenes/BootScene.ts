import Phaser from 'phaser';
import { makeSharedTextures } from '../systems/textures';
import { loadSave, newSave, writeSave } from '../systems/save';
import { ui } from '../systems/ui';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    makeSharedTextures(this);
    const save = loadSave();
    const hasSave = save.lifetimeEarned > 0 || save.floors[save.currentFloor]?.purchased.length > 0;
    ui.showHud(false);
    ui.showTitle({
      hasSave,
      onContinue: () => this.scene.start('Game', { floorId: save.currentFloor }),
      onNew: () => {
        const fresh = newSave();
        writeSave(fresh);
        this.scene.start('Game', { floorId: fresh.currentFloor });
      },
    });
  }
}
