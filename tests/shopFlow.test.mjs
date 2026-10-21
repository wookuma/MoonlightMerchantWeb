import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createGameUiStore } from '../src/stores/gameUiStore.ts';
import { createShopFlow } from '../src/stores/shopFlow.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';

function finishDay(store) {
    for (let index=0; index<9 && store.getSnapshot().day.phase === 'open'; index++) {
        const { visit, session } = store.getSnapshot();
        store.advanceVisit(visit.id, 'arrived', session);
        store.advanceVisit(visit.id, 'decide', session);
        store.advanceVisit(visit.id, 'departed', session);
    }
    assert.equal(store.getSnapshot().day.phase,'closed');
}

test('준비 모달에서 개점하면 준비 재고를 유지하고 메뉴를 닫으며 중복 개점은 무시', () => {
    const store=createGameStore(), ui=createGameUiStore(), flow=createShopFlow(store,ui);
    store.buy('herb',3);store.setDisplay('herb',3);ui.open('prepare');
    const economy=store.getSnapshot().economy;
    flow.startTrading();
    assert.equal(store.getSnapshot().day.phase,'open');
    assert.equal(store.getSnapshot().economy,economy);
    assert.equal(ui.getSnapshot().menu,null);
    const open=store.getSnapshot();ui.open('goods');flow.startTrading();
    assert.equal(store.getSnapshot(),open);
    assert.equal(ui.getSnapshot().menu,'goods');
});

test('결산 후 다음 날 준비는 골드·재고를 보존하고 매입 화면으로 연결, 중복 클릭은 날짜 유지', () => {
    const port={raw:null,writes:0,getItem(){return this.raw;},setItem(_key,value){this.raw=value;this.writes++;}};
    const store=createGameStore(createSaveRepository(port)),ui=createGameUiStore(),flow=createShopFlow(store,ui);
    store.buy('herb',3);store.setDisplay('herb',1);flow.startTrading();finishDay(store);
    assert.equal(store.getSnapshot().day.phase,'closed');
    const { economy }=store.getSnapshot(),writes=port.writes;
    ui.open('ledger');flow.prepareNextDay();
    assert.equal(store.getSnapshot().day.phase,'preparing');
    assert.equal(store.getSnapshot().day.number,2);
    assert.equal(store.getSnapshot().economy,economy);
    assert.equal(ui.getSnapshot().menu,'goods');
    assert.equal(port.writes,writes+1);
    const next=store.getSnapshot();flow.prepareNextDay();assert.equal(store.getSnapshot(),next);
    store.buy('herb');assert.equal(store.getSnapshot().success,true);
    assert.equal(store.getSnapshot().economy.inventory.herb,economy.inventory.herb+1);
});

test('영업 중 다음 날 조작은 진행·메뉴를 바꾸거나 거래 제한을 우회하지 않음', () => {
    const store=createGameStore(),ui=createGameUiStore(),flow=createShopFlow(store,ui);
    ui.open('craft');const preparing=store.getSnapshot();flow.prepareNextDay();
    assert.equal(store.getSnapshot(),preparing);assert.equal(ui.getSnapshot().menu,'craft');
    flow.startTrading();ui.open('goods');const open=store.getSnapshot();flow.prepareNextDay();
    assert.equal(store.getSnapshot(),open);assert.equal(ui.getSnapshot().menu,'goods');
    store.buy('herb');assert.equal(store.getSnapshot().success,false);assert.equal(store.getSnapshot().economy,open.economy);
    finishDay(store);ui.open('ledger');const closed=store.getSnapshot();flow.startTrading();
    assert.equal(store.getSnapshot(),closed);assert.equal(ui.getSnapshot().menu,'ledger');
});
