import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { items, createInitialState, trade, itemValues } from '../src/domain/economy.ts';
import { craft } from '../src/domain/crafting.ts';
import { setDisplayQuantity } from '../src/domain/display.ts';
import { customers, decidePurchase } from '../src/domain/customerVisit.ts';
import { getDayPlan } from '../src/domain/shopDay.ts';
import { reportRows } from '../src/domain/salesReport.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from '../src/services/save/saveData.ts';
import { shelfPosition } from '../src/game/shelfLayout.ts';

function port(raw=null){return{raw,writes:0,getItem(){return this.raw;},setItem(_key,v){this.raw=v;this.writes++;}};}
function finishDay(store){let n=0;while(store.getSnapshot().day.phase==='open'){assert.ok(n++<9);const {visit}=store.getSnapshot();for(const e of ['arrived','decide','departed'])store.advanceVisit(visit.id,e);}}
function initialMaterials(){let s=trade(createInitialState(),'buy','herb',2).state;return trade(s,'buy','mushroom',2).state;}

test('마나 물약 제작: 서로 다른 재료 2종 원가 합산, 묶음 제작과 이익 보존',()=>{
    const source=initialMaterials(),result=craft(source,'mana-potion',2);
    assert.equal(result.ok,true);assert.equal(result.state.gold,910);
    assert.deepEqual(result.state.inventory,itemValues(item=>item.id==='manaPotion'?2:0));
    assert.deepEqual(result.state.inventoryCosts,itemValues(item=>item.id==='manaPotion'?90:0));
    assert.equal(result.state.purchaseSpend,90);assert.equal(result.state.revenue,0);
    assert.equal(result.state.displayed.manaPotion,0);
    const sold=trade(result.state,'sell','manaPotion').state;
    assert.equal(sold.gold,1000);assert.equal(sold.costOfGoodsSold,45);
    assert.equal(sold.revenue-sold.costOfGoodsSold,45);
    assert.equal(source.inventory.herb,2);assert.equal(source.inventory.mushroom,2);
});

test('두 번째 재료 부족·진열 재료 보호·완성품 오버플로는 첫 재료도 소비하지 않음',()=>{
    const herbOnly=trade(createInitialState(),'buy','herb').state;
    const missing=craft(herbOnly,'mana-potion');assert.equal(missing.ok,false);assert.equal(missing.state,herbOnly);assert.ok(missing.message.includes('달빛 버섯'));
    const source=initialMaterials();
    const reserved=setDisplayQuantity(source,'mushroom',2).state;
    assert.equal(craft(reserved,'mana-potion').state,reserved);
    const recalled=setDisplayQuantity(reserved,'mushroom',1).state;
    const made=craft(recalled,'mana-potion');assert.equal(made.ok,true);assert.equal(made.state.displayed.mushroom,1);
    const overflow={...source,inventory:{...source.inventory,manaPotion:Number.MAX_SAFE_INTEGER}};
    assert.equal(craft(overflow,'mana-potion').state,overflow);
});

test('버섯과 마나 물약 손님: 진열분 구매, 재고·원가·예산과 적정가 규칙 연결',()=>{
    for(const id of ['mushroom','manaPotion']){
        const customer=customers.find(c=>c.itemId===id);assert.ok(customer);
        const source=trade(createInitialState(),'buy',id).state;
        assert.equal(decidePurchase(source,customer).outcome.reason,'display');
        const stocked=setDisplayQuantity(source,id,1).state;
        const bought=decidePurchase(stocked,customer);assert.equal(bought.outcome.kind,'purchased');
        assert.equal(bought.economy.inventory[id],0);assert.equal(bought.economy.inventoryCosts[id],0);
        assert.equal(decidePurchase({...stocked,prices:{...stocked.prices,[id]:customer.budget+1}},customer).outcome.reason,'budget');
        assert.equal(decidePurchase({...stocked,prices:{...stocked.prices,[id]:customer.maxPrice+1}},customer).outcome.reason,'price');
    }
});

