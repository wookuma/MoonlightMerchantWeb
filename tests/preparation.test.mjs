import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreparationPlan } from '../src/domain/preparation.ts';
import { createInitialState, trade } from '../src/domain/economy.ts';
import { craft } from '../src/domain/crafting.ts';
import { setDisplayQuantity } from '../src/domain/display.ts';
import { expandShop } from '../src/domain/shopExpansion.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';

const row=(plan,id)=>plan.rows.find(row=>row.item.id===id);
function buy(state,id,n){const result=trade(state,'buy',id,n);assert.equal(result.ok,true);return result.state;}

test('빈 상점: 부족 상품 직접 매입 총액과 제작 재료 추가 매입 비용을 분리',()=>{
    const plan=getPreparationPlan(createInitialState(),1);
    assert.equal(plan.directPurchaseCost,240);assert.equal(plan.goldShortage,0);assert.equal(plan.ready,false);
    assert.equal(row(plan,'herb').demand,2);assert.equal(row(plan,'herb').shortage,2);
    const potion=row(plan,'potion');assert.equal(potion.shortage,2);assert.equal(potion.directPurchaseCost,80);
    assert.equal(potion.crafting.craftableNow,0);assert.equal(potion.crafting.materials[0].required,4);
    assert.equal(potion.crafting.materialPurchaseCost,80);
    assert.equal(row(plan,'manaPotion').crafting,null);assert.equal(row(plan,'mushroom').demand,0);
});

test('진열·보관 완제품을 중복 계산하지 않고 진열만 필요한 경우 추가 매입 0',()=>{
    let state=buy(createInitialState(),'herb',3);state=buy(state,'potion',2);state=buy(state,'sword',1);
    state=setDisplayQuantity(state,'herb',1).state;
    const plan=getPreparationPlan(state,1),herb=row(plan,'herb');
    assert.equal(herb.displayed,1);assert.equal(herb.stored,2);assert.equal(herb.toDisplay,1);
    assert.equal(herb.fromStorage,1);assert.equal(herb.shortage,0);
    assert.equal(plan.directPurchaseCost,0);assert.equal(plan.ready,false);assert.equal(row(plan,'potion').crafting,null);
    state=setDisplayQuantity(state,'herb',2).state;state=setDisplayQuantity(state,'potion',2).state;state=setDisplayQuantity(state,'sword',1).state;
    assert.equal(getPreparationPlan(state,1).ready,true);
});

test('마나 물약 부족 2개: 원재료 판매용 예약 후 현재 1개 제작, 부족 재료 비용 45G',()=>{
    let state=buy(createInitialState(),'herb',2);state=buy(state,'mushroom',1);state=buy(state,'manaPotion',1);
    const plan=getPreparationPlan(state,3),mana=row(plan,'manaPotion');
    assert.equal(mana.demand,3);assert.equal(mana.fromStorage,1);assert.equal(mana.shortage,2);
    assert.equal(mana.directPurchaseCost,120);assert.equal(mana.crafting.craftableNow,1);
    const [herb,mushroom]=mana.crafting.materials;
    assert.equal(herb.required,2);assert.equal(herb.stored,2);assert.equal(herb.reserved,1);assert.equal(herb.available,1);assert.equal(herb.missing,1);
    assert.equal(mushroom.required,2);assert.equal(mushroom.available,1);assert.equal(mushroom.missing,1);
    assert.equal(mana.crafting.materialPurchaseCost,45);assert.equal(plan.directPurchaseCost,160);
});

test('진열된 재료는 제작에서 제외하고 보관 중 원재료 수요도 보호',()=>{
    let state=buy(createInitialState(),'herb',3);state=buy(state,'mushroom',2);
    state=setDisplayQuantity(state,'herb',1).state;state=setDisplayQuantity(state,'mushroom',2).state;
    const mana=row(getPreparationPlan(state,2),'manaPotion').crafting;
    assert.equal(mana.craftableNow,0);
    assert.equal(mana.materials[0].stored,2);assert.equal(mana.materials[0].reserved,1);assert.equal(mana.materials[0].available,1);
    assert.equal(mana.materials[1].stored,0);assert.equal(mana.materials[1].available,0);
    assert.equal(mana.materialPurchaseCost,70);
});

test('두 물약 제작안은 개별 선택지, 실제 제작 후 공유 약초 사용 가능 수량 재계산',()=>{
    let state=buy(createInitialState(),'herb',3);state=buy(state,'mushroom',3);
    const before=getPreparationPlan(state,3);
    assert.equal(row(before,'potion').crafting.craftableNow,1);
    assert.equal(row(before,'manaPotion').crafting.craftableNow,2);
    const result=craft(state,'health-potion');assert.equal(result.ok,true);
    const after=getPreparationPlan(result.state,3);
    assert.equal(row(after,'potion').shortage,0);assert.equal(row(after,'potion').crafting,null);
    assert.equal(row(after,'manaPotion').crafting.craftableNow,0);
    assert.equal(row(after,'manaPotion').crafting.materials[0].reserved,1);
    assert.equal(row(after,'manaPotion').crafting.materialPurchaseCost,60);
});

test('확장 단계 수요 반영, 부족 골드 계산, 판매가 변경은 매입 예상 비용에 영향 없음',()=>{
    const initial=createInitialState(),first=expandShop(initial).state,second=expandShop(first).state;
    assert.equal(getPreparationPlan(first,1).directPurchaseCost,380);
    const plan=getPreparationPlan(second,1);assert.equal(plan.directPurchaseCost,540);assert.equal(plan.goldShortage,440);
    const expensive={...second,prices:{...second.prices,potion:999,manaPotion:999}};
    assert.equal(getPreparationPlan(expensive,1).directPurchaseCost,540);
});

test('도우미는 상태·골드·저장을 변경하지 않고 재접속한 체크포인트에서 같은 안내 계산',()=>{
    const port={raw:null,writes:0,getItem(){return this.raw;},setItem(_key,value){this.raw=value;this.writes++;}};
    const store=createGameStore(createSaveRepository(port));store.buy('herb');store.setDisplay('herb',1);
    const snapshot=store.getSnapshot(),before=structuredClone(snapshot.economy);
    const plan=getPreparationPlan(snapshot.economy,snapshot.day.number);
    assert.equal(store.getSnapshot(),snapshot);assert.equal(port.writes,0);assert.deepEqual(snapshot.economy,before);
    store.startDay();const loaded=createGameStore(createSaveRepository(port));
    assert.deepEqual(getPreparationPlan(loaded.getSnapshot().economy,loaded.getSnapshot().day.number),plan);
    const frozen=structuredClone(before);for(const value of Object.values(frozen))if(value&&typeof value==='object')Object.freeze(value);Object.freeze(frozen);
    assert.deepEqual(getPreparationPlan(frozen,1),plan);
});
