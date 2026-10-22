import { expectedObjectiveMetadata } from './helpers/objectiveMetadata.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSalesReport, recordCompletedVisit, reportRows, reportAdvice } from '../src/domain/salesReport.ts';
import { createVisit, customers } from '../src/domain/customerVisit.ts';
import { getDayPlan } from '../src/domain/shopDay.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from '../src/services/save/saveData.ts';

function port(raw=null) { return {raw,writes:0,fail:false,getItem(){return this.raw;},setItem(_key,value){if(this.fail)throw Error('quota');this.raw=value;this.writes++;}}; }
function finishOne(store) {
    const {visit,session}=store.getSnapshot();
    for(const event of ['arrived','decide','departed'])store.advanceVisit(visit.id,event,session);
}
function finishDay(store) {let n=0;while(store.getSnapshot().day.phase==='open'){assert.ok(n++<9);finishOne(store);}}
function stock(store,id,n,display=n) {for(let i=0;i<n;i++)store.buy(id);store.setDisplay(id,display);}
function mixedDay(store) {
    store.expandShop(); stock(store,'herb',3,1); stock(store,'potion',1);
    store.setPrice('potion',81);store.startDay();finishDay(store);
}
function row(store,id) {return reportRows(store.getSnapshot().day.report).find(row=>row.item.id===id);}

test('퇴장 완료만 집계하고 중복·계획 밖·결과 없는 방문을 거부, 원본 보존',()=>{
    const report=createSalesReport(getDayPlan(1));
    const incoming=createVisit(1);
    assert.equal(recordCompletedVisit(report,incoming),report);
    assert.equal(recordCompletedVisit(report,{...incoming,phase:'completed'}),report);
    const done={...incoming,phase:'completed',outcome:{kind:'purchased',price:35,message:'ok'}};
    const added=recordCompletedVisit(report,done);
    assert.equal(added.visits.length,1);assert.equal(report.visits.length,0);
    assert.equal(recordCompletedVisit(added,done),added);
    assert.equal(recordCompletedVisit(added,{...done,id:2}),added);
    const transaction={...createVisit(2,customers[1]),phase:'completed',outcome:{kind:'declined',reason:'transaction',message:'error'}};
    const failed=recordCompletedVisit(added,transaction);
    assert.equal(reportRows(failed)[1].failures.transaction,1);
    assert.ok(reportAdvice(failed).some(line=>line.includes('거래')));
});

test('수요 7명: 판매·미진열·품절·가격 거절을 상품별 정확히 집계, 실패 총합 보존',()=>{
    const store=createGameStore();mixedDay(store);
    const {day,economy}=store.getSnapshot();
    assert.equal(day.summary.buyers,1);assert.equal(day.summary.visitors,7);
    assert.equal(day.summary.revenue,35);assert.equal(day.summary.profit,15);
    assert.equal(economy.gold,635);
    const herb=row(store,'herb'),potion=row(store,'potion'),sword=row(store,'sword');
    assert.equal(herb.demand,3);assert.equal(herb.sold,1);assert.equal(herb.missed,2);assert.equal(herb.failures.display,2);assert.equal(herb.failures.stock,0);
    assert.equal(potion.demand,2);assert.equal(potion.failures.price,2);
    assert.equal(sword.demand,2);assert.equal(sword.failures.stock,2);
    for(const r of reportRows(day.report))assert.equal(r.demand,r.sold+r.missed);
    assert.equal(reportRows(day.report).reduce((n,r)=>n+r.missed,0),day.summary.visitors-day.summary.buyers);
    assert.equal(reportAdvice(day.report).length,3);
});

test('예산 초과와 높은 가격을 구분하고 실제 품절에 미진열을 중복 기록하지 않음',()=>{
    const store=createGameStore();stock(store,'potion',2);stock(store,'sword',1);
    store.setPrice('potion',91);store.setPrice('sword',221);store.startDay();finishDay(store);
    assert.equal(row(store,'potion').failures.budget,2);
    assert.equal(row(store,'potion').failures.price,0);
    assert.equal(row(store,'sword').failures.price,1);
    assert.equal(row(store,'herb').failures.stock,2);
    assert.equal(row(store,'herb').failures.display,0);
});

test('전원 구매 시 놓친 판매 0, 준비 중 직접 판매는 일일 상품 판매에서 제외',()=>{
    const store=createGameStore();stock(store,'herb',3,0);store.sell('herb');store.setDisplay('herb',2);
    stock(store,'potion',2);stock(store,'sword',1);
    store.startDay();finishDay(store);
    const {day,economy}=store.getSnapshot();
    assert.equal(economy.unitsSold,6);assert.equal(day.summary.buyers,5);
    assert.equal(row(store,'herb').sold,2);
    assert.ok(reportRows(day.report).every(r=>r.missed===0));
    assert.ok(reportAdvice(day.report)[0].includes('모두 충족'));
});

test('판단·퇴장 중복과 이전 손님 콜백은 결산을 중복 집계하지 않음',()=>{
    const store=createGameStore();store.startDay();
    const id=store.getSnapshot().visit.id;
    store.advanceVisit(id,'arrived');store.advanceVisit(id,'decide');
    assert.equal(store.getSnapshot().day.report.visits.length,0);
    store.advanceVisit(id,'decide');store.advanceVisit(id,'departed');
    const once=store.getSnapshot();assert.equal(once.day.report.visits.length,1);
    store.advanceVisit(id,'departed');store.advanceVisit(id,'decide');assert.equal(store.getSnapshot(),once);
    finishDay(store);
    const closed=store.getSnapshot();store.advanceVisit(closed.visit.id,'departed');assert.equal(store.getSnapshot(),closed);
    assert.equal(closed.day.report.visits.length,5);
});

