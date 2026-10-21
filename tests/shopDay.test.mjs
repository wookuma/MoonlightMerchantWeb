import { prepareShelves } from './helpers/shelves.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createInitialState, trade } from '../src/domain/economy.ts';
import { CUSTOMERS_PER_DAY, createDay, openDay, finishCustomer, prepareNextDay, getDayStats, getDayPlan } from '../src/domain/shopDay.ts';

function stock(store, amounts = { herb: 2, potion: 2, sword: 1, mushroom: 0, manaPotion: 0 }) {
    for (const [id, quantity] of Object.entries(amounts)) for (let i = 0; i < quantity; i++) store.buy(id);
}
function finishOne(store) {
    const { id } = store.getSnapshot().visit;
    store.advanceVisit(id, 'arrived');
    store.advanceVisit(id, 'decide');
    store.advanceVisit(id, 'departed');
}
function finishDay(store) {
    for (let i = 0; i < CUSTOMERS_PER_DAY; i++) finishOne(store);
}

test('하루 도메인: 준비→영업→5명 퇴장 후 마감, 잘못된 단계의 전환은 무시', () => {
    const economy = createInitialState();
    let day = createDay();
    assert.equal(day.phase, 'preparing');
    assert.equal(finishCustomer(day, economy), day);
    assert.equal(prepareNextDay(day), day);
    for (const number of [0, -1, 0.1, NaN, Infinity]) assert.throws(() => createDay(number), RangeError);
    day = openDay(day, economy);
    assert.equal(openDay(day, economy), day);
    assert.equal(prepareNextDay(day), day);
    for (let i = 0; i < 4; i++) {
        day = finishCustomer(day, economy);
        assert.equal(day.phase, 'open');
        assert.equal(day.summary, null);
    }
    day = finishCustomer(day, economy);
    assert.equal(day.phase, 'closed');
    assert.equal(day.summary.visitors, 5);
    assert.equal(day.summary.buyers, 0);
    assert.equal(finishCustomer(day, economy), day);
    assert.equal(openDay(day, economy), day);
    assert.equal(prepareNextDay(day).number, 2);
});

test('개점 버튼 한 번으로 손님 5명 자동 연결, 마지막 퇴장 후 정확한 결산', () => {
    const store = createGameStore();
    stock(store);
    assert.equal(store.getSnapshot().economy.gold, 760);
    prepareShelves(store); store.startDay();
    const opened = store.getSnapshot();
    prepareShelves(store); store.startDay(); store.nextDay();
    assert.equal(store.getSnapshot(), opened);
    const plan = getDayPlan(1);
    for (let i = 0; i < CUSTOMERS_PER_DAY; i++) {
        const active = store.getSnapshot();
        assert.equal(active.visit.id, i + 1);
        assert.equal(active.visit.customer, plan[i]);
        assert.equal(active.day.phase, 'open');
        assert.equal(active.day.completedVisits, i);
        store.advanceVisit(active.visit.id, 'arrived');
        store.advanceVisit(active.visit.id, 'decide');
        assert.equal(store.getSnapshot().day.summary, null);
        assert.equal(store.getSnapshot().visit.phase, 'leaving');
        store.advanceVisit(active.visit.id, 'departed');
        const departed = store.getSnapshot();
        store.advanceVisit(active.visit.id, 'departed');
        assert.equal(store.getSnapshot(), departed);
    }
    const closed = store.getSnapshot();
    assert.equal(closed.day.phase, 'closed');
    assert.equal(closed.visit.phase, 'completed');
    assert.equal(closed.visitCount, 5);
    assert.equal(closed.economy.gold, 1150);
    assert.deepEqual(closed.economy.inventory, { herb: 0, potion: 0, sword: 0, mushroom: 0, manaPotion: 0 });
    assert.deepEqual(closed.day.summary, { day: 1, visitors: 5, buyers: 5, revenue: 390, costOfGoodsSold: 240, profit: 150 });
    prepareShelves(store); store.startDay();
    assert.equal(store.getSnapshot(), closed);
});

test('영업 중 매입·직접 판매 차단, 가격 변경만 반영', () => {
    const store = createGameStore();
    stock(store);
    prepareShelves(store); store.startDay();
    const economy = store.getSnapshot().economy;
    store.buy('herb');
    assert.equal(store.getSnapshot().economy, economy);
    store.sell('herb');
    assert.equal(store.getSnapshot().economy, economy);
    store.setPrice('herb', 40);
    assert.equal(store.getSnapshot().economy.prices.herb, 40);
    finishDay(store);
    const closed = store.getSnapshot();
    assert.equal(closed.day.summary.revenue, 400);
    assert.equal(closed.day.summary.profit, 160);
    store.buy('herb'); store.sell('herb'); store.setPrice('herb', 10);
    assert.equal(store.getSnapshot().economy, closed.economy);
    assert.equal(store.getSnapshot().day.summary, closed.day.summary);
});

test('준비 중 직접 판매는 오늘 결산에서 제외', () => {
    const store = createGameStore();
    stock(store, { herb: 3, potion: 2, sword: 1, mushroom: 0, manaPotion: 0 });
    store.sell('herb');
    assert.equal(store.getSnapshot().economy.revenue, 35);
    assert.equal(getDayStats(store.getSnapshot().day, store.getSnapshot().economy).revenue, 0);
    prepareShelves(store); store.startDay();
    finishDay(store);
    const { economy, day } = store.getSnapshot();
    assert.equal(economy.revenue, 425);
    assert.equal(economy.costOfGoodsSold, 260);
    assert.equal(economy.gold, 1165);
    assert.deepEqual(day.summary, { day: 1, visitors: 5, buyers: 5, revenue: 390, costOfGoodsSold: 240, profit: 150 });
});

