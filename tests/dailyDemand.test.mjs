import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDayPlan } from '../src/domain/shopDay.ts';
import { customers } from '../src/domain/customerVisit.ts';
import { dailyCustomers, displayCapacity } from '../src/domain/shopExpansion.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { decodeSave, SAVE_VERSION } from '../src/services/save/saveData.ts';

const counts = plan => Object.fromEntries(['herb','potion','sword','mushroom','manaPotion'].map(id => [id,plan.filter(customer=>customer.itemId===id).length]));
function port(raw=null) { return {raw,writes:0,getItem(){return this.raw;},setItem(_key,value){this.raw=value;this.writes++;}}; }
function finishOne(store) {
    const {visit,session}=store.getSnapshot();
    for(const event of ['arrived','decide','departed'])store.advanceVisit(visit.id,event,session);
}
function runDay(store) {
    const actual=[];
    while(store.getSnapshot().day.phase==='open') {
        actual.push(store.getSnapshot().visit.customer);
        assert.ok(actual.length<=9);
        finishOne(store);
    }
    return actual;
}
function prepareDayTwo(store) {store.startDay();runDay(store);store.nextDay();}

test('첫날 균형 구성과 날짜별 집중 수요, 같은 날짜는 같은 순서', () => {
    assert.deepEqual(getDayPlan(1).map(c=>c.itemId),['herb','potion','sword','herb','potion']);
    assert.deepEqual(counts(getDayPlan(2)),{ herb: 2, potion: 0, sword: 0, mushroom: 1, manaPotion: 2 });
    assert.deepEqual(counts(getDayPlan(3)),{ herb: 1, potion: 1, sword: 0, mushroom: 0, manaPotion: 3 });
    assert.deepEqual(counts(getDayPlan(4)),{ herb: 1, potion: 2, sword: 2, mushroom: 0, manaPotion: 0 });
    assert.deepEqual(getDayPlan(22,7),getDayPlan(22,7));
    const modified=getDayPlan(2);modified.pop();
    assert.equal(getDayPlan(2).length,5);
});

test('모든 확장 단계에서 수요 합계·상품 정보·진열 한도를 만족하고 큰 날짜도 재현', () => {
    for(const day of [...Array.from({length:200},(_,i)=>i+1),4294967296,Number.MAX_SAFE_INTEGER]) {
        for(const [level,limit] of [[0,5],[1,7],[2,9]]) {
            const plan=getDayPlan(day,limit), demand=counts(plan);
            assert.equal(plan.length,limit);
            assert.equal(Object.values(demand).reduce((a,b)=>a+b,0),limit);
            assert.ok(Object.values(demand).every(n=>n>=0&&n<=displayCapacity({expansionLevel:level})));
            assert.ok(plan.every(customer=>customers.includes(customer)));
            assert.deepEqual(plan,getDayPlan(day,limit));
            if(day>1)assert.notDeepEqual(demand,counts(getDayPlan(day-1,limit)));
        }
    }
    for(const day of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>getDayPlan(day),RangeError);
    for(const limit of [0,3,6,10,NaN,Infinity])assert.throws(()=>getDayPlan(1,limit),RangeError);
});

test('2일차 이후 모든 단계에서 예고 순서와 실제 방문이 일치하며 마지막 손님 후 마감', () => {
    for(const level of [0,1,2]) {
        const store=createGameStore();
        for(let i=0;i<level;i++)store.expandShop();
        prepareDayTwo(store);
        for(let day=2;day<=5;day++) {
            const limit=dailyCustomers(store.getSnapshot().economy);
            const expected=getDayPlan(day,limit);
            store.startDay();
            assert.deepEqual(runDay(store),expected);
            const snapshot=store.getSnapshot();
            assert.equal(snapshot.day.summary.visitors,limit);
            assert.equal(snapshot.visitCount,day*limit);
            const ended=snapshot;
            store.advanceVisit(snapshot.visit.id,'departed');
            assert.equal(store.getSnapshot(),ended);
            store.nextDay();
        }
    }
});

