import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameUiStore } from '../src/stores/gameUiStore.ts';
import { createGameStore } from '../src/stores/gameStore.ts';

test('매대는 해당 상품의 등록 화면을 한 번에 열고 재고·골드를 자동 변경하지 않음',()=>{
    const ui=createGameUiStore(),store=createGameStore();let changes=0;ui.subscribe(()=>changes++);
    for(const item of ['herb','potion','sword','mushroom','manaPotion']){
        const before=store.getSnapshot();ui.openShelf(item);
        assert.equal(ui.getSnapshot().menu,'goods');assert.equal(ui.getSnapshot().shelfItem,item);
        assert.equal(store.getSnapshot(),before);
    }
    assert.equal(changes,5);ui.openShelf('manaPotion');assert.equal(changes,5);
    ui.close();assert.equal(ui.getSnapshot().shelfItem,null);
    ui.openShelf('herb');ui.open('goods');assert.equal(ui.getSnapshot().shelfItem,null);
});

test('매대에서 등록해도 영업 단계와 진열 한도·재고 검증은 그대로 적용',()=>{
    const ui=createGameUiStore(),store=createGameStore();store.buy('herb',2);ui.openShelf('herb');
    store.setDisplay(ui.getSnapshot().shelfItem,2);assert.equal(store.getSnapshot().economy.displayed.herb,2);
    const before=store.getSnapshot().economy;store.setDisplay('herb',3);assert.equal(store.getSnapshot().economy,before);
    store.startDay();ui.openShelf('herb');store.setDisplay('herb',0);
    assert.equal(store.getSnapshot().success,false);assert.equal(store.getSnapshot().economy,before);
});
