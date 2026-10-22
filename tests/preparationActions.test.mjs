import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPreparationAction } from '../src/domain/preparationActions.ts';
import { getPreparationPlan } from '../src/domain/preparation.ts';
import { createDay } from '../src/domain/shopDay.ts';
import { createInitialState,trade } from '../src/domain/economy.ts';
import { setDisplayQuantity } from '../src/domain/display.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';

const buy=(state,id,n)=>trade(state,'buy',id,n).state;
function act(store,id,action){store.prepareItem(id,action,store.getSnapshot().revision);}
function finishDay(store){for(let index=0;index<9&&store.getSnapshot().day.phase==='open';index++){const {visit}=store.getSnapshot();for(const event of ['arrived','decide','departed'])store.advanceVisit(visit.id,event);}assert.equal(store.getSnapshot().day.phase,'closed');}

test('기존 재고를 제외한 부족 수량만 매입, 미리보기는 원본 경제 상태 유지',()=>{
    const state=buy(createInitialState(),'potion',1),before=structuredClone(state),quote=previewPreparationAction(state,createDay(),'potion','buy');
    assert.equal(quote.result.ok,true);assert.equal(quote.quantity,1);assert.equal(quote.cost,40);assert.equal(quote.result.state.inventory.potion,2);assert.equal(quote.result.state.gold,state.gold-40);assert.deepEqual(state,before);
    const full=previewPreparationAction(quote.result.state,createDay(),'potion','buy');assert.equal(full.result.ok,false);assert.equal(full.result.state,quote.result.state);
});

test('보관 완제품은 수요에 필요한 만큼만 진열하고 초과 진열 재고는 회수하지 않음',()=>{
    const state=buy(createInitialState(),'herb',3),quote=previewPreparationAction(state,createDay(),'herb','display');
    assert.equal(quote.quantity,2);assert.equal(quote.cost,0);assert.equal(quote.result.ok,true);assert.equal(quote.result.state.displayed.herb,2);assert.equal(quote.result.state.inventory.herb,3);
    const over=setDisplayQuantity(state,'herb',3).state,again=previewPreparationAction(over,createDay(),'herb','display');assert.equal(again.result.ok,false);assert.equal(again.result.state,over);
});

test('물약 제작은 원재료 판매 수요를 보존하고 필요한 수량만 제작, 자동 진열·추가 골드 소모 없음',()=>{
    const state=buy(createInitialState(),'herb',6),quote=previewPreparationAction(state,createDay(),'potion','craft');
    assert.equal(quote.quantity,2);assert.equal(quote.cost,80);assert.equal(quote.result.ok,true);
    const next=quote.result.state;assert.equal(next.inventory.herb,2);assert.equal(next.inventory.potion,2);assert.equal(next.craftedInventory.potion,2);assert.equal(next.displayed.potion,0);assert.equal(next.gold,state.gold);
    assert.equal(previewPreparationAction(next,createDay(),'potion','craft').result.ok,false);
    const reserved=buy(createInitialState(),'herb',2);assert.equal(previewPreparationAction(reserved,createDay(),'potion','craft').result.state,reserved);
});

test('공유 약초 제작안은 한 작업 후 다시 계산하며 재료를 이중 소비하지 않음',()=>{
    let state=buy(createInitialState(),'herb',3);state=buy(state,'mushroom',3);const day=createDay(3);
    assert.equal(previewPreparationAction(state,day,'manaPotion','craft').quantity,2);
    const potion=previewPreparationAction(state,day,'potion','craft');assert.equal(potion.result.ok,true);assert.equal(potion.quantity,1);
    const mana=previewPreparationAction(potion.result.state,day,'manaPotion','craft');assert.equal(mana.result.ok,false);assert.equal(mana.result.state,potion.result.state);assert.equal(potion.result.state.inventory.herb,1);
});

