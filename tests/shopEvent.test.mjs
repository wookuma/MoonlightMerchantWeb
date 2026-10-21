import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getShopEvent } from '../src/domain/shopEvent.ts';
import { getDayPlan } from '../src/domain/shopDay.ts';
import { dailyCustomers, displayCapacity } from '../src/domain/shopExpansion.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { getPreparationPlan } from '../src/domain/preparation.ts';
import { SAVE_VERSION } from '../src/services/save/saveData.ts';

const counts=plan=>Object.fromEntries(['herb','potion','sword','mushroom','manaPotion'].map(id=>[id,plan.filter(c=>c.itemId===id).length]));
function port(raw=null){return{raw,writes:0,getItem(){return this.raw;},setItem(_key,value){this.raw=value;this.writes++;}};}
function finishOne(store){const {visit}=store.getSnapshot();for(const event of ['arrived','decide','departed'])store.advanceVisit(visit.id,event);}
function finishDay(store){const actual=[];while(store.getSnapshot().day.phase==='open'){actual.push(store.getSnapshot().visit.customer);assert.ok(actual.length<=9);finishOne(store);}return actual;}

test('날짜별 이벤트 순환과 첫날 입문 구성 유지, 큰 날짜에서도 같은 이벤트 재현',()=>{
    assert.deepEqual([1,2,3,4,5,6,7,8].map(day=>getShopEvent(day).id),['market','academy','market','expedition','market','academy','market','expedition']);
    assert.deepEqual(getDayPlan(1).map(c=>c.itemId),['herb','potion','sword','herb','potion']);
    for(const day of [1,2,4,50,4294967296,Number.MAX_SAFE_INTEGER])assert.deepEqual(getShopEvent(day),getShopEvent(day));
});

test('잘못된 날짜는 이벤트와 수요 모두 거부',()=>{
    for(const day of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
        assert.throws(()=>getShopEvent(day),RangeError);assert.throws(()=>getDayPlan(day),RangeError);
    }
});

test('실습일·출정일 대표 상품 수요 증가, 단계별 총 방문 수·진열 한도 유지',()=>{
    for(const [level,limit]of [[0,5],[1,7],[2,9]])for(const day of [2,4,6,8,102,104]){
        const event=getShopEvent(day),demand=counts(getDayPlan(day,limit));
        assert.equal(Object.values(demand).reduce((a,b)=>a+b,0),limit);
        assert.equal(event.featured.length,2);
        for(const id of event.featured)assert.equal(demand[id],(limit-1)/2);
        assert.equal(demand[event.supporting],1);
        assert.ok(Object.values(demand).every(n=>n<=displayCapacity({expansionLevel:level})));
        assert.deepEqual(getDayPlan(day,limit),getDayPlan(day,limit));
    }
});

test('모든 단계에서 이벤트·준비 도우미·실제 손님·마감 기록이 같은 계획 사용',()=>{
    for(const level of [0,1,2]){
        const store=createGameStore();for(let i=0;i<level;i++)store.expandShop();
        for(let day=1;day<=6;day++){
            const limit=dailyCustomers(store.getSnapshot().economy),expected=getDayPlan(day,limit);
            const guide=getPreparationPlan(store.getSnapshot().economy,day);
            assert.deepEqual(Object.fromEntries(guide.rows.map(row=>[row.item.id,row.demand])),counts(expected));
            store.startDay();assert.deepEqual(finishDay(store),expected);
            assert.deepEqual(store.getSnapshot().day.report.plan,expected.map(c=>c.itemId));
            assert.equal(store.getSnapshot().day.summary.visitors,limit);
            store.nextDay();
        }
    }
});

test('행사 수요대로 매입·진열하면 실습일과 출정일 모두 전원 판매, 금액·목표 정상 반영',()=>{
    const store=createGameStore();store.startDay();finishDay(store);store.nextDay();
    for(const target of [2,4]){
        while(store.getSnapshot().day.number<target){store.startDay();finishDay(store);store.nextDay();}
        const demand=counts(getDayPlan(target));
        for(const [id,n]of Object.entries(demand))if(n>0){store.buy(id,n);store.setDisplay(id,n);}
        store.startDay();finishDay(store);const {day,economy}=store.getSnapshot();
        assert.equal(day.summary.buyers,5);assert.equal(economy.objectives.perfectDay,'ready');
        assert.equal(day.summary.revenue,target===2?290:545);assert.equal(day.summary.costOfGoodsSold,target===2?185:340);
        store.nextDay();
    }
});

test('영업 중 복귀 후 이벤트·순서 동일, 과거 저장 원문·마감 결산 보존',()=>{
    const p=port();let store=createGameStore(createSaveRepository(p));store.startDay();finishDay(store);store.nextDay();
    const event=getShopEvent(2),plan=getDayPlan(2);store.startDay();finishOne(store);finishOne(store);
    store=createGameStore(createSaveRepository(p));assert.equal(store.getSnapshot().day.phase,'preparing');
    assert.deepEqual(getShopEvent(store.getSnapshot().day.number),event);store.startDay();assert.deepEqual(finishDay(store),plan);
    assert.equal(JSON.parse(p.raw).version,SAVE_VERSION);assert.equal(SAVE_VERSION,7);
    const raw=readFileSync(new URL('./fixtures/save-v5-closed.json',import.meta.url),'utf8'),legacy=JSON.parse(raw),oldPort=port(raw);
    const loaded=createGameStore(createSaveRepository(oldPort));assert.equal(oldPort.raw,raw);assert.equal(oldPort.writes,0);
    assert.deepEqual(loaded.getSnapshot().day.report,legacy.state.day.report);
    loaded.nextDay();assert.equal(getShopEvent(loaded.getSnapshot().day.number).id,'market');
});