test('마감 상세 저장 복원, 다음 날 초기화와 새 수요 적용, 이전 결산 보존',()=>{
    const p=port(),store=createGameStore(createSaveRepository(p));mixedDay(store);
    const closed=store.getSnapshot(),original=structuredClone(closed.day.report);
    assert.equal(JSON.parse(p.raw).version,SAVE_VERSION);
    const loaded=createGameStore(createSaveRepository(p));
    assert.deepEqual(loaded.getSnapshot().day.report,original);
    assert.deepEqual(loaded.getSnapshot().day.summary,closed.day.summary);
    loaded.nextDay();assert.equal(loaded.getSnapshot().day.report,null);
    loaded.startDay();assert.deepEqual(loaded.getSnapshot().day.report.plan,getDayPlan(2,7).map(c=>c.itemId));
    assert.equal(loaded.getSnapshot().day.report.visits.length,0);
    finishDay(loaded);assert.equal(loaded.getSnapshot().day.report.visits.length,7);
    assert.deepEqual(closed.day.report,original);
    loaded.newGame();assert.equal(loaded.getSnapshot().day.report,null);
});

test('영업 도중 복귀하면 개점 전부터 재집계, 이전 방문 결과가 누적되지 않음',()=>{
    const p=port(),store=createGameStore(createSaveRepository(p));store.startDay();finishOne(store);finishOne(store);
    assert.equal(store.getSnapshot().day.report.visits.length,2);
    const loaded=createGameStore(createSaveRepository(p));assert.equal(loaded.getSnapshot().day.report,null);
    loaded.startDay();finishDay(loaded);
    assert.equal(loaded.getSnapshot().day.report.visits.length,5);
    assert.equal(loaded.getSnapshot().day.summary.visitors,5);
    assert.deepEqual(loaded.getSnapshot().day.report.visits.map(v=>v.id),[1,2,3,4,5]);
});

for(const phase of ['preparing','closed'])test(`실제 버전 4 ${phase} 저장 호환: 상세 이유를 추정하지 않고 원문 보존`,()=>{
    const raw=readFileSync(new URL(`./fixtures/save-v4-${phase}.json`,import.meta.url),'utf8');
    const old=JSON.parse(raw),p=port(raw),store=createGameStore(createSaveRepository(p));
    assert.equal(store.getSnapshot().saveInfo.status,'saved');
    assert.equal(p.raw,raw);assert.equal(p.writes,0);
    assert.deepEqual(store.getSnapshot().economy,{ ...old.state.economy, ...expectedObjectiveMetadata(old.state.day), inventory: { ...old.state.economy.inventory, mushroom: 0, manaPotion: 0 }, displayed: { ...old.state.economy.displayed, mushroom: 0, manaPotion: 0 }, inventoryCosts: { ...old.state.economy.inventoryCosts, mushroom: 0, manaPotion: 0 }, prices: { ...old.state.economy.prices, mushroom: 40, manaPotion: 90 } });
    assert.deepEqual(store.getSnapshot().day.summary,old.state.day.summary);
    assert.equal(store.getSnapshot().day.report,null);
    assert.equal(decodeSave(encodeSave({...store.getSnapshot(),checkpoint:old.state.checkpoint})).state.day.report,null);
    if(phase==='closed')store.nextDay();
    store.startDay();finishDay(store);
    assert.equal(store.getSnapshot().day.report.visits.length,7);
    assert.equal(JSON.parse(p.raw).version,SAVE_VERSION);
});

test('보고서 누락·수량 불일치·잘못된 상품/결과·중복 방문·판매 합계 불일치는 저장 거부',()=>{
    const store=createGameStore();mixedDay(store);
    const raw=encodeSave({...store.getSnapshot(),checkpoint:'closed'});
    for(const change of [
        v=>{delete v.state.day.report;},v=>{v.state.day.report={};},
        v=>{v.state.day.report.plan.pop();},v=>{v.state.day.report.visits.pop();},
        v=>{v.state.day.report.plan[0]='unknown';},v=>{v.state.day.report.visits[0].itemId='potion';},
        v=>{v.state.day.report.visits[0].result='unknown';},v=>{v.state.day.report.visits[1].id=1;},
        v=>{v.state.day.report.visits[0].result='display';},v=>{v.version=SAVE_VERSION+1;},
    ]) {
        const value=JSON.parse(raw);change(value);const bad=JSON.stringify(value);
        assert.equal(decodeSave(bad).ok,false);
        const p=port(bad),guarded=createGameStore(createSaveRepository(p));guarded.startDay();
        assert.equal(p.writes,0);assert.equal(p.raw,bad);
    }
    const extra=JSON.parse(raw);extra.state.day.report.extra='ignore';extra.state.day.report.visits[0].extra='ignore';
    const decoded=decodeSave(JSON.stringify(extra));assert.equal(decoded.ok,true);
    assert.equal('extra' in decoded.state.day.report,false);assert.equal('extra' in decoded.state.day.report.visits[0],false);
});

test('마감 저장 실패 시 이전 체크포인트 유지, 다음 저장에서 재시도',()=>{
    const p=port(),store=createGameStore(createSaveRepository(p));store.startDay();const before=p.raw;
    p.fail=true;finishDay(store);assert.equal(p.raw,before);
    assert.equal(store.getSnapshot().day.report.visits.length,5);assert.equal(store.getSnapshot().saveInfo.status,'error');
    p.fail=false;store.nextDay();assert.equal(store.getSnapshot().saveInfo.status,'saved');
    assert.equal(decodeSave(p.raw).state.day.report,null);
});
