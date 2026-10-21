import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, trade, sellDisplayed, storedQuantity } from '../src/domain/economy.ts';
import { setDisplayQuantity, DISPLAY_LIMIT } from '../src/domain/display.ts';
import { craft } from '../src/domain/crafting.ts';
import { customers, decidePurchase } from '../src/domain/customerVisit.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from '../src/services/save/saveData.ts';

function port(raw = null) { return { raw, writes: 0, getItem() { return this.raw; }, setItem(_key, value) { this.raw = value; this.writes++; } }; }
function finishDay(store) {
    for (let i = 0; i < 5; i++) {
        const { visit, session } = store.getSnapshot();
        for (const event of ['arrived', 'decide', 'departed']) store.advanceVisit(visit.id, event, session);
    }
}

test('매입은 보관 재고, 진열·회수는 전체 수량·골드·원가를 바꾸지 않음', () => {
    const source = trade(createInitialState(), 'buy', 'herb', 5).state;
    assert.equal(source.displayed.herb, 0);
    assert.equal(storedQuantity(source, 'herb'), 5);
    const display = setDisplayQuantity(source, 'herb', 3).state;
    assert.equal(storedQuantity(display, 'herb'), 2);
    assert.equal(display.inventory, source.inventory);
    assert.equal(display.inventoryCosts, source.inventoryCosts);
    assert.equal(display.gold, 900);
    const recalled = setDisplayQuantity(display, 'herb', 1).state;
    assert.equal(recalled.displayed.herb, 1);
    assert.equal(storedQuantity(recalled, 'herb'), 4);
    assert.equal(recalled.gold, source.gold);
    assert.equal(source.displayed.herb, 0);
});

test('진열 한도·소유 수량 초과·잘못된 수량과 상품은 원본 유지', () => {
    const source = trade(createInitialState(), 'buy', 'herb', 2).state;
    for (const quantity of [-1, 0.5, NaN, Infinity, 3, 4, Number.MAX_SAFE_INTEGER]) {
        const result = setDisplayQuantity(source, 'herb', quantity);
        assert.equal(result.ok, false); assert.equal(result.state, source);
    }
    assert.equal(setDisplayQuantity(source, 'unknown', 1).state, source);
    assert.equal(setDisplayQuantity(source, '__proto__', 1).state, source);
    assert.equal(setDisplayQuantity(source, 'herb', 0).ok, true);
    assert.equal(DISPLAY_LIMIT, 3);
});

test('보관 재고만 있으면 NPC 구매 거절, 진열분 소진 후 자동 보충 없음', () => {
    const source = trade(createInitialState(), 'buy', 'herb', 3).state;
    const noDisplay = decidePurchase(source, customers[0]);
    assert.equal(noDisplay.outcome.reason, 'display');
    assert.equal(noDisplay.economy, source);
    const displayed = setDisplayQuantity(source, 'herb', 1).state;
    const bought = decidePurchase(displayed, customers[0]);
    assert.equal(bought.outcome.kind, 'purchased');
    assert.equal(bought.economy.inventory.herb, 2);
    assert.equal(bought.economy.displayed.herb, 0);
    assert.equal(storedQuantity(bought.economy, 'herb'), 2);
    assert.equal(bought.economy.gold, 975);
    assert.equal(bought.economy.costOfGoodsSold, 20);
    assert.equal(decidePurchase(bought.economy, customers[0]).outcome.reason, 'display');
});

test('직접 판매는 보관분만 사용하고 NPC 판매는 진열분만 사용', () => {
    const initial = trade(createInitialState(), 'buy', 'herb', 3).state;
    const displayed = setDisplayQuantity(initial, 'herb', 2).state;
    const sold = trade(displayed, 'sell', 'herb').state;
    assert.equal(sold.inventory.herb, 2);
    assert.equal(sold.displayed.herb, 2);
    assert.equal(storedQuantity(sold, 'herb'), 0);
    assert.equal(trade(sold, 'sell', 'herb').state, sold);
    const npc = sellDisplayed(sold, 'herb').state;
    assert.equal(npc.inventory.herb, 1);
    assert.equal(npc.displayed.herb, 1);
    assert.equal(npc.costOfGoodsSold, 40);
    assert.equal(sellDisplayed(npc, 'herb', 2).state, npc);
    assert.equal(trade(npc, 'buy', 'herb', 1, 'display').state, npc);
});

