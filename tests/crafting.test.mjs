import { prepareShelves } from './helpers/shelves.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, trade, consumedInventoryCost } from '../src/domain/economy.ts';
import { craft } from '../src/domain/crafting.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from '../src/services/save/saveData.ts';

function balance(state) {
    assert.equal(state.purchaseSpend, Object.values(state.inventoryCosts).reduce((a, b) => a + b, 0) + state.costOfGoodsSold);
    assert.equal(state.gold, 1000 - state.purchaseSpend + state.revenue);
}
function checkpoint(economy) {
    return { economy, day: { number: 1, phase: 'preparing', completedVisits: 0, baseline: null, summary: null, report: null }, visitCount: 0, checkpoint: 'before-open' };
}
function storage(raw = null) {
    return { raw, getItem() { return this.raw; }, setItem(_key, value) { this.raw = value; } };
}
function finishDay(store) {
    for (let i = 0; i < 5; i++) {
        const { id } = store.getSnapshot().visit;
        for (const event of ['arrived', 'decide', 'departed']) store.advanceVisit(id, event);
    }
}

test('약초 2개를 물약 1개로 제작: 골드·매입액·매출은 유지하고 재고와 원가만 이동', () => {
    const source = trade(createInitialState(), 'buy', 'herb', 2).state;
    Object.freeze(source.inventory); Object.freeze(source.inventoryCosts); Object.freeze(source);
    const result = craft(source, 'health-potion');
    assert.equal(result.ok, true);
    assert.equal(result.state.gold, 960);
    assert.deepEqual(result.state.inventory, { herb: 0, potion: 1, sword: 0, mushroom: 0, manaPotion: 0 });
    assert.deepEqual(result.state.inventoryCosts, { herb: 0, potion: 40, sword: 0, mushroom: 0, manaPotion: 0 });
    assert.equal(result.state.purchaseSpend, 40);
    assert.equal(result.state.revenue, 0);
    assert.equal(result.state.costOfGoodsSold, 0);
    assert.equal(result.state.unitsSold, 0);
    assert.equal(source.inventory.herb, 2);
    balance(result.state);
    const sold = trade(result.state, 'sell', 'potion');
    assert.equal(sold.state.gold, 1025);
    assert.equal(sold.state.revenue - sold.state.costOfGoodsSold, 25);
    assert.equal(sold.state.inventoryCosts.potion, 0);
    balance(sold.state);
});

test('재료 부족·잘못된 제작법·수량은 원본 상태를 변경하지 않음', () => {
    for (const count of [0, 1]) {
        const state = count ? trade(createInitialState(), 'buy', 'herb').state : createInitialState();
        assert.equal(craft(state, 'health-potion').ok, false);
        assert.equal(craft(state, 'health-potion').state, state);
    }
    const source = trade(createInitialState(), 'buy', 'herb', 4).state;
    for (const id of ['unknown', '__proto__', 'toString']) assert.equal(craft(source, id).state, source);
    for (const count of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
        const result = craft(source, 'health-potion', count);
        assert.equal(result.ok, false); assert.equal(result.state, source);
    }
    const twice = craft(source, 'health-potion', 2);
    assert.equal(twice.state.inventory.potion, 2);
    assert.equal(twice.state.inventoryCosts.potion, 80);
    balance(twice.state);
});

test('완성품 수량·원가 오버플로는 재료를 소비하지 않고 거부', () => {
    const source = trade(createInitialState(), 'buy', 'herb', 2).state;
    const full = { ...source, inventory: { ...source.inventory, potion: Number.MAX_SAFE_INTEGER } };
    assert.equal(craft(full, 'health-potion').state, full);
    const expensive = { ...source, inventoryCosts: { ...source.inventoryCosts, potion: Number.MAX_SAFE_INTEGER } };
    assert.equal(craft(expensive, 'health-potion').state, expensive);
});

test('실제 재료 원가를 완성품으로 옮기고 직접 매입한 물약과 합쳐 판매 원가 계산', () => {
    const base = trade(createInitialState(), 'buy', 'herb', 2).state;
    const source = { ...base, gold: 940, purchaseSpend: 60, inventoryCosts: { herb: 60, potion: 0, sword: 0, mushroom: 0, manaPotion: 0 } };
    const crafted = craft(source, 'health-potion').state;
    assert.equal(crafted.inventoryCosts.potion, 60);
    const mixed = trade(crafted, 'buy', 'potion').state;
    assert.equal(mixed.inventory.potion, 2);
    assert.equal(mixed.inventoryCosts.potion, 100);
    const first = trade(mixed, 'sell', 'potion').state;
    assert.equal(first.costOfGoodsSold, 50);
    assert.equal(first.inventoryCosts.potion, 50);
    const last = trade(first, 'sell', 'potion').state;
    assert.equal(last.costOfGoodsSold, 100);
    assert.equal(last.revenue - last.costOfGoodsSold, 30);
    assert.equal(last.inventoryCosts.potion, 0);
    balance(last);
});