test('수요에 맞춘 매입·진열로 2일차 전원 구매, 원가와 결산 정확성', () => {
    const store=createGameStore();prepareDayTwo(store);
    const expected=getDayPlan(2), demand=counts(expected);
    for(const [id,n]of Object.entries(demand)) {
        for(let i=0;i<n;i++)store.buy(id);
        store.setDisplay(id,n);
    }
    store.startDay();assert.deepEqual(runDay(store),expected);
    const {economy,day}=store.getSnapshot();
    assert.deepEqual(day.summary,{day:2,visitors:5,buyers:5,revenue:290,costOfGoodsSold:185,profit:105});
    assert.deepEqual(economy.inventory,{ herb: 0, potion: 0, sword: 0, mushroom: 0, manaPotion: 0 });
    assert.equal(economy.gold,1105);
});

test('판매가·재고 변경과 가격 거절은 예정 수요와 뒤 손님 순서를 바꾸지 않음', () => {
    const store=createGameStore();prepareDayTwo(store);
    const plan=getDayPlan(2);
    for(let i=0;i<3;i++)store.buy('herb');
    store.setDisplay('herb',2);store.setPrice('herb',46);
    store.startDay();store.setPrice('potion',1);
    assert.deepEqual(runDay(store),plan);
    assert.equal(store.getSnapshot().day.summary.buyers,0);
    assert.equal(store.getSnapshot().economy.displayed.herb,2);
    assert.deepEqual(getDayPlan(2),plan);
});

test('개점 후 중간 복귀해도 같은 날짜의 수요·순서 복원, 확장 후 수요도 복원', () => {
    const p=port();let store=createGameStore(createSaveRepository(p));
    prepareDayTwo(store);store.expandShop();
    const plan=getDayPlan(2,7);
    store.startDay();finishOne(store);finishOne(store);
    store=createGameStore(createSaveRepository(p));
    assert.equal(store.getSnapshot().day.phase,'preparing');
    assert.equal(store.getSnapshot().day.number,2);
    assert.equal(store.getSnapshot().visitCount,5);
    assert.equal(store.getSnapshot().economy.expansionLevel,1);
    assert.deepEqual(getDayPlan(2,dailyCustomers(store.getSnapshot().economy)),plan);
    store.startDay();assert.deepEqual(runDay(store),plan);
    store=createGameStore(createSaveRepository(p));
    assert.equal(store.getSnapshot().day.phase,'closed');
    store.nextDay();store=createGameStore(createSaveRepository(p));
    const next=getDayPlan(store.getSnapshot().day.number,7);
    assert.notDeepEqual(counts(next),counts(plan));
    store.startDay();assert.deepEqual(runDay(store),next);
    assert.equal(JSON.parse(p.raw).version,SAVE_VERSION);
    assert.equal(SAVE_VERSION,7);
});

test('누적 방문 수가 다른 이력도 같은 날짜·확장 단계이면 구성 동일', () => {
    const earlier=createGameStore(),later=createGameStore();
    earlier.expandShop();prepareDayTwo(earlier);
    prepareDayTwo(later);later.expandShop();
    assert.notEqual(earlier.getSnapshot().visitCount,later.getSnapshot().visitCount);
    earlier.startDay();later.startDay();
    assert.deepEqual(runDay(earlier),runDay(later));
});

test('기존 저장 원문 보존, 다음 날 수요 연결 및 새 게임 시 첫날 복귀', () => {
    const raw=readFileSync(new URL('./fixtures/save-v3-closed.json',import.meta.url),'utf8');
    const p=port(raw),store=createGameStore(createSaveRepository(p));
    assert.equal(p.raw,raw);assert.equal(p.writes,0);
    store.nextDay();store.startDay();
    assert.deepEqual(runDay(store),getDayPlan(2));
    assert.equal(decodeSave(p.raw).ok,true);
    store.newGame();store.startDay();
    assert.deepEqual(runDay(store),getDayPlan(1));
});
