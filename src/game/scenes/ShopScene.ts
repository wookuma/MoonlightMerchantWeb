import { Scene, Scenes } from 'phaser';
import { shelfPosition } from '../shelfLayout';
import { items } from '../../domain/economy';
import { displayCapacity } from '../../domain/shopExpansion';
import { gameStore } from '../../stores/gameStore';
import { bindMenuPause } from '../menuPause';
import { attachCustomerVisit } from '../CustomerVisit';
import type { GameObjects } from 'phaser';

export class ShopScene extends Scene {
    constructor() { super('ShopScene'); }

    create() {
        const g = this.add.graphics();
        const rect = (x: number, y: number, w: number, h: number, color: number) => { g.fillStyle(color).fillRect(x, y, w, h); };
        // 외부 이미지 없이 임시 상점 공간을 그린다.
        rect(38, 42, 724, 514, 0x151b25);
        rect(52, 52, 696, 472, 0x414257);
        rect(64, 170, 672, 342, 0x715344);
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 12; col++) {
                const x = 64 + col * 56, y = 172 + row * 38;
                rect(x + 1, y + 1, 54, 36, (row + col) % 3 === 0 ? 0x80604c : 0x775742);
                rect(x + 4, y + 5, 40, 2, 0x89674f);
            }
        }
        rect(52, 159, 696, 14, 0x252d3d);
        rect(52, 52, 12, 472, 0x292d3c);
        rect(736, 52, 12, 472, 0x292d3c);
        // 달빛이 들어오는 창문.
        rect(104, 69, 104, 82, 0x242b40);
        rect(112, 77, 88, 66, 0x596681);
        g.fillStyle(0xeee0b0).fillCircle(177, 96, 13);
        g.fillStyle(0x596681).fillCircle(183, 91, 12);
        rect(153, 77, 5, 66, 0x242b40);
        rect(112, 108, 88, 5, 0x242b40);
        rect(98, 149, 116, 8, 0xb18b61);
        // 간판과 작은 책장.
        rect(280, 80, 252, 61, 0x292c3b);
        this.add.text(406, 110, 'MOONLIGHT\nMERCHANT', { fontFamily: 'Georgia', fontSize: '19px', align: 'center', color: '#e2c58b', lineSpacing: 1 }).setOrigin(0.5);
        rect(614, 86, 68, 68, 0x302b32);
        for (let i = 0; i < 6; i++) rect(620 + i * 9, 96, 6, 42 - i % 3 * 7, [0x849c8a, 0xb58f80, 0x9b9cb8][i % 3]);
        rect(609, 141, 78, 7, 0xb18b61);
        // 카펫, 계산대, 상점 주인.
        rect(280, 352, 244, 126, 0x3e354d);
        rect(288, 360, 228, 110, 0x77607c);
        rect(298, 370, 208, 90, 0x51455f);
        rect(330, 373, 144, 80, 0x66516f);
        rect(575, 355, 120, 94, 0x392d2a);
        rect(565, 343, 140, 38, 0xb58d62);
        rect(571, 349, 128, 22, 0xc7a175);
        rect(650, 328, 32, 22, 0x545460);
        rect(655, 332, 22, 8, 0xb9bdad);
        rect(607, 299, 24, 24, 0xe6bd97);
        rect(603, 292, 32, 12, 0x38303e);
        rect(603, 321, 32, 22, 0x8a9b97);
        rect(91, 400, 43, 34, 0xa37959);
        rect(96, 380, 9, 25, 0x82a58b); rect(109, 367, 9, 38, 0x97b197); rect(121, 386, 9, 19, 0x82a58b);
        rect(354, 486, 92, 30, 0x2a2e3f);
        this.add.text(400, 546, '☾   달빛이 머무는 작은 상점   ☾', { fontFamily: 'sans-serif', fontSize: '15px', color: '#b2abc2' }).setOrigin(0.5);

        const labels: GameObjects.Text[] = [];
        const goods = this.add.graphics();
        items.forEach((item, index) => {
            const { x, centerX } = shelfPosition(index);
            rect(x, 205, 104, 110, 0x372d2b);
            rect(x - 6, 198, 116, 14, 0xb48b61);
            rect(x + 6, 218, 92, 72, 0x604333);
            rect(x - 6, 269, 116, 10, 0xb48b61);
            labels.push(this.add.text(centerX, 325, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#f0dcc0', backgroundColor: '#322c35', padding: { x: 9, y: 5 } }).setOrigin(0.5));
            this.add.text(centerX, 182, item.name, { fontFamily: 'sans-serif', fontSize: '13px', color: '#e8d7bd' }).setOrigin(0.5);
        });
        const refresh = () => {
            goods.clear();
            const { economy } = gameStore.getSnapshot();
            const capacity = displayCapacity(economy);
            items.forEach((item, index) => {
                const count = economy.displayed[item.id];
                labels[index].setText(`진열 ${count}/${capacity}개`);
                const color = Number.parseInt(item.color.slice(1), 16);
                for (let i = 0; i < Math.min(count, capacity); i++) {
                    const x = shelfPosition(index).x + 7 + (i % 4) * 23;
                    const y = 231 + Math.floor(i / 4) * 31;
                    goods.fillStyle(color).fillRect(x, y, 16, 21);
                    goods.fillStyle(0xe7d4ac).fillRect(x + 3, y - 5, 10, 6);
                    goods.fillStyle(0xffffff, 0.35).fillRect(x + 3, y + 4, 3, 10);
                }
            });
        };
        refresh();
        const unsubscribe = gameStore.subscribe(refresh);
        const detachPause = bindMenuPause(this);
        const detachCustomer = attachCustomerVisit(this);
        this.events.once(Scenes.Events.SHUTDOWN, detachPause);
        this.events.once(Scenes.Events.DESTROY, detachPause);
        this.events.once(Scenes.Events.SHUTDOWN, detachCustomer);
        this.events.once(Scenes.Events.DESTROY, detachCustomer);
        this.events.once(Scenes.Events.SHUTDOWN, unsubscribe);
        this.events.once(Scenes.Events.DESTROY, unsubscribe);
    }
}
