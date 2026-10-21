import { prepareShelves } from './helpers/shelves.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { attachCustomerVisit } from '../src/game/CustomerVisit.ts';
import { createGameStore } from '../src/stores/gameStore.ts';

// 실시간 대기나 GPU 없이 이동 완료와 대기 콜백을 제어한다.
function controlledScene() {
    const moves = [], timers = [], actors = [];
    const drawing = Object.fromEntries(['fillStyle', 'fillEllipse', 'fillRect'].map(key => [key, function () { return this; }]));
    const scene = {
        add: {
            graphics: () => Object.create(drawing),
            text: () => ({ setOrigin() { return this; }, setText() { return this; } }),
            container: () => {
                const actor = { setDepth() { return this; }, setVisible(value) { this.visible = value; return this; }, setPosition(x, y) { this.x = x; this.y = y; return this; } };
                actors.push(actor); return actor;
            },
        },
        tweens: { add(config) { const motion = { config, stopped: false, stop() { this.stopped = true; } }; moves.push(motion); return motion; } },
        time: { delayedCall(delay, callback) { const timer = { delay, callback, removed: false, remove() { this.removed = true; } }; timers.push(timer); return timer; } },
    };
    return { scene, moves, timers, actors };
}

test('실제 방문 연결: 이동→확인 대기→구매→퇴장, 중간 상태 갱신으로 타이머 중복 없음', () => {
    const store = createGameStore();
    const view = controlledScene();
    const detach = attachCustomerVisit(view.scene, store);
    assert.equal(view.actors[0].visible, false);
    store.buy('herb');
    store.buy('herb');
    prepareShelves(store); store.startDay();
    assert.equal(view.moves.length, 1);
    assert.equal(view.actors[0].visible, true);
    store.setPrice('herb', 40);
    assert.equal(view.moves.length, 1);
    view.moves[0].config.onComplete();
    assert.equal(store.getSnapshot().visit.phase, 'browsing');
    assert.equal(view.timers.length, 1);
    store.buy('herb');
    assert.equal(view.timers.length, 1);
    view.timers[0].callback();
    assert.equal(store.getSnapshot().economy.gold, 1000);
    assert.equal(store.getSnapshot().economy.inventory.herb, 1);
    assert.equal(store.getSnapshot().visit.phase, 'leaving');
    assert.equal(view.moves.length, 2);
    view.timers[0].callback();
    assert.equal(store.getSnapshot().economy.unitsSold, 1);
    view.moves[1].config.onComplete();
    assert.equal(store.getSnapshot().visit.phase, 'arriving');
    assert.equal(store.getSnapshot().visit.id, 2);
    assert.equal(store.getSnapshot().day.completedVisits, 1);
    assert.equal(view.actors[0].visible, true);
    detach();
});

test('장면 해제 시 이동·대기 취소, 늦은 콜백 무시, 재연결 시 현재 단계부터 한 번만 진행', () => {
    const store = createGameStore();
    store.buy('herb');
    prepareShelves(store); store.startDay();
    const first = controlledScene();
    const detach = attachCustomerVisit(first.scene, store);
    detach(); detach();
    assert.equal(first.moves[0].stopped, true);
    first.moves[0].config.onComplete();
    assert.equal(store.getSnapshot().visit.phase, 'arriving');
    const second = controlledScene();
    const detachSecond = attachCustomerVisit(second.scene, store);
    second.moves[0].config.onComplete();
    assert.equal(store.getSnapshot().visit.phase, 'browsing');
    detachSecond();
    assert.equal(second.timers[0].removed, true);
    second.timers[0].callback();
    assert.equal(store.getSnapshot().economy.unitsSold, 0);
    const third = controlledScene();
    const detachThird = attachCustomerVisit(third.scene, store);
    assert.equal(third.moves.length, 0);
    third.timers[0].callback();
    assert.equal(store.getSnapshot().economy.gold, 1015);
    assert.equal(store.getSnapshot().economy.unitsSold, 1);
    detachThird();
});