test('다음 날: 골드·잔여 재고·가격 유지, 날짜만 한 번 증가하고 일일 통계 분리', () => {
    const store = createGameStore();
    stock(store, { herb: 3, potion: 3, sword: 2, mushroom: 0, manaPotion: 0 });
    prepareShelves(store); store.startDay(); finishDay(store);
    const first = store.getSnapshot();
    assert.equal(first.economy.gold, 970);
    assert.deepEqual(first.economy.inventory, { herb: 1, potion: 1, sword: 1, mushroom: 0, manaPotion: 0 });
    const summary = structuredClone(first.day.summary);
    store.nextDay();
    const prepared = store.getSnapshot();
    assert.equal(prepared.day.number, 2);
    assert.equal(prepared.day.phase, 'preparing');
    assert.equal(prepared.day.summary, null);
    assert.equal(prepared.visit, null);
    assert.equal(prepared.visitCount, 5);
    assert.equal(prepared.economy, first.economy);
    store.nextDay();
    assert.equal(store.getSnapshot(), prepared);
    store.advanceVisit(5, 'departed');
    assert.equal(store.getSnapshot(), prepared);
    stock(store, { herb: 1, mushroom: 1, manaPotion: 2 });
    store.setPrice('herb', 40);
    const plan = getDayPlan(store.getSnapshot().day.number);
    assert.deepEqual(Object.fromEntries(['herb', 'potion', 'sword', 'mushroom', 'manaPotion'].map(id => [id, plan.filter(customer => customer.itemId === id).length])), { herb: 2, potion: 0, sword: 0, mushroom: 1, manaPotion: 2 });
    prepareShelves(store); store.startDay();
    const secondOpen = store.getSnapshot();
    store.advanceVisit(5, 'decide');
    assert.equal(store.getSnapshot(), secondOpen);
    finishDay(store);
    const second = store.getSnapshot();
    assert.equal(second.economy.gold, 1105);
    assert.equal(second.visitCount, 10);
    assert.deepEqual(second.day.summary, { day: 2, visitors: 5, buyers: 5, revenue: 300, costOfGoodsSold: 185, profit: 115 });
    assert.deepEqual(first.day.summary, summary);
});

test('빈 상점도 손님 5명 방문 후 정상 마감, 구매 인원은 0명', () => {
    const store = createGameStore();
    prepareShelves(store); store.startDay(); finishDay(store);
    assert.deepEqual(store.getSnapshot().day.summary, { day: 1, visitors: 5, buyers: 0, revenue: 0, costOfGoodsSold: 0, profit: 0 });
    assert.equal(store.getSnapshot().economy.gold, 1000);
    store.nextDay();
    store.buy('sword');
    assert.equal(store.getSnapshot().economy.inventory.sword, 1);
});

test('가격·예산 거절과 중간 품절은 구매 인원에서 제외', () => {
    const store = createGameStore();
    stock(store);
    store.setPrice('herb', 46); store.setPrice('sword', 251);
    prepareShelves(store); store.startDay(); finishDay(store);
    assert.deepEqual(store.getSnapshot().day.summary, { day: 1, visitors: 5, buyers: 2, revenue: 130, costOfGoodsSold: 80, profit: 50 });
    const short = createGameStore();
    stock(short, { herb: 1, potion: 1, sword: 1, mushroom: 0, manaPotion: 0 });
    prepareShelves(short); short.startDay(); finishDay(short);
    assert.equal(short.getSnapshot().day.summary.visitors, 5);
    assert.equal(short.getSnapshot().day.summary.buyers, 3);
});

test('손해 판매는 음수 이익으로 결산, 원가는 판매된 상품에만 적용', () => {
    const store = createGameStore();
    stock(store);
    for (const id of ['herb', 'potion', 'sword']) store.setPrice(id, 1);
    prepareShelves(store); store.startDay(); finishDay(store);
    assert.equal(store.getSnapshot().day.summary.profit, -235);
    assert.equal(store.getSnapshot().economy.gold, 765);
    const surplus = createGameStore();
    stock(surplus, { herb: 3, potion: 3, sword: 2, mushroom: 0, manaPotion: 0 });
    prepareShelves(surplus); surplus.startDay(); finishDay(surplus);
    assert.equal(surplus.getSnapshot().economy.purchaseSpend, 420);
    assert.equal(surplus.getSnapshot().day.summary.costOfGoodsSold, 240);
    assert.equal(surplus.getSnapshot().day.summary.profit, 150);
});

test('마감 통계는 이후 경제 상태가 바뀌어도 보존', () => {
    let economy = trade(createInitialState(), 'buy', 'herb').state;
    let day = openDay(createDay(), economy);
    economy = trade(economy, 'sell', 'herb').state;
    for (let i = 0; i < 5; i++) day = finishCustomer(day, economy);
    const otherEconomy = { ...economy, revenue: 99999 };
    assert.equal(getDayStats(day, otherEconomy), day.summary);
    assert.equal(day.summary.revenue, 35);
});
