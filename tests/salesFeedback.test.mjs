import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameStore } from '../src/stores/gameStore.ts';
import { liveSales,shelfFeedback,visitFeedback } from '../src/game/salesFeedback.ts';

function progress(store){const {day,economy}=store.getSnapshot();return liveSales(day,economy);}
function finishCustomer(store){const {visit}=store.getSnapshot();for(const event of ['arrived','decide','departed'])store.advanceVisit(visit.id,event);}

test('오늘 매출은 준비 거래·목표 보상을 제외하고 구매 판단 시 반영, 남은 인원은 퇴장 완료 시 감소',()=>{
    const store=createGameStore();store.buy('herb',3);store.sell('herb');store.setDisplay('herb',2);assert.equal(progress(store).revenue,0);assert.equal(progress(store).remaining,5);
    store.startDay();const {visit}=store.getSnapshot();store.advanceVisit(visit.id,'arrived');store.advanceVisit(visit.id,'decide');assert.equal(progress(store).revenue,35);assert.equal(progress(store).remaining,5);
    store.advanceVisit(visit.id,'departed');assert.equal(progress(store).remaining,4);
    for(let index=0;index<4;index++)finishCustomer(store);
    assert.equal(progress(store).remaining,0);assert.equal(progress(store).revenue,70);
    store.claimObjective('firstDay');assert.equal(progress(store).revenue,70);store.nextDay();assert.equal(progress(store).revenue,0);assert.equal(progress(store).remaining,5);
});

for(const level of [0,1,2])test(`확장 ${level}단계의 5·7·9명 진행을 정확히 표시`,()=>{
    const store=createGameStore();for(let index=0;index<level;index++)store.expandShop();const total=5+level*2;assert.equal(progress(store).total,total);store.startDay();
    for(let index=0;index<total;index++){assert.equal(progress(store).remaining,total-index);finishCustomer(store);}
    assert.equal(progress(store).remaining,0);
});

test('실제 재고·진열에 따라 품절→미진열→진열→마지막→미진열 상태 구분',()=>{
    const store=createGameStore();const feedback=()=>shelfFeedback(store.getSnapshot().economy,'herb');assert.equal(feedback().status,'stockout');
    store.buy('herb',3);assert.equal(feedback().status,'unlisted');store.setDisplay('herb',2);assert.equal(feedback().status,'ready');store.startDay();finishCustomer(store);assert.equal(feedback().status,'low');
    finishCustomer(store);finishCustomer(store);finishCustomer(store);assert.equal(feedback().status,'unlisted');assert.match(feedback().label,/보관 1개/);
    assert.equal(visitFeedback({kind:'declined',reason:'transaction',message:'blocked'}).gain,null);
});
