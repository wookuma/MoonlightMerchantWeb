import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState, itemValues, trade, sellDisplayed } from '../src/domain/economy.ts';
import { craft } from '../src/domain/crafting.ts';
import { setDisplayQuantity } from '../src/domain/display.ts';
import { claimObjective, claimedRewardGold, createObjectiveProgress } from '../src/domain/objectives.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from '../src/services/save/saveData.ts';

function port(raw=null){return{raw,writes:0,fail:false,getItem(){return this.raw;},setItem(_key,v){if(this.fail)throw Error('quota');this.raw=v;this.writes++;}};}
function finishOne(store){const {visit,session}=store.getSnapshot();for(const e of ['arrived','decide','departed'])store.advanceVisit(visit.id,e,session);}
function finishDay(store){let n=0;while(store.getSnapshot().day.phase==='open'){assert.ok(n++<9);finishOne(store);}}
function perfectCraftedDay(store){store.buy('herb',6);store.craft('health-potion',2);store.buy('sword');store.setDisplay('herb',2);store.setDisplay('potion',2);store.setDisplay('sword',1);store.startDay();finishDay(store);}

test('목표 미달·알 수 없는 목표·골드 범위 초과·중복 수령은 원본 상태 유지',()=>{
    const initial=createInitialState();assert.equal(claimObjective(initial,'firstDay').state,initial);assert.equal(claimObjective(initial,'__proto__').state,initial);
    const ready={...initial,objectives:{...initial.objectives,firstDay:'ready'}};
    const overflow={...ready,gold:Number.MAX_SAFE_INTEGER};assert.equal(claimObjective(overflow,'firstDay').state,overflow);
    const result=claimObjective(ready,'firstDay');assert.equal(result.ok,true);assert.equal(result.state.gold,1100);
    assert.equal(claimObjective(result.state,'firstDay').state,result.state);assert.equal(ready.objectives.firstDay,'ready');
    assert.equal(result.state.revenue,0);assert.equal(result.state.purchaseSpend,0);
});

test('첫 마감 목표는 매출 0이어도 달성, 수령은 1회·다음 날에도 유지',()=>{
    const store=createGameStore();store.claimObjective('firstDay');assert.equal(store.getSnapshot().economy.gold,1000);
    store.startDay();finishDay(store);const summary=store.getSnapshot().day.summary;
    assert.equal(store.getSnapshot().economy.objectives.firstDay,'ready');assert.equal(store.getSnapshot().economy.objectives.perfectDay,'in-progress');
    store.claimObjective('firstDay');assert.equal(store.getSnapshot().economy.gold,1100);assert.equal(claimedRewardGold(store.getSnapshot().economy.objectives),100);
    store.claimObjective('firstDay');assert.equal(store.getSnapshot().economy.gold,1100);assert.deepEqual(store.getSnapshot().day.summary,summary);
    store.nextDay();store.startDay();finishDay(store);assert.equal(store.getSnapshot().economy.objectives.firstDay,'claimed');
});

test('제작품과 매입품 혼합: 제작품 우선 진열·회수, 위치별 판매로 출처 수량 보존',()=>{
    let state=trade(createInitialState(),'buy','herb',2).state;state=trade(state,'buy','potion',2).state;state=craft(state,'health-potion').state;
    assert.equal(state.craftedInventory.potion,1);assert.equal(state.inventory.potion,3);
    state=setDisplayQuantity(state,'potion',1).state;assert.equal(state.craftedDisplayed.potion,1);
    state=trade(state,'sell','potion',2).state;assert.equal(state.craftedInventory.potion,1);assert.equal(state.craftedDisplayed.potion,1);assert.equal(state.objectives.craftedSale,'in-progress');
    state=setDisplayQuantity(state,'potion',0).state;assert.equal(state.craftedDisplayed.potion,0);
    state=setDisplayQuantity(state,'potion',1).state;state=sellDisplayed(state,'potion').state;
    assert.equal(state.craftedInventory.potion,0);assert.equal(state.craftedDisplayed.potion,0);assert.equal(state.objectives.craftedSale,'ready');
});

