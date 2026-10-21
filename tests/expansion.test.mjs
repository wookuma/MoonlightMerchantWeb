import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState, trade } from '../src/domain/economy.ts';
import { expandShop, displayCapacity, dailyCustomers } from '../src/domain/shopExpansion.ts';
import { setDisplayQuantity } from '../src/domain/display.ts';
import { getDayPlan } from '../src/domain/shopDay.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from '../src/services/save/saveData.ts';

function port(raw = null) { return { raw, writes: 0, fail: false, getItem() { return this.raw; }, setItem(_key, value) { if(this.fail) throw Error('quota'); this.raw=value; this.writes++; } }; }
function finishOne(store) {
    const { visit, session } = store.getSnapshot();
    for(const e of ['arrived','decide','departed']) store.advanceVisit(visit.id,e,session);
}
function finishDay(store, count) {
    for(let i=0;i<count;i++) {
        assert.equal(store.getSnapshot().day.phase, 'open');
        finishOne(store);
        assert.equal(store.getSnapshot().day.phase, i===count-1 ? 'closed':'open');
    }
}

test('두 단계 확장: 골드만 차감하고 진열 한도·손님 수 증가, 판매 이익과 원가 보존', () => {
    const original=trade(createInitialState(),'buy','herb',5).state;
    const displayed=setDisplayQuantity(original,'herb',3).state;
    const first=expandShop(displayed);
    assert.equal(first.ok,true); assert.equal(first.state.gold,600);
    assert.equal(first.state.expansionSpend,300); assert.equal(first.state.expansionLevel,1);
    assert.equal(displayCapacity(first.state),5); assert.equal(dailyCustomers(first.state),7);
    for(const key of ['inventory','displayed','inventoryCosts','prices','purchaseSpend','revenue','costOfGoodsSold','unitsSold']) assert.equal(first.state[key],displayed[key]);
    assert.equal(setDisplayQuantity(first.state,'herb',5).ok,true);
    assert.equal(setDisplayQuantity(displayed,'herb',5).ok,false);
    const second=expandShop(first.state);
    assert.equal(second.ok,true); assert.equal(second.state.gold,0);
    assert.equal(second.state.expansionSpend,900); assert.equal(second.state.expansionLevel,2);
    assert.equal(displayCapacity(second.state),7); assert.equal(dailyCustomers(second.state),9);
    assert.equal(expandShop(second.state).state,second.state);
    assert.equal(displayed.gold,900); assert.equal(displayed.expansionLevel,0);
});

test('잔액 부족·잘못된 단계·비용 불일치 거부, 정확한 잔액 경계 허용', () => {
    const exact={...createInitialState(),gold:300};
    assert.equal(expandShop(exact).state.gold,0);
    for(const state of [
        {...exact,gold:299}, {...exact,gold:NaN}, {...exact,gold:Infinity},
        {...exact,expansionLevel:-1}, {...exact,expansionLevel:0.5},
        {...exact,expansionSpend:1}, {...exact,expansionLevel:1,expansionSpend:0},
    ]) { const r=expandShop(state); assert.equal(r.ok,false); assert.equal(r.state,state); }
});

test('준비 시간만 확장, 연속 요청은 최신 잔액·최대 단계로 검증, 새 게임 초기화', () => {
    const store=createGameStore();
    store.expandShop(); store.expandShop();
    assert.equal(store.getSnapshot().economy.gold,100);
    const max=store.getSnapshot().economy;
    store.expandShop(); assert.equal(store.getSnapshot().economy,max);
    store.startDay(); store.expandShop(); assert.equal(store.getSnapshot().economy,max);
    finishDay(store,9);
    const closedMax = store.getSnapshot().economy;
    assert.deepEqual(closedMax, { ...max, objectives: { ...max.objectives, firstDay: 'ready' } });
    store.expandShop(); assert.equal(store.getSnapshot().economy,closedMax);
    const summary=store.getSnapshot().day.summary;
    assert.equal(summary.visitors,9); assert.equal(summary.profit,0);
    store.nextDay(); assert.equal(store.getSnapshot().economy,closedMax);
    store.newGame(); assert.equal(store.getSnapshot().economy.expansionLevel,0);
    assert.equal(store.getSnapshot().economy.expansionSpend,0); assert.equal(store.getSnapshot().economy.gold,1000);
});

test('확장 후 7명 방문·상품별 수요 예고 일치, 진열 수량만 구매하고 정확히 마감', () => {
    const store=createGameStore(); store.expandShop();
    const plan=getDayPlan(1,7);
    assert.equal(plan.length,7);
    for(const id of ['herb','potion','sword']) {
        const quantity=plan.filter(c=>c.itemId===id).length;
        for(let i=0;i<quantity;i++) store.buy(id);
        store.setDisplay(id,quantity);
    }
    store.startDay(); finishDay(store,7);
    const { economy, day, visitCount, visit }=store.getSnapshot();
    assert.equal(day.summary.buyers,7); assert.equal(visitCount,7);
    assert.deepEqual(economy.inventory,{ herb: 0, potion: 0, sword: 0, mushroom: 0, manaPotion: 0 });
    assert.equal(economy.gold,1000-economy.purchaseSpend-300+economy.revenue);
    assert.equal(day.summary.profit,economy.revenue-economy.costOfGoodsSold);
    finishOne(store); assert.equal(store.getSnapshot().visit,visit);
});

