import { AUTO, Game, Scale } from 'phaser';
import { ShopScene } from './scenes/ShopScene';

export default function StartGame(parent: HTMLElement) {
    return new Game({
        type: AUTO, parent, width: 800, height: 600,
        backgroundColor: '#1f2431', pixelArt: true,
        scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
        scene: [ShopScene],
    });
}