test('매입한 물약·제작품 직접 판매는 목표 달성 제외, 두 제작 물약 모두 NPC 판매 인정',()=>{
    let bought=trade(createInitialState(),'buy','potion').state;bought=setDisplayQuantity(bought,'potion',1).state;bought=sellDisplayed(bought,'potion').state;
    assert.equal(bought.objectives.craftedSale,'in-progress');
    for(const [recipe,output]of [['health-potion','potion'],['mana-potion','manaPotion']]){
        let source=trade(createInitialState(),'buy','herb',2).state;source=trade(source,'buy','mushroom').state;source=craft(source,recipe).state;
        const manual=trade(source,'sell',output).state;assert.equal(manual.objectives.craftedSale,'in-progress');assert.equal(manual.craftedInventory[output],0);
        const displayed=setDisplayQuantity(source,output,1).state;assert.equal(sellDisplayed(displayed,output).state.objectives.craftedSale,'ready');
    }
});

test('세 목표 달성 후 총 450G 수령·재접속·다음 날·새 게임, 판매 이익과 보상 구분',()=>{
    const p=port(),store=createGameStore(createSaveRepository(p));perfectCraftedDay(store);
    assert.deepEqual(store.getSnapshot().economy.objectives,{firstDay:'ready',craftedSale:'ready',perfectDay:'ready'});
    const summary=store.getSnapshot().day.summary;assert.equal(summary.profit,150);
    for(const id of ['firstDay','craftedSale','perfectDay'])store.claimObjective(id);
    assert.equal(store.getSnapshot().economy.gold,1600);assert.equal(claimedRewardGold(store.getSnapshot().economy.objectives),450);
    assert.deepEqual(store.getSnapshot().day.summary,summary);assert.equal(store.getSnapshot().saveInfo.status,'saved');
    const loaded=createGameStore(createSaveRepository(p));assert.deepEqual(loaded.getSnapshot().economy,store.getSnapshot().economy);
    const writes=p.writes;loaded.claimObjective('craftedSale');assert.equal(p.writes,writes);assert.equal(loaded.getSnapshot().economy.gold,1600);
    loaded.nextDay();assert.equal(loaded.getSnapshot().economy.objectives.perfectDay,'claimed');
    loaded.newGame();assert.equal(loaded.getSnapshot().economy.gold,1000);assert.deepEqual(loaded.getSnapshot().economy.objectives,createObjectiveProgress());
    assert.deepEqual(loaded.getSnapshot().economy.craftedInventory,itemValues(()=>0));
});

test('영업 중 제작품 판매 목표 달성해도 수령 차단, 중간 복귀 시 개점 전 출처와 목표 복원',()=>{
    const p=port(),store=createGameStore(createSaveRepository(p));store.buy('herb',2);store.craft('health-potion');store.setDisplay('potion',1);store.startDay();
    finishOne(store);finishOne(store);assert.equal(store.getSnapshot().economy.objectives.craftedSale,'ready');
    const sold=store.getSnapshot().economy;store.claimObjective('craftedSale');assert.equal(store.getSnapshot().economy,sold);
    const loaded=createGameStore(createSaveRepository(p));assert.equal(loaded.getSnapshot().economy.objectives.craftedSale,'in-progress');
    assert.equal(loaded.getSnapshot().economy.craftedInventory.potion,1);assert.equal(loaded.getSnapshot().economy.craftedDisplayed.potion,1);
    loaded.startDay();finishDay(loaded);assert.equal(loaded.getSnapshot().economy.objectives.craftedSale,'ready');
});

test('보상 저장 실패는 골드·수령 상태·저장 원문 보존, 재시도 시 한 번만 지급',()=>{
    const p=port(),store=createGameStore(createSaveRepository(p));store.startDay();finishDay(store);
    const before=store.getSnapshot(),raw=p.raw;p.fail=true;store.claimObjective('firstDay');
    assert.equal(store.getSnapshot().economy,before.economy);assert.equal(store.getSnapshot().day,before.day);assert.equal(p.raw,raw);assert.equal(store.getSnapshot().saveInfo.status,'error');
    p.fail=false;store.claimObjective('firstDay');assert.equal(store.getSnapshot().economy.gold,1100);
    assert.equal(decodeSave(p.raw).state.economy.objectives.firstDay,'claimed');
    store.claimObjective('firstDay');assert.equal(store.getSnapshot().economy.gold,1100);
});

