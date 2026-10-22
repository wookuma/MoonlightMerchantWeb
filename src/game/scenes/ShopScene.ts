import { Scene, Scenes } from 'phaser';
import { shelfPosition } from '../shelfLayout';
import { addArtFrames, addCustomerAnimations, artAssets } from '../art';
import { items } from '../../domain/economy';
import { shelfFeedback } from '../salesFeedback';
import { gameStore } from '../../stores/gameStore';
import { bindMenuPause } from '../menuPause';
import { attachCustomerVisit } from '../CustomerVisit';

export class ShopScene extends Scene {
    private artLoadFailed = false;
    constructor() { super('ShopScene'); }

    preload() {
        this.artLoadFailed = false;
        const loading = this.add.text(400, 300, '달빛 잡화점을 준비하고 있어요…', {
            fontFamily: 'sans-serif', fontSize: '18px', color: '#e8cf9b',
        }).setOrigin(0.5);
        const failed = () => { this.artLoadFailed = true; };
        this.load.on('loaderror', failed);
        this.load.once('complete', () => { this.load.off('loaderror', failed); loading.destroy(); });
        for (const asset of Object.values(artAssets)) this.load.image(asset.key, asset.url);
    }

    create() {
        if (this.artLoadFailed) {
            this.add.text(400, 300, '상점 이미지를 불러오지 못했어요.\n새로고침해 주세요.', {
                fontFamily: 'sans-serif', fontSize: '18px', color: '#edd3aa', align: 'center', lineSpacing: 12,
            }).setOrigin(0.5);
            return;
        }
        addArtFrames(this);
        addCustomerAnimations(this);
        this.add.image(400, 300, artAssets.interior.key).setDisplaySize(800, 600);
        // 계산대 뒤의 상점 주인. 하반신은 계산대에 가려지는 높이로 표시한다.
        this.add.image(724, 300, artAssets.characters.key, 5).setOrigin(0.5, 1).setDisplaySize(100, 100).setCrop(0, 0, 512, 320);
        const displays = items.map((item, index) => {
            const { x, centerX } = shelfPosition(index);
            this.add.image(centerX, 112, artAssets.icons.key, index).setDisplaySize(24, 24);
            const label = this.add.text(centerX, 246, '', {
                fontFamily: 'sans-serif', fontSize: '11px', color: '#f0dfbc', backgroundColor: '#271c2d',
                align: 'center', padding: { x: 7, y: 5 }, lineSpacing: 3,
            }).setOrigin(0.5, 0);
            // 최대 확장 한도 7개를 만들고 실제 진열 수량만 표시한다.
            const goods = Array.from({ length: 7 }, (_, unit) => this.add.image(
                x + 7 + (unit % 4) * 22, 154 + Math.floor(unit / 4) * 42, artAssets.icons.key, index,
            ).setDisplaySize(30, 30).setOrigin(0.5, 1).setVisible(false));
            return { item, label, goods };
        });
        const refresh = () => {
            const { economy } = gameStore.getSnapshot();
            for (const { item, label, goods } of displays) {
                const count = economy.displayed[item.id];
                const feedback = shelfFeedback(economy,item.id);
                label.setText(`${item.name}\n${feedback.label}`).setColor(feedback.color).setBackgroundColor(feedback.background);
                goods.forEach((image, index) => { image.setVisible(index < count); });
            }
        };
        refresh();
        const unsubscribe = gameStore.subscribe(refresh);
        const detachPause = bindMenuPause(this);
        const detachCustomer = attachCustomerVisit(this);
        for (const event of [Scenes.Events.SHUTDOWN, Scenes.Events.DESTROY]) {
            this.events.once(event, detachPause);
            this.events.once(event, detachCustomer);
            this.events.once(event, unsubscribe);
        }
    }
}