test('원가 정수 배분: 나머지까지 보존하고 큰 수의 중간 곱셈 오버플로 방지', () => {
    const source = { ...createInitialState(), gold: 990, purchaseSpend: 10, inventory: { herb: 3, potion: 0, sword: 0, mushroom: 0, manaPotion: 0 }, inventoryCosts: { herb: 10, potion: 0, sword: 0, mushroom: 0, manaPotion: 0 } };
    const crafted = craft(source, 'health-potion').state;
    assert.equal(crafted.inventoryCosts.herb, 3);
    assert.equal(crafted.inventoryCosts.potion, 7);
    balance(crafted);
    let state = source;
    const costs = [];
    for (let i = 0; i < 3; i++) {
        const next = trade(state, 'sell', 'herb').state;
        costs.push(next.costOfGoodsSold - state.costOfGoodsSold); state = next;
    }
    assert.deepEqual(costs, [4, 3, 3]);
    assert.equal(state.inventoryCosts.herb, 0);
    balance(state);
    const huge = { ...source, inventory: { ...source.inventory, herb: Number.MAX_SAFE_INTEGER }, inventoryCosts: { ...source.inventoryCosts, herb: Number.MAX_SAFE_INTEGER } };
    assert.equal(consumedInventoryCost(huge, 'herb', Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
    assert.equal(consumedInventoryCost(huge, 'herb', 1), 1);
});

test('제작은 준비 시간에만 가능하고 성공/실패 알림에서 재고는 원자적으로 갱신', () => {
    const store = createGameStore();
    store.buy('herb'); store.buy('herb');
    const seen = [];
    const off = store.subscribe(() => seen.push(store.getSnapshot()));
    store.craft('health-potion');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].economy.inventory.herb, 0);
    assert.equal(seen[0].economy.inventory.potion, 1);
    prepareShelves(store);
    const crafted = store.getSnapshot().economy;
    store.craft('health-potion');
    assert.equal(store.getSnapshot().economy, crafted);
    assert.equal(store.getSnapshot().success, false);
    prepareShelves(store); store.startDay(); store.craft('health-potion');
    assert.equal(store.getSnapshot().economy, crafted);
    finishDay(store);
    const closed = store.getSnapshot().economy;
    store.craft('health-potion');
    assert.equal(store.getSnapshot().economy, closed);
    off();
    store.nextDay(); store.buy('herb'); store.buy('herb'); store.craft('health-potion');
    assert.equal(store.getSnapshot().success, true);
});

test('제작품으로 하루 영업: 판매 원가·결산과 버전 2 자동 저장/롤백 연결', () => {
    const port = storage();
    const store = createGameStore(createSaveRepository(port));
    for (let i = 0; i < 6; i++) store.buy('herb');
    store.craft('health-potion'); store.craft('health-potion'); store.buy('sword');
    assert.equal(port.raw, null);
    prepareShelves(store);
    const prepared = store.getSnapshot().economy;
    assert.deepEqual(prepared.inventory, { herb: 2, potion: 2, sword: 1, mushroom: 0, manaPotion: 0 });
    assert.deepEqual(prepared.inventoryCosts, { herb: 40, potion: 80, sword: 120, mushroom: 0, manaPotion: 0 });
    prepareShelves(store); store.startDay();
    assert.equal(JSON.parse(port.raw).version, SAVE_VERSION);
    const restored = createGameStore(createSaveRepository(port));
    assert.deepEqual(restored.getSnapshot().economy, prepared);
    assert.equal(restored.getSnapshot().day.phase, 'preparing');
    prepareShelves(restored); restored.startDay(); finishDay(restored);
    assert.equal(restored.getSnapshot().day.summary.costOfGoodsSold, 240);
    assert.equal(restored.getSnapshot().day.summary.profit, 150);
    assert.equal(restored.getSnapshot().economy.gold, 1150);
    assert.deepEqual(restored.getSnapshot().economy.inventoryCosts, { herb: 0, potion: 0, sword: 0, mushroom: 0, manaPotion: 0 });
    const reloaded = createGameStore(createSaveRepository(port));
    assert.deepEqual(reloaded.getSnapshot().day.summary, restored.getSnapshot().day.summary);
    assert.equal(decodeSave(port.raw).ok, true);
});

test('고정 매입가보다 높은 제작 원가도 NPC 판매·결산·저장에 실제 금액으로 반영', () => {
    const base = trade(createInitialState(), 'buy', 'herb', 2).state;
    const expensive = { ...base, gold: 760, purchaseSpend: 240, inventoryCosts: { herb: 240, potion: 0, sword: 0, mushroom: 0, manaPotion: 0 } };
    const crafted = craft(expensive, 'health-potion').state;
    const port = storage(encodeSave(checkpoint(crafted)));
    const store = createGameStore(createSaveRepository(port));
    prepareShelves(store); store.startDay(); finishDay(store);
    assert.equal(store.getSnapshot().day.summary.buyers, 1);
    assert.equal(store.getSnapshot().day.summary.costOfGoodsSold, 240);
    assert.equal(store.getSnapshot().day.summary.profit, -175);
    assert.equal(store.getSnapshot().saveInfo.status, 'saved');
    assert.equal(decodeSave(port.raw).state.day.summary.profit, -175);
});