test('확장 전후 여러 날의 방문 순서·중간 복귀·마감·다음 날 저장 복원', () => {
    const p=port(); let store=createGameStore(createSaveRepository(p));
    store.startDay(); finishDay(store,5); store.nextDay();
    store.expandShop(); store.startDay();
    finishOne(store);
    store=createGameStore(createSaveRepository(p));
    assert.equal(store.getSnapshot().day.phase,'preparing');
    assert.equal(store.getSnapshot().day.number,2);
    assert.equal(store.getSnapshot().visitCount,5);
    assert.equal(store.getSnapshot().economy.expansionLevel,1);
    assert.equal(store.getSnapshot().economy.gold,700);
    store.startDay(); finishDay(store,7);
    assert.equal(store.getSnapshot().visitCount,12);
    store=createGameStore(createSaveRepository(p));
    assert.equal(store.getSnapshot().day.summary.visitors,7);
    store.nextDay(); store.expandShop(); store.startDay(); finishDay(store,9);
    assert.equal(store.getSnapshot().visitCount,21);
    assert.equal(JSON.parse(p.raw).version,SAVE_VERSION);
    store=createGameStore(createSaveRepository(p)); store.nextDay();
    assert.equal(store.getSnapshot().economy.expansionLevel,2);
    assert.equal(store.getSnapshot().economy.expansionSpend,900);
    assert.equal(store.getSnapshot().day.number,4);
    assert.equal(store.getSnapshot().visitCount,21);
    assert.equal(getDayPlan(store.getSnapshot().day.number,9).length,9);
});

test('버전 3 실제 저장: 진열 0·잔여 수량 보존, 위조된 확장 필드는 승계하지 않음', () => {
    const legacy=JSON.parse(readFileSync(new URL('./fixtures/save-v3-preparing.json',import.meta.url),'utf8'));
    legacy.state.economy.displayed.herb=0;
    legacy.state.economy.expansionLevel=2; legacy.state.economy.expansionSpend=900;
    const raw=JSON.stringify(legacy), p=port(raw);
    const store=createGameStore(createSaveRepository(p));
    assert.equal(store.getSnapshot().saveInfo.status,'saved');
    assert.equal(store.getSnapshot().economy.expansionLevel,0);
    assert.equal(store.getSnapshot().economy.displayed.herb,0);
    assert.equal(p.raw,raw); assert.equal(p.writes,0);
    store.expandShop(); store.startDay();
    assert.equal(JSON.parse(p.raw).version,SAVE_VERSION);
    assert.equal(decodeSave(p.raw).state.economy.expansionLevel,1);
});

test('새 저장의 단계·비용·잔액·진열 한도·방문 수 불일치와 미래 버전 보호', () => {
    const store=createGameStore(); store.expandShop();
    const s=store.getSnapshot();
    const raw=encodeSave({...s,checkpoint:'before-open'});
    for(const mutate of [
        v=>{delete v.state.economy.expansionLevel;}, v=>{v.state.economy.expansionLevel=3;},
        v=>{v.state.economy.expansionLevel=0.5;}, v=>{delete v.state.economy.expansionSpend;},
        v=>{v.state.economy.expansionSpend=0;}, v=>{v.state.economy.gold=1000;},
        v=>{v.state.economy.displayed.herb=6;}, v=>{v.state.visitCount=7;},
        v=>{v.state.day.number=2;v.state.visitCount=6;}, v=>{v.version=8;},
    ]) {
        const v=JSON.parse(raw); mutate(v); const bad=JSON.stringify(v);
        assert.equal(decodeSave(bad).ok,false);
        const p=port(bad), guarded=createGameStore(createSaveRepository(p));
        guarded.expandShop(); guarded.startDay(); assert.equal(p.raw,bad); assert.equal(p.writes,0);
    }
});

test('확장 후 저장 실패는 기존 저장 보존, 체크포인트 재시도 후 확장 복원', () => {
    const p=port(), store=createGameStore(createSaveRepository(p));
    store.startDay(); finishDay(store,5); store.nextDay();
    const old=p.raw; store.expandShop(); assert.equal(p.raw,old);
    p.fail=true; store.startDay();
    assert.equal(store.getSnapshot().saveInfo.status,'error'); assert.equal(p.raw,old);
    p.fail=false; finishDay(store,7);
    assert.equal(store.getSnapshot().saveInfo.status,'saved');
    assert.equal(decodeSave(p.raw).state.economy.expansionLevel,1);
    assert.equal(decodeSave(p.raw).state.day.summary.visitors,7);
});

test('최대 단계 진열 7개를 저장·복원하고 이전 한도 3개로 잘라내지 않음', () => {
    const p=port(), store=createGameStore(createSaveRepository(p));
    for(let i=0;i<7;i++) store.buy('herb');
    for(let i=0;i<3;i++) store.sell('herb');
    store.expandShop(); store.expandShop();
    for(let i=0;i<3;i++) store.buy('herb');
    store.setDisplay('herb',7);
    assert.equal(store.getSnapshot().economy.displayed.herb,7);
    assert.equal(store.getSnapshot().economy.gold,5);
    const full=store.getSnapshot().economy;
    store.setDisplay('herb',8); assert.equal(store.getSnapshot().economy,full);
    store.startDay();
    const restored=createGameStore(createSaveRepository(p));
    assert.deepEqual(restored.getSnapshot().economy,full);
    restored.startDay(); finishDay(restored,9);
    assert.equal(restored.getSnapshot().day.summary.buyers,3);
    assert.equal(restored.getSnapshot().economy.displayed.herb,4);
    const closed=JSON.parse(p.raw);
    for(const change of [
        v=>{v.state.day.summary.visitors=5;},
        v=>{v.state.day.completedVisits=7;},
        v=>{v.state.visitCount=7;},
    ]) { const v=structuredClone(closed);change(v);assert.equal(decodeSave(JSON.stringify(v)).ok,false); }
});
