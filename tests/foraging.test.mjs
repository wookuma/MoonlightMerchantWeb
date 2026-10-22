import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/domain/economy.ts';
import { createDay } from '../src/domain/shopDay.ts';
import { forage } from '../src/domain/foraging.ts';
import { craft } from '../src/domain/crafting.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { encodeSave,decodeSave,SAVE_VERSION } from '../src/services/save/saveData.ts';

function storage(raw=null){return{raw,writes:0,fail:false,getItem(){return this.raw;},setItem(_key,value){if(this.fail)throw Error('quota');this.raw=value;this.writes++;}};}
function finishDay(store){for(let index=0;index<9&&store.getSnapshot().day.phase==='open';index++){const {visit}=store.getSnapshot();for(const event of ['arrived','decide','departed'])store.advanceVisit(visit.id,event);}assert.equal(store.getSnapshot().day.phase,'closed');}
function saved(store,checkpoint='before-open'){return{...store.getSnapshot(),checkpoint};}

test('약초·버섯을 하루 두 번 1개씩 보관에 추가, 골드·원가·진열은 변경하지 않음',()=>{
    const economy=createInitialState(),day=createDay();const first=forage(economy,day,'herb');
    assert.equal(first.ok,true);assert.equal(first.economy.inventory.herb,1);assert.equal(first.day.explorationUsed,1);
    assert.deepEqual(economy,createInitialState());assert.deepEqual(day,createDay());
    assert.equal(first.economy.gold,1000);assert.equal(first.economy.purchaseSpend,0);assert.equal(first.economy.inventoryCosts,economy.inventoryCosts);assert.equal(first.economy.displayed,economy.displayed);
    const second=forage(first.economy,first.day,'mushroom');assert.equal(second.ok,true);assert.equal(second.economy.inventory.mushroom,1);assert.equal(second.day.explorationUsed,2);
    const third=forage(second.economy,second.day,'herb');assert.equal(third.ok,false);assert.equal(third.economy,second.economy);assert.equal(third.day,second.day);
});

test('같은 재료 두 번 선택 가능, 미등록 상품·잘못된 횟수·단계·수량 오버플로는 원본 유지',()=>{
    const economy=createInitialState(),day=createDay();const first=forage(economy,day,'herb'),second=forage(first.economy,first.day,'herb');assert.equal(second.economy.inventory.herb,2);
    for(const material of ['potion','manaPotion','sword','',null]){const result=forage(economy,day,material);assert.equal(result.ok,false);assert.equal(result.economy,economy);assert.equal(result.day,day);}
    for(const used of [-1,0.5,3,NaN,Infinity,Number.MAX_SAFE_INTEGER]){const changed={...day,explorationUsed:used};const result=forage(economy,changed,'herb');assert.equal(result.ok,false);assert.equal(result.day,changed);assert.equal(result.economy,economy);}
    for(const phase of ['open','closed']){const result=forage(economy,{...day,phase},'herb');assert.equal(result.ok,false);assert.equal(result.economy,economy);}
    const full={...economy,inventory:{...economy.inventory,herb:Number.MAX_SAFE_INTEGER}};assert.equal(forage(full,day,'herb').economy,full);
});

test('수집 즉시 체크포인트 저장, 새로고침·개점 직전 롤백 후에도 횟수·재료 중복 지급 없음',()=>{
    const port=storage();let store=createGameStore(createSaveRepository(port));store.buy('sword');store.forage('herb');
    assert.equal(store.getSnapshot().saveInfo.status,'saved');assert.equal(port.writes,1);assert.equal(decodeSave(port.raw).state.checkpoint,'exploration');
    store=createGameStore(createSaveRepository(port));assert.equal(store.getSnapshot().day.explorationUsed,1);assert.equal(store.getSnapshot().economy.inventory.herb,1);assert.equal(store.getSnapshot().economy.inventory.sword,1);
    store.forage('mushroom');assert.equal(port.writes,2);store.forage('herb');assert.equal(port.writes,2);assert.equal(store.getSnapshot().success,false);
    store.startDay();const visits=store.getSnapshot().visitCount;store=createGameStore(createSaveRepository(port));
    assert.equal(store.getSnapshot().day.phase,'preparing');assert.equal(store.getSnapshot().day.explorationUsed,2);assert.equal(store.getSnapshot().visitCount,visits-1);
    const before=store.getSnapshot().economy;store.forage('herb');assert.equal(store.getSnapshot().economy,before);assert.equal(store.getSnapshot().day.explorationUsed,2);
});

test('무료 재료 → 원가 0G 물약 제작 → NPC 판매·목표·결산·저장·다음 날까지 연결',()=>{
    const port=storage();let store=createGameStore(createSaveRepository(port));store.forage('herb');store.forage('herb');store.craft('health-potion');store.setDisplay('potion',1);
    assert.equal(store.getSnapshot().economy.inventoryCosts.potion,0);store.startDay();finishDay(store);
    const {economy,day}=store.getSnapshot();assert.equal(day.summary.buyers,1);assert.equal(day.summary.revenue,65);assert.equal(day.summary.costOfGoodsSold,0);assert.equal(day.summary.profit,65);
    assert.equal(economy.gold,1065);assert.equal(economy.purchaseSpend,0);assert.equal(economy.objectives.craftedSale,'ready');assert.equal(store.getSnapshot().saveInfo.status,'saved');
    store=createGameStore(createSaveRepository(port));assert.equal(store.getSnapshot().day.explorationUsed,2);assert.deepEqual(store.getSnapshot().economy,economy);
    store.forage('herb');assert.equal(store.getSnapshot().success,false);store.nextDay();assert.equal(store.getSnapshot().day.explorationUsed,0);store.forage('mushroom');
    assert.equal(store.getSnapshot().economy.inventory.mushroom,1);assert.equal(store.getSnapshot().day.explorationUsed,1);assert.equal(createGameStore(createSaveRepository(port)).getSnapshot().day.explorationUsed,1);
});

