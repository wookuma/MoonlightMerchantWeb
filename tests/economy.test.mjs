import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, items, setSalePrice, trade } from '../src/domain/economy.ts';

test('초기 1,000G와 상품 5종, 독립된 초기 상태', () => {
    const a = createInitialState(), b = createInitialState();
    assert.equal(a.gold, 1000);
    assert.equal(items.length, 5);
    assert.deepEqual(a.inventory, { herb: 0, potion: 0, sword: 0, mushroom: 0, manaPotion: 0 });
    assert.notEqual(a.inventory, b.inventory);
});
test('약초 20G 매입 후 35G 판매 → 1,015G, 상태를 변경하지 않는 계산', () => {
    const initial = createInitialState();
    Object.freeze(initial.inventory); Object.freeze(initial);
    const buy = trade(initial, 'buy', 'herb');
    assert.equal(buy.ok, true);
    assert.equal(buy.state.gold, 980);
    assert.equal(buy.state.inventory.herb, 1);
    const sell = trade(buy.state, 'sell', 'herb');
    assert.equal(sell.ok, true);
    assert.equal(sell.state.gold, 1015);
    assert.equal(sell.state.inventory.herb, 0);
    assert.equal(sell.state.revenue, 35);
    assert.equal(sell.state.costOfGoodsSold, 20);
    assert.equal(sell.state.purchaseSpend, 20);
    assert.equal(initial.gold, 1000);
});
for (const item of items) test(`${item.name}: 묶음 거래와 다른 재고 보존`, () => {
    const buy = trade(createInitialState(), 'buy', item.id, 2);
    assert.equal(buy.state.gold, 1000 - item.buyPrice * 2);
    const sell = trade(buy.state, 'sell', item.id, 2);
    assert.equal(sell.state.gold, 1000 + (item.sellPrice - item.buyPrice) * 2);
    assert.deepEqual(sell.state.inventory, createInitialState().inventory);
    assert.equal(sell.state.unitsSold, 2);
});
test('골드 또는 재고 부족 시 원본 상태 보존', () => {
    const initial = createInitialState();
    for (const result of [trade(initial, 'buy', 'sword', 9), trade(initial, 'sell', 'herb')]) {
        assert.equal(result.ok, false); assert.equal(result.state, initial);
    }
    const spent = trade(initial, 'buy', 'herb', 50).state;
    assert.equal(spent.gold, 0);
    assert.equal(trade(spent, 'buy', 'herb').ok, false);
});
test('잘못된 수량·상품·방향을 거부하고 상태 보존', () => {
    const initial = createInitialState();
    for (const quantity of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        const result = trade(initial, 'buy', 'herb', quantity);
        assert.equal(result.ok, false); assert.equal(result.state, initial);
    }
    for (const id of ['unknown', '__proto__', 'toString']) assert.equal(trade(initial, 'buy', id).state, initial);
    assert.equal(trade(initial, 'invalid', 'herb').ok, false);
});
test('판매 가격 변경 반영, 손해 판매도 허용', () => {
    const bought = trade(createInitialState(), 'buy', 'herb').state;
    const changed = setSalePrice(bought, 'herb', 10);
    const result = trade(changed.state, 'sell', 'herb');
    assert.equal(result.state.gold, 990);
    assert.equal(result.state.revenue - result.state.costOfGoodsSold, -10);
    assert.equal(bought.prices.herb, 35);
});
test('잘못된 판매가와 금액 오버플로 거부', () => {
    const initial = createInitialState();
    for (const price of [0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(setSalePrice(initial, 'herb', price).state, initial);
    assert.equal(setSalePrice(initial, 'invalid', 5).state, initial);
    const bought = trade(initial, 'buy', 'herb', 2).state;
    const expensive = setSalePrice(bought, 'herb', Number.MAX_SAFE_INTEGER).state;
    assert.equal(trade(expensive, 'sell', 'herb', 2).state, expensive);
    assert.equal(trade(expensive, 'sell', 'herb').state, expensive);
});