test('2일차 새 상품 수요에 매입·제작·진열·NPC 판매·결산·저장 복원을 끝까지 연결',()=>{
    const p=port();let store=createGameStore(createSaveRepository(p));store.startDay();finishDay(store);store.nextDay();
    assert.ok(getDayPlan(2).some(c=>c.itemId==='manaPotion'));assert.ok(getDayPlan(2).some(c=>c.itemId==='mushroom'));
    for(let i=0;i<4;i++)store.buy('herb');for(let i=0;i<3;i++)store.buy('mushroom');store.craft('mana-potion',2);
    assert.equal(store.getSnapshot().economy.inventoryCosts.manaPotion,90);
    store.setDisplay('herb',2);store.setDisplay('mushroom',1);store.setDisplay('manaPotion',2);store.startDay();
    store=createGameStore(createSaveRepository(p));assert.equal(store.getSnapshot().economy.inventoryCosts.manaPotion,90);
    store.startDay();const opened=store.getSnapshot().economy;store.craft('mana-potion');assert.equal(store.getSnapshot().economy,opened);
    finishDay(store);const {day,economy}=store.getSnapshot();
    assert.deepEqual(day.summary,{day:2,visitors:5,buyers:5,revenue:290,costOfGoodsSold:155,profit:135});
    assert.equal(economy.gold,1135);assert.deepEqual(economy.inventory,itemValues(()=>0));
    assert.equal(reportRows(day.report).find(r=>r.item.id==='manaPotion').sold,2);
    const loaded=createGameStore(createSaveRepository(p));assert.deepEqual(loaded.getSnapshot().day,day);
    assert.equal(JSON.parse(p.raw).version,SAVE_VERSION);
});

for(const phase of ['preparing','closed'])test(`실제 버전 5 ${phase} 저장: 기존 원가·가격·수요 결산 보존, 새 상품만 기본값 보충`,()=>{
    const raw=readFileSync(new URL(`./fixtures/save-v5-${phase}.json`,import.meta.url),'utf8'),old=JSON.parse(raw);
    const p=port(raw),store=createGameStore(createSaveRepository(p));assert.equal(store.getSnapshot().saveInfo.status,'saved');
    assert.equal(p.raw,raw);assert.equal(p.writes,0);
    const {economy,day}=store.getSnapshot();
    assert.deepEqual(day,old.state.day);assert.equal(economy.gold,old.state.economy.gold);
    for(const field of ['inventory','inventoryCosts','displayed','prices'])for(const id of ['herb','potion','sword'])assert.equal(economy[field][id],old.state.economy[field][id]);
    for(const id of ['mushroom','manaPotion']){assert.equal(economy.inventory[id],0);assert.equal(economy.inventoryCosts[id],0);assert.equal(economy.displayed[id],0);}
    assert.equal(economy.prices.mushroom,40);assert.equal(economy.prices.manaPotion,90);
    const rewritten=encodeSave({...store.getSnapshot(),checkpoint:old.state.checkpoint});assert.equal(JSON.parse(rewritten).version,SAVE_VERSION);
    assert.deepEqual(decodeSave(rewritten).state.day,old.state.day);
    if(phase==='closed')store.nextDay();store.startDay();finishDay(store);assert.equal(store.getSnapshot().saveInfo.status,'saved');
});

test('새 버전 상품 필드 누락·잘못된 가격·미지원 버전은 자동 보충 없이 보호',()=>{
    const store=createGameStore(),raw=encodeSave({...store.getSnapshot(),checkpoint:'before-open'});
    for(const change of [v=>{delete v.state.economy.inventory.mushroom;},v=>{delete v.state.economy.inventoryCosts.manaPotion;},v=>{v.state.economy.prices.manaPotion=0;},v=>{v.state.economy.displayed.mushroom=1;},v=>{v.version=8;}]){
        const value=JSON.parse(raw);change(value);const bad=JSON.stringify(value);assert.equal(decodeSave(bad).ok,false);
        const p=port(bad),guarded=createGameStore(createSaveRepository(p));guarded.startDay();assert.equal(p.raw,bad);assert.equal(p.writes,0);
    }
});

test('상품 5종 진열과 손님 접근 좌표가 모두 상점 안에 배치됨',()=>{
    assert.equal(items.length,5);const centers=items.map((_,i)=>shelfPosition(i).centerX);
    assert.equal(new Set(centers).size,5);
    for(let i=0;i<items.length;i++){const pos=shelfPosition(i);assert.ok(pos.x>=64&&pos.x+104<=736);assert.ok(pos.centerX>=pos.x&&pos.centerX<=pos.x+104);}
});