test('무료 재료와 매입 재료를 섞어 제작해도 원가·골드 보존, 무료 마나 물약도 제작 가능',()=>{
    const store=createGameStore();store.buy('herb');store.forage('herb');store.craft('health-potion');assert.equal(store.getSnapshot().economy.inventoryCosts.potion,20);
    store.sell('potion');const e=store.getSnapshot().economy;assert.equal(e.gold,1045);assert.equal(e.costOfGoodsSold,20);assert.equal(e.purchaseSpend,20);
    assert.equal(decodeSave(encodeSave(saved(store))).ok,true);
    const start=createInitialState(),day=createDay(),herb=forage(start,day,'herb'),mushroom=forage(herb.economy,herb.day,'mushroom');
    const result=craft(mushroom.economy,'mana-potion');assert.equal(result.ok,true);assert.equal(result.state.inventory.manaPotion,1);assert.equal(result.state.inventoryCosts.manaPotion,0);
});

test('저장 실패·손상 저장 보호·다른 창 충돌에서 획득과 횟수 모두 보존, 실패 후 재시도 가능',()=>{
    const port=storage(),store=createGameStore(createSaveRepository(port));port.fail=true;const before=store.getSnapshot();store.forage('herb');
    assert.equal(store.getSnapshot().economy,before.economy);assert.equal(store.getSnapshot().day,before.day);assert.equal(port.raw,null);assert.equal(store.getSnapshot().saveInfo.status,'error');
    port.fail=false;store.forage('herb');assert.equal(store.getSnapshot().day.explorationUsed,1);assert.equal(port.writes,1);
    const blocked=storage('{damaged'),guarded=createGameStore(createSaveRepository(blocked)),initial=guarded.getSnapshot();guarded.forage('herb');
    assert.equal(blocked.raw,'{damaged');assert.equal(guarded.getSnapshot().day,initial.day);assert.equal(guarded.getSnapshot().economy,initial.economy);
    const shared=storage(),a=createGameStore(createSaveRepository(shared)),b=createGameStore(createSaveRepository(shared));a.forage('herb');const raw=shared.raw;b.forage('mushroom');
    assert.equal(b.getSnapshot().saveInfo.status,'blocked');assert.equal(b.getSnapshot().day.explorationUsed,0);assert.equal(b.getSnapshot().economy.inventory.mushroom,0);assert.equal(shared.raw,raw);
});

test('영업 중·마감은 탐색 불가, 새 게임 횟수 초기화와 저장 실패 시 기존 진행 보존',()=>{
    const port=storage(),store=createGameStore(createSaveRepository(port));store.forage('herb');store.startDay();let before=store.getSnapshot();store.forage('mushroom');
    assert.equal(store.getSnapshot().day,before.day);assert.equal(store.getSnapshot().economy,before.economy);finishDay(store);before=store.getSnapshot();store.forage('mushroom');assert.equal(store.getSnapshot().day,before.day);
    port.fail=true;assert.equal(store.newGame(),false);assert.equal(store.getSnapshot().day.explorationUsed,1);port.fail=false;assert.equal(store.newGame(),true);assert.equal(store.getSnapshot().day.explorationUsed,0);
});

for(const phase of ['preparing','closed'])test(`실제 버전 7 ${phase} 저장은 횟수 0만 추가, 원본은 다음 저장까지 유지`,()=>{
    const raw=readFileSync(new URL(`./fixtures/save-v7-${phase}.json`,import.meta.url),'utf8'),old=JSON.parse(raw),port=storage(raw);
    const store=createGameStore(createSaveRepository(port));assert.equal(store.getSnapshot().saveInfo.status,'saved');assert.equal(port.raw,raw);assert.equal(port.writes,0);
    assert.deepEqual(store.getSnapshot().economy,old.state.economy);assert.deepEqual(store.getSnapshot().day,{...old.state.day,explorationUsed:0});
    if(phase==='closed')store.nextDay();store.forage('herb');assert.equal(store.getSnapshot().saveInfo.status,'saved');assert.equal(JSON.parse(port.raw).version,SAVE_VERSION);
});

test('구버전의 원가 0 위조는 기존 검증으로 거부, 버전 8의 누락·비정상 횟수·과도한 재고도 거부',()=>{
    const legacy=JSON.parse(readFileSync(new URL('./fixtures/save-v7-preparing.json',import.meta.url),'utf8'));const oldCost=legacy.state.economy.inventoryCosts.herb;legacy.state.economy.inventoryCosts.herb=0;legacy.state.economy.purchaseSpend-=oldCost;legacy.state.economy.gold+=oldCost;
    assert.equal(decodeSave(JSON.stringify(legacy)).ok,false);
    const store=createGameStore();store.forage('herb');const raw=encodeSave(saved(store));
    for(const mutate of [v=>{delete v.state.day.explorationUsed;},v=>{v.state.day.explorationUsed=-1;},v=>{v.state.day.explorationUsed=0.1;},v=>{v.state.day.explorationUsed=3;},v=>{v.state.day.explorationUsed='1';},v=>{v.state.economy.inventory.herb=Number.MAX_SAFE_INTEGER;},v=>{v.version=SAVE_VERSION+1;}]){
        const value=JSON.parse(raw);mutate(value);assert.equal(decodeSave(JSON.stringify(value)).ok,false);
    }
});