test('이동·대기 콜백만으로 다섯 손님이 연속 방문하고 결산, 여섯 번째 자동 방문 없음', () => {
    const store = createGameStore();
    for (const [id, count] of [['herb', 2], ['potion', 2], ['sword', 1]]) for (let i = 0; i < count; i++) store.buy(id);
    const view = controlledScene();
    const detach = attachCustomerVisit(view.scene, store);
    prepareShelves(store); store.startDay();
    for (let i = 0; i < 5; i++) {
        assert.equal(view.moves.length, i * 2 + 1);
        assert.equal(store.getSnapshot().visit.id, i + 1);
        view.moves[i * 2].config.onComplete();
        assert.equal(view.timers.length, i + 1);
        view.timers[i].callback();
        assert.equal(store.getSnapshot().visit.phase, 'leaving');
        assert.equal(store.getSnapshot().day.summary, null);
        view.moves[i * 2 + 1].config.onComplete();
        assert.equal(store.getSnapshot().day.completedVisits, i + 1);
    }
    const closed = store.getSnapshot();
    assert.equal(closed.day.phase, 'closed');
    assert.equal(closed.economy.gold, 1150);
    assert.equal(closed.day.summary.profit, 150);
    assert.equal(view.actors[0].visible, false);
    assert.equal(view.moves.length, 10);
    view.moves[9].config.onComplete();
    view.timers[4].callback();
    assert.equal(store.getSnapshot(), closed);
    store.nextDay();
    assert.equal(view.actors[0].visible, false);
    assert.equal(view.moves.length, 10);
    assert.equal(store.getSnapshot().day.phase, 'preparing');
    detach();
});

test('새 게임 후 이전 손님의 콜백은 무시하고 새 손님의 대기·이동을 보존', () => {
    const store = createGameStore();
    const view = controlledScene();
    const detach = attachCustomerVisit(view.scene, store);
    store.buy('herb'); prepareShelves(store); store.startDay();
    view.moves[0].config.onComplete();
    assert.equal(view.timers.length, 1);
    store.newGame();
    assert.equal(view.timers[0].removed, true);
    assert.equal(view.actors[0].visible, false);
    store.buy('herb'); prepareShelves(store); store.startDay();
    const newArrival = store.getSnapshot();
    view.moves[0].config.onComplete();
    view.timers[0].callback();
    assert.equal(store.getSnapshot(), newArrival);
    view.moves[1].config.onComplete();
    const browsing = store.getSnapshot();
    assert.equal(browsing.visit.phase, 'browsing');
    assert.equal(view.timers.length, 2);
    view.timers[0].callback();
    assert.equal(store.getSnapshot(), browsing);
    view.timers[1].callback();
    assert.equal(store.getSnapshot().economy.gold, 1015);
    assert.equal(store.getSnapshot().economy.unitsSold, 1);
    assert.equal(store.getSnapshot().visit.phase, 'leaving');
    detach();
});

test('확장된 상점도 이동·대기 콜백으로 9명 방문 후 한 번만 마감', () => {
    const store=createGameStore(); store.expandShop(); store.expandShop();
    const view=controlledScene(), detach=attachCustomerVisit(view.scene,store);
    store.startDay();
    for(let i=0;i<9;i++) {
        view.moves[i*2].config.onComplete();
        view.timers[i].callback();
        view.moves[i*2+1].config.onComplete();
        assert.equal(store.getSnapshot().day.phase,i===8?'closed':'open');
    }
    assert.equal(store.getSnapshot().day.summary.visitors,9);
    assert.equal(view.moves.length,18);
    assert.equal(view.actors[0].visible,false);
    const closed=store.getSnapshot();
    view.moves[17].config.onComplete(); view.timers[8].callback();
    assert.equal(store.getSnapshot(),closed);
    detach();
});
