import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuantity, previewTrade, previewCraft } from '../src/domain/orderPreview.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { getPreparationPlan } from '../src/domain/preparation.ts';
import { SAVE_VERSION } from '../src/services/save/saveData.ts';

function finishDay(store) {let count=0;while(store.getSnapshot().day.phase==='open'){assert.ok(count++<9);const {visit}=store.getSnapshot();for(const event of ['arrived','decide','departed'])store.advanceVisit(visit.id,event);}}

test('수량 입력: 빈 값·음수·소수·지수 표기·범위 초과 거부, 진열 0은 허용',()=>{
    for(const raw of ['', ' ', '-1','0','1.5','1.0000000000000000001','1e3','Infinity','NaN','9007199254740992'])assert.equal(parseQuantity(raw),null,raw);
    assert.equal(parseQuantity('6'),6);assert.equal(parseQuantity(' 003 '),3);
    assert.equal(parseQuantity('0',0),0);assert.equal(parseQuantity('',0),null);
    assert.equal(parseQuantity(String(Number.MAX_SAFE_INTEGER)),Number.MAX_SAFE_INTEGER);
});

test('약초 6개 매입 → 물약 3개 제작 → 목표 진열 3개: 요청마다 한 번의 일관된 갱신',()=>{
    const store=createGameStore(),seen=[];store.subscribe(()=>seen.push(store.getSnapshot()));
    store.buy('herb',6);assert.equal(seen.length,1);
    assert.equal(seen[0].economy.gold,880);assert.equal(seen[0].economy.inventory.herb,6);assert.equal(seen[0].economy.inventoryCosts.herb,120);
    store.craft('health-potion',3);assert.equal(seen.length,2);
    assert.equal(seen[1].economy.gold,880);assert.equal(seen[1].economy.inventory.herb,0);assert.equal(seen[1].economy.inventory.potion,3);
    assert.equal(seen[1].economy.inventoryCosts.potion,120);
    store.setDisplay('potion',3);assert.equal(seen.length,3);assert.equal(seen[2].economy.displayed.potion,3);
    const reserved=store.getSnapshot().economy;store.sell('potion',2);assert.equal(store.getSnapshot().economy,reserved);
    store.setDisplay('potion',0);store.sell('potion',2);
    const {economy}=store.getSnapshot();assert.equal(economy.gold,1010);assert.equal(economy.inventory.potion,1);
    assert.equal(economy.inventoryCosts.potion,40);assert.equal(economy.costOfGoodsSold,80);assert.equal(economy.unitsSold,2);
});

test('묶음 골드·재고 부족과 잘못된 수량은 전체 요청 거부, 실패 시 부분 반영 없음',()=>{
    const store=createGameStore();store.buy('sword',6);
    const state=store.getSnapshot().economy;
    store.buy('sword',3);assert.equal(store.getSnapshot().economy,state);assert.equal(store.getSnapshot().success,false);
    store.sell('sword',7);assert.equal(store.getSnapshot().economy,state);
    for(const quantity of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER]){
        store.buy('herb',quantity);assert.equal(store.getSnapshot().economy,state);
        store.sell('sword',quantity);assert.equal(store.getSnapshot().economy,state);
    }
    const crafting=createGameStore();crafting.buy('herb',2);crafting.buy('mushroom',1);
    const before=crafting.getSnapshot().economy;crafting.craft('mana-potion',2);
    assert.equal(crafting.getSnapshot().economy,before);
    for(const quantity of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER]){crafting.craft('mana-potion',quantity);assert.equal(crafting.getSnapshot().economy,before);}
});

test('거래·제작 미리보기는 상태를 바꾸지 않고 실제 묶음 처리 결과와 일치',()=>{
    const store=createGameStore(),snapshot=store.getSnapshot();
    const trade=previewTrade(snapshot.economy,'herb',6);
    assert.equal(trade.buyTotal,120);assert.equal(trade.sellTotal,210);assert.equal(trade.sell.ok,false);
    assert.equal(store.getSnapshot(),snapshot);store.buy('herb',6);assert.deepEqual(store.getSnapshot().economy,trade.buy.state);
    const before=store.getSnapshot();const crafting=previewCraft(before.economy,'health-potion',3);
    assert.equal(crafting.outputQuantity,3);assert.deepEqual(crafting.materials,[{itemId:'herb',quantity:6}]);assert.equal(crafting.totalCost,120);
    assert.equal(store.getSnapshot(),before);store.craft('health-potion',3);assert.deepEqual(store.getSnapshot().economy,crafting.result.state);
    const poor=previewTrade(store.getSnapshot().economy,'sword',8);assert.equal(poor.buyTotal,960);assert.equal(poor.buy.ok,false);
    const huge=previewTrade(before.economy,'sword',Number.MAX_SAFE_INTEGER);assert.equal(huge.buyTotal,null);assert.equal(huge.buy.ok,false);
    const overflow=previewCraft(before.economy,'health-potion',Number.MAX_SAFE_INTEGER);assert.equal(overflow.materials[0].quantity,null);assert.equal(overflow.result.ok,false);
});

test('목표 진열은 전량 회수·확장 한도·현재 소유량을 검증하고 영업과 마감 중 차단',()=>{
    const store=createGameStore();store.buy('herb',6);store.setDisplay('herb',3);
    let before=store.getSnapshot().economy;store.setDisplay('herb',4);assert.equal(store.getSnapshot().economy,before);
    store.expandShop();store.setDisplay('herb',5);assert.equal(store.getSnapshot().economy.displayed.herb,5);
    store.setDisplay('herb',0);assert.equal(store.getSnapshot().economy.displayed.herb,0);
    store.startDay();before=store.getSnapshot().economy;
    store.buy('herb',2);store.sell('herb',2);store.craft('health-potion',2);store.setDisplay('herb',2);assert.equal(store.getSnapshot().economy,before);
    finishDay(store);before=store.getSnapshot().economy;
    store.buy('herb',2);store.sell('herb',2);store.craft('health-potion',2);store.setDisplay('herb',2);assert.equal(store.getSnapshot().economy,before);
});

test('묶음 작업 후 준비 도우미 갱신, 개점 전 저장·중간 복귀·결산까지 원가 보존',()=>{
    const port={raw:null,getItem(){return this.raw;},setItem(_key,raw){this.raw=raw;}};
    let store=createGameStore(createSaveRepository(port));store.buy('herb',6);store.craft('health-potion',3);store.setDisplay('potion',3);
    assert.equal(getPreparationPlan(store.getSnapshot().economy,1).rows.find(row=>row.item.id==='potion').toDisplay,0);
    const prepared=store.getSnapshot().economy;store.startDay();
    store=createGameStore(createSaveRepository(port));assert.deepEqual(store.getSnapshot().economy,prepared);
    store.startDay();finishDay(store);
    assert.equal(store.getSnapshot().day.summary.buyers,2);assert.equal(store.getSnapshot().day.summary.profit,50);
    assert.equal(store.getSnapshot().economy.inventoryCosts.potion,40);
    const loaded=createGameStore(createSaveRepository(port));assert.deepEqual(loaded.getSnapshot().day.summary,store.getSnapshot().day.summary);
    assert.equal(JSON.parse(port.raw).version,SAVE_VERSION);assert.equal(SAVE_VERSION,8);
});
