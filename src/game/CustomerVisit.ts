import type { Scene, Time, Tweens } from 'phaser';
import { shelfPosition } from './shelfLayout.ts';
import { items } from '../domain/economy.ts';
import { gameUiStore } from '../stores/gameUiStore.ts';
import { gameStore } from '../stores/gameStore.ts';

// 이동·대기만 Phaser가 담당하며, 구매 판단과 거래는 도메인/공유 상태가 처리한다.
export function attachCustomerVisit(scene: Scene, store = gameStore, ui = gameUiStore) {
    const body = scene.add.graphics();
    body.fillStyle(0x11131c, 0.4).fillEllipse(0, 5, 32, 12);
    body.fillStyle(0xb4a2d4).fillRect(-12, -23, 24, 27);
    body.fillStyle(0xf0c9a3).fillRect(-9, -41, 18, 18);
    body.fillStyle(0x544460).fillRect(-12, -46, 24, 10);
    body.fillStyle(0x393341).fillRect(-11, 3, 9, 8).fillRect(2, 3, 9, 8);
    const label = scene.add.text(0, -58, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#fff2d6', backgroundColor: '#292438', align: 'center', padding: { x: 8, y: 5 } }).setOrigin(0.5, 1);
    const actor = scene.add.container(400, 489, [body, label]).setDepth(10).setVisible(false);
    let key = '';
    let motion: Tweens.Tween | undefined;
    let timer: Time.TimerEvent | undefined;
    let disposed = false;

    function stop() {
        motion?.stop();
        motion = undefined;
        timer?.remove(false);
        timer = undefined;
    }
    function sync() {
        if (disposed) return;
        const { visit, session } = store.getSnapshot();
        const nextKey = `${session}:${visit ? `${visit.id}:${visit.phase}` : 'none'}`;
        if (key === nextKey) return; // 가격·재고 변경으로 이동이나 구매 타이머를 재시작하지 않는다.
        key = nextKey;
        stop();
        if (!visit || visit.phase === 'completed') { actor.setVisible(false); return; }
        actor.setVisible(true);
        const { centerX: x, customerY: y } = shelfPosition(items.findIndex(item => item.id === visit.customer.itemId));
        const isCurrent = () => {
            const current = store.getSnapshot();
            return !disposed && ui.getSnapshot().menu === null && current.session === session && current.visit?.id === visit.id && current.visit.phase === visit.phase;
        };
        const advance = (event: 'arrived' | 'decide' | 'departed') => {
            if (isCurrent()) store.advanceVisit(visit.id, event, session);
        };
        if (visit.phase === 'arriving') {
            actor.setPosition(400, 489);
            label.setText(visit.customer.name);
            motion = scene.tweens.add({ targets: actor, x, y, duration: 1500, ease: 'Sine.easeInOut', onComplete: () => { if (!isCurrent()) return; motion = undefined; advance('arrived'); } });
        } else if (visit.phase === 'browsing') {
            actor.setPosition(x, y);
            label.setText('상품을 살펴보는 중…');
            timer = scene.time.delayedCall(1800, () => { if (!isCurrent()) return; timer = undefined; advance('decide'); });
        } else {
            actor.setPosition(x, y);
            label.setText(visit.outcome?.kind === 'purchased' ? '고마워요!' : '다음에 올게요.');
            motion = scene.tweens.add({ targets: actor, x: 400, y: 489, duration: 1500, ease: 'Sine.easeInOut', onComplete: () => { if (!isCurrent()) return; motion = undefined; advance('departed'); } });
        }
    }
    const unsubscribe = store.subscribe(sync);
    sync();
    return () => {
        disposed = true;
        unsubscribe();
        stop();
    };
}