test('다른 창이 변경한 저장은 보상 수령으로 덮어쓰지 않음',()=>{
    const p=port(),store=createGameStore(createSaveRepository(p));store.startDay();finishDay(store);const before=store.getSnapshot().economy;
    p.raw='changed in another tab';store.claimObjective('firstDay');assert.equal(store.getSnapshot().economy,before);assert.equal(p.raw,'changed in another tab');assert.equal(store.getSnapshot().saveInfo.status,'blocked');
});

test('준비 중 보상을 수령하면 최근 매입·제작·진열도 함께 저장',()=>{
    const p=port(),store=createGameStore(createSaveRepository(p));store.startDay();finishDay(store);store.nextDay();store.buy('herb',4);store.craft('health-potion',2);store.setDisplay('potion',2);
    store.claimObjective('firstDay');assert.equal(store.getSnapshot().saveInfo.status,'saved');
    const loaded=createGameStore(createSaveRepository(p));assert.deepEqual(loaded.getSnapshot().economy,store.getSnapshot().economy);assert.equal(loaded.getSnapshot().day.phase,'preparing');assert.equal(loaded.getSnapshot().day.number,2);
});

for(const phase of ['preparing','closed'])test(`실제 버전 6 ${phase} 호환: 확인 가능한 목표만 인정, 과거 제작 출처 추정 금지`,()=>{
    const raw=readFileSync(new URL(`./fixtures/save-v6-${phase}.json`,import.meta.url),'utf8'),old=JSON.parse(raw),p=port(raw),store=createGameStore(createSaveRepository(p));
    const {economy}=store.getSnapshot();assert.equal(store.getSnapshot().saveInfo.status,'saved');assert.equal(p.raw,raw);assert.equal(p.writes,0);
    assert.equal(economy.gold,old.state.economy.gold);assert.deepEqual(economy.craftedInventory,itemValues(()=>0));assert.deepEqual(economy.craftedDisplayed,itemValues(()=>0));
    assert.equal(economy.objectives.craftedSale,'in-progress');assert.equal(economy.objectives.firstDay,phase==='closed'?'ready':'in-progress');assert.equal(economy.objectives.perfectDay,phase==='closed'?'ready':'in-progress');
    assert.deepEqual(store.getSnapshot().day,{...old.state.day,explorationUsed:0});assert.equal(JSON.parse(encodeSave({...store.getSnapshot(),checkpoint:old.state.checkpoint})).version,SAVE_VERSION);
});

test('수령 보상·잔액 불일치, 불가능한 제작 재고·진열, 목표 누락과 미래 저장 보호',()=>{
    const store=createGameStore();perfectCraftedDay(store);const raw=encodeSave({...store.getSnapshot(),checkpoint:'closed'});
    for(const change of [
        v=>{delete v.state.economy.objectives;},v=>{delete v.state.economy.objectives.firstDay;},v=>{v.state.economy.objectives.firstDay='claimed';},v=>{v.state.economy.objectives.craftedSale='bad';},
        v=>{delete v.state.economy.craftedInventory;},v=>{v.state.economy.craftedInventory.potion=1;},v=>{v.state.economy.craftedDisplayed.potion=1;},v=>{v.state.economy.craftedInventory.herb=1;},v=>{v.version=SAVE_VERSION+1;},
    ]){const value=JSON.parse(raw);change(value);const bad=JSON.stringify(value);assert.equal(decodeSave(bad).ok,false);const p=port(bad),guarded=createGameStore(createSaveRepository(p));guarded.claimObjective('firstDay');assert.equal(p.raw,bad);assert.equal(p.writes,0);}
});
