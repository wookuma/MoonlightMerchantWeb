import { prepareShelves, stockShelves } from './helpers/shelves.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, trade, setSalePrice } from '../src/domain/economy.ts';
import { advanceVisit, createVisit, customers, decidePurchase, isVisitActive } from '../src/domain/customerVisit.ts';
import { createGameStore } from '../src/stores/gameStore.ts';

const stockedTrade = (...args) => { const result = trade(...args); return result.ok ? { ...result, state: stockShelves(result.state) } : result; };

test('방문 생성: 손님별 희망 상품과 안전한 방문 번호', () => {
    assert.equal(createVisit(1).customer.itemId, 'herb');
    assert.equal(createVisit(2).customer.itemId, 'potion');
    assert.equal(createVisit(3).customer.itemId, 'sword');
    assert.equal(createVisit(6).customer, createVisit(1).customer);
    for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => createVisit(id), RangeError);
});

for (const customer of customers) test(`${customer.name}: 원하는 상품 한 개만 구매하고 이익 반영`, () => {
    const stocked = stockedTrade(createInitialState(), 'buy', customer.itemId, 2).state;
    const before = structuredClone(stocked);
    const result = decidePurchase(stocked, customer);
    assert.equal(result.outcome.kind, 'purchased');
    assert.equal(result.economy.inventory[customer.itemId], 1);
    assert.equal(result.economy.gold, stocked.gold + stocked.prices[customer.itemId]);
    assert.equal(result.economy.unitsSold, 1);
    for (const other of customers) if (other.itemId !== customer.itemId) assert.equal(result.economy.inventory[other.itemId], 0);
    assert.deepEqual(stocked, before);
});

test('품절·예산 초과·가격 거절 시 경제 상태 보존, 가격 경계값 허용', () => {
    const customer = customers[0];
    const empty = createInitialState();
    assert.equal(decidePurchase(empty, customer).outcome.reason, 'stock');
    assert.equal(decidePurchase(empty, customer).economy, empty);
    const stocked = stockedTrade(empty, 'buy', 'herb').state;
    for (const [price, reason] of [[46, 'price'], [51, 'budget']]) {
        const state = setSalePrice(stocked, 'herb', price).state;
        const result = decidePurchase(state, customer);
        assert.equal(result.outcome.reason, reason);
        assert.equal(result.economy, state);
    }
    const atLimit = setSalePrice(stocked, 'herb', customer.maxPrice).state;
    assert.equal(decidePurchase(atLimit, customer).outcome.kind, 'purchased');
    assert.equal(decidePurchase(atLimit, { ...customer, budget: customer.maxPrice }).outcome.kind, 'purchased');
});

test('방문 순서 강제, 중복 구매 콜백과 이전 손님 콜백 무시', () => {
    let economy = stockedTrade(createInitialState(), 'buy', 'herb', 2).state;
    let visit = createVisit(1);
    assert.equal(advanceVisit(economy, visit, 1, 'decide').visit, visit);
    assert.equal(advanceVisit(economy, visit, 2, 'arrived').visit, visit);
    ({ economy, visit } = advanceVisit(economy, visit, 1, 'arrived'));
    assert.equal(visit.phase, 'browsing');
    ({ economy, visit } = advanceVisit(economy, visit, 1, 'decide'));
    assert.equal(visit.phase, 'leaving');
    assert.equal(economy.inventory.herb, 1);
    assert.equal(economy.unitsSold, 1);
    const repeat = advanceVisit(economy, visit, 1, 'decide');
    assert.equal(repeat.economy, economy);
    assert.equal(repeat.visit, visit);
    ({ economy, visit } = advanceVisit(economy, visit, 1, 'departed'));
    assert.equal(isVisitActive(visit), false);
    assert.equal(advanceVisit(economy, visit, 1, 'departed').visit, visit);
    const next = createVisit(2);
    assert.equal(advanceVisit(economy, next, 1, 'arrived').visit, next);
});

test('공유 상태: 중복 개점 방지, 최신 가격 반영, 직접 판매와 자동 거래 충돌 방지', () => {
    const store = createGameStore();
    store.buy('herb');
    prepareShelves(store); store.startDay();
    const first = store.getSnapshot();
    prepareShelves(store); store.startDay();
    assert.equal(store.getSnapshot(), first);
    store.sell('herb');
    assert.equal(store.getSnapshot().economy, first.economy);
    store.setPrice('herb', 40);
    store.advanceVisit(1, 'arrived');
    const beforeDecision = store.getSnapshot();
    const observed = [];
    const off = store.subscribe(() => observed.push(store.getSnapshot()));
    store.advanceVisit(1, 'decide');
    assert.equal(observed.length, 1);
    assert.equal(observed[0].visit.phase, 'leaving');
    assert.equal(observed[0].economy.gold, 1020);
    assert.equal(observed[0].economy.inventory.herb, 0);
    assert.equal(observed[0].economy.revenue, 40);
    assert.equal(beforeDecision.economy.gold, 980);
    store.advanceVisit(1, 'decide');
    assert.equal(observed.length, 1);
    store.advanceVisit(1, 'departed');
    off();
    const second = store.getSnapshot();
    assert.equal(second.visit.customer.itemId, 'potion');
    assert.equal(second.visitCount, 2);
    assert.equal(second.day.completedVisits, 1);
    store.advanceVisit(1, 'departed');
    assert.equal(store.getSnapshot(), second);
});

test('영업 중 매입 거부, 최신 판매가 반영, 품절 손님 이후에도 영업 지속', () => {
    const store = createGameStore();
    store.buy('herb');
    prepareShelves(store); store.startDay();
    store.advanceVisit(1, 'arrived');
    const beforeBuy = store.getSnapshot().economy;
    store.buy('herb');
    assert.equal(store.getSnapshot().economy, beforeBuy);
    store.setPrice('herb', 46);
    const before = store.getSnapshot().economy;
    store.advanceVisit(1, 'decide');
    assert.equal(store.getSnapshot().visit.outcome.reason, 'price');
    assert.equal(store.getSnapshot().economy, before);
    store.advanceVisit(1, 'departed');
    store.advanceVisit(2, 'arrived');
    store.advanceVisit(2, 'decide');
    assert.equal(store.getSnapshot().visit.outcome.reason, 'stock');
    store.advanceVisit(2, 'departed');
    assert.equal(store.getSnapshot().visit.id, 3);
    assert.equal(store.getSnapshot().day.completedVisits, 2);
    assert.equal(store.getSnapshot().day.phase, 'open');
});