test('진열 재료는 제작에서 보호, 회수 후 제작한 완성품은 보관으로 들어감', () => {
    const source = trade(createInitialState(), 'buy', 'herb', 4).state;
    const reserved = setDisplayQuantity(source, 'herb', 3).state;
    assert.equal(craft(reserved, 'health-potion').state, reserved);
    const recalled = setDisplayQuantity(reserved, 'herb', 2).state;
    const crafted = craft(recalled, 'health-potion');
    assert.equal(crafted.ok, true);
    assert.deepEqual(crafted.state.inventory, { herb: 2, potion: 1, sword: 0, mushroom: 0, manaPotion: 0 });
    assert.deepEqual(crafted.state.displayed, { herb: 2, potion: 0, sword: 0, mushroom: 0, manaPotion: 0 });
    assert.equal(crafted.state.gold, 920);
    assert.deepEqual(crafted.state.inventoryCosts, { herb: 40, potion: 40, sword: 0, mushroom: 0, manaPotion: 0 });
    assert.equal(decidePurchase(crafted.state, customers[1]).outcome.reason, 'display');
});

test('준비 중 한 개씩 증감하고 영업·마감 중 진열/회수를 차단', () => {
    const store = createGameStore();
    for (let i = 0; i < 5; i++) store.buy('herb');
    for (let i = 0; i < 5; i++) store.adjustDisplay('herb', 1);
    assert.equal(store.getSnapshot().economy.displayed.herb, 3);
    const full = store.getSnapshot().economy;
    store.adjustDisplay('herb', 2);
    assert.equal(store.getSnapshot().economy, full);
    store.setDisplay('herb', 1);
    const prepared = store.getSnapshot().economy;
    store.startDay(); store.setDisplay('herb', 3); store.adjustDisplay('herb', -1);
    assert.equal(store.getSnapshot().economy, prepared);
    finishDay(store);
    const closed = store.getSnapshot().economy;
    assert.equal(store.getSnapshot().day.summary.buyers, 1);
    assert.equal(closed.inventory.herb, 4);
    assert.equal(closed.displayed.herb, 0);
    assert.equal(closed.gold, 935);
    store.setDisplay('herb', 3);
    assert.equal(store.getSnapshot().economy, closed);
    store.nextDay();
    assert.equal(store.getSnapshot().economy, closed);
    store.setDisplay('herb', 3);
    assert.equal(store.getSnapshot().economy.displayed.herb, 3);
});

test('진열 수량을 자동 저장하고 영업 중 복귀·마감·다음 날에서 보존', () => {
    const storage = port();
    const store = createGameStore(createSaveRepository(storage));
    for (let i = 0; i < 5; i++) store.buy('herb');
    store.setDisplay('herb', 3);
    store.startDay();
    assert.equal(JSON.parse(storage.raw).version, SAVE_VERSION);
    const restored = createGameStore(createSaveRepository(storage));
    assert.equal(restored.getSnapshot().economy.displayed.herb, 3);
    assert.equal(restored.getSnapshot().economy.inventory.herb, 5);
    restored.startDay(); finishDay(restored);
    assert.equal(restored.getSnapshot().day.summary.buyers, 2);
    assert.equal(restored.getSnapshot().economy.displayed.herb, 1);
    assert.equal(storedQuantity(restored.getSnapshot().economy, 'herb'), 2);
    restored.nextDay();
    const next = createGameStore(createSaveRepository(storage));
    assert.equal(next.getSnapshot().day.number, 2);
    assert.equal(next.getSnapshot().economy.displayed.herb, 1);
    assert.equal(storedQuantity(next.getSnapshot().economy, 'herb'), 2);
});

test('버전 3의 진열 0도 그대로 복원, 진열 누락·불가능한 수량 저장은 거부', () => {
    const store = createGameStore(); store.buy('herb');
    const { economy, day, visitCount } = store.getSnapshot();
    const raw = encodeSave({ economy, day, visitCount, checkpoint: 'before-open' });
    assert.equal(decodeSave(raw).state.economy.displayed.herb, 0);
    for (const mutate of [
        data => { delete data.economy.displayed; },
        data => { data.economy.displayed.herb = -1; },
        data => { data.economy.displayed.herb = 1.5; },
        data => { data.economy.displayed.herb = 2; },
        data => { data.economy.displayed.herb = 4; },
        data => { delete data.economy.displayed.sword; },
    ]) {
        const value = JSON.parse(raw); mutate(value.state);
        assert.equal(decodeSave(JSON.stringify(value)).ok, false);
        const p = port(JSON.stringify(value));
        const guarded = createGameStore(createSaveRepository(p));
        guarded.startDay();
        assert.equal(p.writes, 0);
        assert.equal(guarded.getSnapshot().saveInfo.status, 'blocked');
    }
});
