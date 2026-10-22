import type { Scene, Time, Tweens } from 'phaser';
import { shelfPosition, shopEntrance } from './shelfLayout.ts';
import { items } from '../domain/economy.ts';
import { visitFeedback } from './salesFeedback.ts';
import { artAssets, customerMotions } from './art.ts';
import { gameUiStore } from '../stores/gameUiStore.ts';
import { gameStore } from '../stores/gameStore.ts';

// 이동·대기만 Phaser가 담당하며, 구매 판단과 거래는 도메인/공유 상태가 처리한다.
export function attachCustomerVisit(scene: Scene, store = gameStore, ui = gameUiStore) {
    const body = scene.add.sprite(0, 0, artAssets.characters.key, 0).setDisplaySize(100, 100).setOrigin(0.5, 1);
    const label = scene.add.text(0, -112, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#39283c', backgroundColor: '#f3e5c7', align: 'center', padding: { x: 9, y: 6 } }).setOrigin(0.5, 1);
    const gain = scene.add.text(0, -144, '', { fontFamily: 'sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#ffe0a1', backgroundColor: '#34233d', padding: { x: 8, y: 5 } }).setOrigin(0.5, 1).setVisible(false);
    const actor = scene.add.container(shopEntrance.x, shopEntrance.y, [body, label, gain]).setDepth(10).setVisible(false);
    let key = '';
    let motion: Tweens.Tween | undefined;
    let timer: Time.TimerEvent | undefined;
    let disposed = false;

    // Sprite 프레임은 Clock/Tween 정지와 별도로 멈춰야 한다.
    function pauseAppearance() {
        if (disposed || !body.anims) return;
        if (ui.getSnapshot().menu !== null) body.anims.pause();
        else body.anims.resume();
    }
    function stop() {
        if (body.anims) body.stop();
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
        gain.setVisible(false).setAlpha(1).setY(-144);
        if (!visit || visit.phase === 'completed') { actor.setVisible(false); return; }
        actor.setVisible(true);
        const appearance = items.findIndex(item => item.id === visit.customer.itemId);
        const { centerX: x, customerY: y } = shelfPosition(appearance);
        const motionArt = customerMotions[visit.customer.itemId];
        const movingLeft = visit.phase === 'leaving' ? shopEntrance.x < x : x < shopEntrance.x;
        body.setTexture(motionArt.asset.key, 4).setDisplaySize(100, 100).setFlipX(motionArt.facesRight ? movingLeft : !movingLeft);
        const isCurrent = () => {
            const current = store.getSnapshot();
            return !disposed && ui.getSnapshot().menu === null && current.session === session && current.visit?.id === visit.id && current.visit.phase === visit.phase;
        };
        const advance = (event: 'arrived' | 'decide' | 'departed') => {
            if (isCurrent()) store.advanceVisit(visit.id, event, session);
        };
        if (visit.phase === 'arriving') {
            actor.setPosition(shopEntrance.x, shopEntrance.y);
            label.setText(visit.customer.name);
            body.play(motionArt.walk);
            motion = scene.tweens.add({ targets: actor, x, y, duration: 1500, ease: 'Sine.easeInOut', onComplete: () => { if (!isCurrent()) return; motion = undefined; advance('arrived'); } });
        } else if (visit.phase === 'browsing') {
            actor.setPosition(x, y);
            label.setText('상품을 살펴보는 중…');
            body.play(motionArt.idle);
            timer = scene.time.delayedCall(1800, () => { if (!isCurrent()) return; timer = undefined; advance('decide'); });
        } else {
            actor.setPosition(x, y);
            const feedback = visitFeedback(visit.outcome);
            label.setText(feedback.speech);
            if (feedback.gain) gain.setText(feedback.gain).setVisible(true);
            body.setFrame(visit.outcome?.kind === 'purchased' ? 6 : 7);
            motion = scene.tweens.add({ targets: actor, x: shopEntrance.x, y: shopEntrance.y, delay: 350, duration: 1150, onStart: () => { if (isCurrent()) { body.play(motionArt.walk); pauseAppearance(); } }, ease: 'Sine.easeInOut', onUpdate: () => { if (isCurrent() && feedback.gain) { const progress = motion?.progress ?? 0; gain.setY(-144 - progress * 20).setAlpha(1 - progress * 0.65); } }, onComplete: () => { if (!isCurrent()) return; motion = undefined; advance('departed'); } });
        }
        pauseAppearance();
    }
    const unsubscribe = store.subscribe(sync);
    const unsubscribeUi = ui.subscribe(pauseAppearance);
    sync();
    return () => {
        disposed = true;
        unsubscribe();
        unsubscribeUi();
        stop();
    };
}