test('바로 준비→개점→중간 복귀→전원 판매→결산까지 원가·자동 저장 유지',()=>{
    const port={raw:null,writes:0,getItem(){return this.raw;},setItem(_key,value){this.raw=value;this.writes++;}};let store=createGameStore(createSaveRepository(port));
    for(const id of ['herb','potion','sword']){act(store,id,'buy');assert.equal(store.getSnapshot().success,true);act(store,id,'display');assert.equal(store.getSnapshot().success,true);}
    assert.equal(getPreparationPlan(store.getSnapshot().economy,1).ready,true);assert.equal(port.writes,0);
    const prepared=store.getSnapshot().economy;store.startDay();assert.equal(port.writes,1);store=createGameStore(createSaveRepository(port));assert.deepEqual(store.getSnapshot().economy,prepared);store.startDay();finishDay(store);
    assert.equal(store.getSnapshot().day.summary.buyers,5);assert.equal(store.getSnapshot().day.summary.profit,150);assert.equal(store.getSnapshot().economy.gold,1150);
    const oldRevision=store.getSnapshot().revision;store.nextDay();const next=store.getSnapshot().economy;store.prepareItem('herb','buy',oldRevision);assert.equal(store.getSnapshot().economy,next);assert.equal(store.getSnapshot().success,false);
});

test('중복 클릭·이전 견적 실행을 거부하고 새 수집 상태에서 수량·비용을 재계산',()=>{
    const store=createGameStore(),revision=store.getSnapshot().revision;store.prepareItem('herb','buy',revision);const bought=store.getSnapshot().economy;
    store.prepareItem('herb','buy',revision);assert.equal(store.getSnapshot().economy,bought);assert.equal(store.getSnapshot().success,false);assert.equal(bought.inventory.herb,2);
    const fresh=createGameStore(),before=fresh.getSnapshot().revision;fresh.forage('herb');const gathered=fresh.getSnapshot().economy;fresh.prepareItem('herb','buy',before);assert.equal(fresh.getSnapshot().economy,gathered);
    const quote=previewPreparationAction(gathered,fresh.getSnapshot().day,'herb','buy');assert.equal(quote.quantity,1);assert.equal(quote.cost,20);act(fresh,'herb','buy');assert.equal(fresh.getSnapshot().economy.inventory.herb,2);assert.equal(fresh.getSnapshot().economy.gold,980);
});

test('골드 부족·비정상 상품/작업·영업 중·마감에서는 경제 상태와 재고를 유지',()=>{
    const store=createGameStore();store.expandShop();store.expandShop();const before=store.getSnapshot().economy;
    const quote=previewPreparationAction(before,store.getSnapshot().day,'potion','buy');assert.equal(quote.quantity,3);assert.equal(quote.cost,120);assert.equal(quote.result.ok,false);act(store,'potion','buy');assert.equal(store.getSnapshot().economy,before);
    act(store,'unknown','buy');assert.equal(store.getSnapshot().economy,before);act(store,'herb','sell');assert.equal(store.getSnapshot().economy,before);
    store.startDay();act(store,'herb','buy');assert.equal(store.getSnapshot().economy,before);finishDay(store);const closed=store.getSnapshot().economy;act(store,'herb','buy');assert.equal(store.getSnapshot().economy,closed);
});

test('수집·매입 재료를 섞어 제작할 때 버튼 견적은 실제 재료 원가와 동일',()=>{
    const store=createGameStore();store.forage('herb');store.forage('herb');store.buy('herb',2);
    const {economy,day}=store.getSnapshot(),quote=previewPreparationAction(economy,day,'potion','craft');assert.equal(quote.result.ok,true);assert.equal(quote.quantity,1);assert.equal(quote.cost,20);
    act(store,'potion','craft');assert.equal(store.getSnapshot().economy.gold,economy.gold);assert.equal(store.getSnapshot().economy.inventoryCosts.potion,20);assert.equal(store.getSnapshot().economy.inventory.herb,2);assert.equal(store.getSnapshot().economy.displayed.potion,0);
});
