import { prepareShelves } from './helpers/shelves.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository, createBrowserSaveRepository, SAVE_KEY } from '../src/services/save/saveRepository.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from '../src/services/save/saveData.ts';

function memoryStorage(raw = null) {
    const values = new Map(raw === null ? [] : [[SAVE_KEY, raw]]);
    return {
        reads: 0, writes: 0, failRead: false, failWrite: false,
        get raw() { return values.get(SAVE_KEY) ?? null; },
        set raw(value) { values.set(SAVE_KEY, value); },
        getItem(key) { this.reads++; if (this.failRead) throw new Error('read denied'); return values.get(key) ?? null; },
        setItem(key, value) { this.writes++; if (this.failWrite) throw new Error('quota exceeded'); values.set(key, value); },
    };
}
function stock(store) {
    for (const [id, count] of [['herb', 2], ['potion', 2], ['sword', 1]]) for (let i = 0; i < count; i++) store.buy(id);
}
function finishOne(store) {
    const { visit, session } = store.getSnapshot();
    for (const event of ['arrived', 'decide', 'departed']) store.advanceVisit(visit.id, event, session);
}
function finishDay(store) { for (let i = 0; i < 5; i++) finishOne(store); }
function checkpoint(store, point = 'before-open') {
    const { economy, day, visitCount } = store.getSnapshot();
    return { economy, day, visitCount, checkpoint: point };
}

test('빈 저장소는 읽기만 하며, 준비 중 거래로는 자동 저장하지 않음', () => {
    const storage = memoryStorage();
    const store = createGameStore(createSaveRepository(storage));
    assert.equal(store.getSnapshot().saveInfo.status, 'unsaved');
    stock(store); store.setPrice('herb', 40);
    assert.equal(storage.writes, 0);
    assert.equal(storage.raw, null);
});

test('영업 도중 종료: 개점 직전 골드·재고·가격·방문 순서를 복원하고 중복 수익 없음', () => {
    const storage = memoryStorage();
    const store = createGameStore(createSaveRepository(storage));
    stock(store);
    prepareShelves(store);
    const prepared = store.getSnapshot();
    prepareShelves(store); store.startDay();
    assert.equal(storage.writes, 1);
    const beforeOpenRaw = storage.raw;
    finishOne(store); finishOne(store);
    store.setPrice('herb', 40);
    assert.equal(storage.raw, beforeOpenRaw);
    const restored = createGameStore(createSaveRepository(storage));
    const state = restored.getSnapshot();
    assert.equal(state.day.phase, 'preparing');
    assert.equal(state.day.number, 1);
    assert.equal(state.visit, null);
    assert.equal(state.visitCount, 0);
    assert.deepEqual(state.economy, prepared.economy);
    assert.equal(state.saveInfo.status, 'saved');
    assert.equal(storage.writes, 1);
    prepareShelves(restored); restored.startDay(); finishDay(restored);
    assert.equal(restored.getSnapshot().economy.gold, 1150);
    assert.equal(restored.getSnapshot().day.summary.profit, 150);
});

test('마감 자동 저장: 결산·누적 실적과 날짜 복원, 다음 날 준비도 별도 저장', () => {
    const storage = memoryStorage();
    const store = createGameStore(createSaveRepository(storage));
    stock(store); prepareShelves(store); store.startDay(); finishDay(store);
    const closed = store.getSnapshot();
    assert.equal(storage.writes, 2);
    assert.equal(decodeSave(storage.raw).state.checkpoint, 'closed');
    const restored = createGameStore(createSaveRepository(storage));
    assert.deepEqual(restored.getSnapshot().day.summary, closed.day.summary);
    assert.deepEqual(restored.getSnapshot().economy, closed.economy);
    assert.equal(restored.getSnapshot().visit, null);
    assert.equal(restored.getSnapshot().visitCount, 5);
    restored.nextDay();
    assert.equal(storage.writes, 3);
    const second = createGameStore(createSaveRepository(storage));
    assert.equal(second.getSnapshot().day.number, 2);
    assert.equal(second.getSnapshot().day.phase, 'preparing');
    assert.equal(second.getSnapshot().day.summary, null);
    assert.deepEqual(second.getSnapshot().economy, closed.economy);
    second.buy('sword');
    const notSaved = createGameStore(createSaveRepository(storage));
    assert.equal(notSaved.getSnapshot().economy.gold, 1150);
    assert.equal(storage.writes, 3);
});

test('남은 재고와 사용자 판매가 보존, 손해 판매의 음수 이익도 로드 가능', () => {
    const storage = memoryStorage();
    const store = createGameStore(createSaveRepository(storage));
    stock(store); store.buy('herb');
    for (const id of ['herb', 'potion', 'sword']) store.setPrice(id, 1);
    prepareShelves(store); store.startDay(); finishDay(store);
    const restored = createGameStore(createSaveRepository(storage));
    assert.equal(restored.getSnapshot().day.summary.profit, -235);
    assert.equal(restored.getSnapshot().economy.inventory.herb, 1);
    assert.deepEqual(restored.getSnapshot().economy.prices, { herb: 1, potion: 1, sword: 1, mushroom: 40, manaPotion: 90 });
    restored.nextDay();
    const another = createGameStore(createSaveRepository(storage));
    assert.equal(another.getSnapshot().economy.inventory.herb, 1);
    assert.equal(another.getSnapshot().economy.prices.sword, 1);
});

test('형식 버전, 숫자와 재고 정합성, 단계, 방문 수를 검증', () => {
    const store = createGameStore();
    stock(store);
    const raw = encodeSave(checkpoint(store));
    assert.equal(JSON.parse(raw).version, SAVE_VERSION);
    assert.equal(decodeSave(raw).ok, true);
    const variants = [
        value => { value.version = 99; },
        value => { value.version = '1'; },
        value => { delete value.version; },
        value => { value.state.day.phase = 'open'; },
        value => { value.state.day.number = -1; },
        value => { value.state.visitCount = 4; },
        value => { value.state.checkpoint = 'unknown'; },
        value => { value.state.economy.gold = -1; },
        value => { value.state.economy.gold = 1000; },
        value => { value.state.economy.inventory.herb = 1.5; },
        value => { value.state.economy.inventory.herb = Number.MAX_SAFE_INTEGER; },
        value => { delete value.state.economy.inventory.potion; },
        value => { value.state.economy.prices.herb = 0; },
        value => { value.state.economy.revenue = '0'; },
        value => { value.state.economy.unitsSold = 10; },
        value => { value.state.economy.purchaseSpend = null; },
        value => { value.state.day.baseline = {}; },
        value => { value.state.day.summary = {}; },
    ];
    for (const mutate of variants) {
        const value = JSON.parse(raw); mutate(value);
        assert.equal(decodeSave(JSON.stringify(value)).ok, false, mutate.toString());
    }
    for (const invalid of ['{', 'null', '[]', 'true', '"save"', '{}']) assert.equal(decodeSave(invalid).ok, false);
    prepareShelves(store); store.startDay();
    assert.throws(() => encodeSave(checkpoint(store)), /올바르지/);
});

test('마감 결산과 누적 실적의 불일치 거부, 검증되지 않은 추가 필드는 복원하지 않음', () => {
    const store = createGameStore();
    stock(store); prepareShelves(store); store.startDay(); finishDay(store);
    const raw = encodeSave(checkpoint(store, 'closed'));
    for (const change of [
        data => { data.day.summary.profit++; },
        data => { data.day.summary.buyers = 6; },
        data => { data.day.summary.day = 2; },
        data => { data.day.baseline.revenue = 99999; },
        data => { data.day.summary.visitors = 4; },
        data => { data.checkpoint = 'before-open'; },
    ]) {
        const value = JSON.parse(raw); change(value.state);
        assert.equal(decodeSave(JSON.stringify(value)).ok, false);
    }
    const value = JSON.parse(raw);
    value.state.extra = 'ignore'; value.state.economy.extra = 'ignore'; value.state.day.extra = 'ignore';
    const decoded = decodeSave(JSON.stringify(value));
    assert.equal(decoded.ok, true);
    assert.equal('extra' in decoded.state, false);
    assert.equal('extra' in decoded.state.economy, false);
    assert.equal('extra' in decoded.state.day, false);
});

for (const raw of ['{damaged', JSON.stringify({ version: 2, state: {} }), JSON.stringify({ version: 1, state: {} })]) {
    test(`손상·미지원 저장 보존: ${raw}`, () => {
        const storage = memoryStorage(raw);
        const store = createGameStore(createSaveRepository(storage));
        assert.equal(store.getSnapshot().saveInfo.status, 'blocked');
        stock(store); prepareShelves(store); store.startDay(); finishDay(store); store.nextDay();
        assert.equal(storage.raw, raw);
        assert.equal(storage.writes, 0);
        assert.equal(store.getSnapshot().day.number, 2);
        assert.equal(store.getSnapshot().saveInfo.status, 'blocked');
        assert.equal(store.newGame(), true); // 확인창에서 동의한 경우를 시뮬레이션한다.
        assert.notEqual(storage.raw, raw);
        assert.equal(decodeSave(storage.raw).state.checkpoint, 'new-game');
        assert.equal(store.getSnapshot().economy.gold, 1000);
        assert.equal(store.getSnapshot().day.number, 1);
    });
}

test('저장 용량 부족: 기존 저장 유지, 현재 게임 지속, 다음 체크포인트에서 재시도', () => {
    const storage = memoryStorage();
    const store = createGameStore(createSaveRepository(storage));
    stock(store); prepareShelves(store); store.startDay();
    const goodRaw = storage.raw;
    storage.failWrite = true;
    finishDay(store);
    assert.equal(store.getSnapshot().day.phase, 'closed');
    assert.equal(store.getSnapshot().economy.gold, 1150);
    assert.equal(store.getSnapshot().saveInfo.status, 'error');
    assert.equal(storage.raw, goodRaw);
    storage.failWrite = false;
    store.nextDay();
    assert.equal(store.getSnapshot().saveInfo.status, 'saved');
    const loaded = createGameStore(createSaveRepository(storage));
    assert.equal(loaded.getSnapshot().day.number, 2);
    assert.equal(loaded.getSnapshot().economy.gold, 1150);
});

test('접근 차단과 최초 저장 실패도 게임을 중단시키거나 기존 값을 지우지 않음', () => {
    const storage = memoryStorage('unreadable');
    storage.failRead = true;
    const store = createGameStore(createSaveRepository(storage));
    assert.equal(store.getSnapshot().saveInfo.status, 'error');
    prepareShelves(store); store.startDay(); finishDay(store);
    assert.equal(store.getSnapshot().day.phase, 'closed');
    assert.equal(storage.raw, 'unreadable');
    assert.equal(storage.writes, 0);
    const empty = memoryStorage(); empty.failWrite = true;
    const fresh = createGameStore(createSaveRepository(empty));
    prepareShelves(fresh); fresh.startDay();
    assert.equal(fresh.getSnapshot().day.phase, 'open');
    assert.equal(fresh.getSnapshot().saveInfo.status, 'error');
    assert.equal(empty.raw, null);
    assert.equal(createBrowserSaveRepository().load().kind, 'error'); // Node에는 window가 없다.
});

test('실행 중 다른 창이 바꾼 저장도 자동 덮어쓰기하지 않음', () => {
    const storage = memoryStorage();
    const first = createGameStore(createSaveRepository(storage));
    stock(first); prepareShelves(first); first.startDay();
    const second = createGameStore(createSaveRepository(storage));
    second.setPrice('herb', 40); prepareShelves(second); second.startDay();
    const otherRaw = storage.raw;
    finishDay(first);
    assert.equal(storage.raw, otherRaw);
    assert.equal(first.getSnapshot().saveInfo.status, 'blocked');
    const loaded = createGameStore(createSaveRepository(storage));
    assert.equal(loaded.getSnapshot().economy.prices.herb, 40);
});

test('새 게임 저장 실패는 진행·세션·기존 저장을 보존, 성공한 경우만 초기화', () => {
    const storage = memoryStorage();
    const store = createGameStore(createSaveRepository(storage));
    stock(store); prepareShelves(store); store.startDay(); finishOne(store);
    const before = store.getSnapshot(), raw = storage.raw;
    storage.failWrite = true;
    assert.equal(store.newGame(), false);
    assert.equal(store.getSnapshot().economy, before.economy);
    assert.equal(store.getSnapshot().day, before.day);
    assert.equal(store.getSnapshot().visit, before.visit);
    assert.equal(store.getSnapshot().session, before.session);
    assert.equal(storage.raw, raw);
    storage.failWrite = false;
    assert.equal(store.newGame(), true);
    const reset = store.getSnapshot();
    assert.equal(reset.economy.gold, 1000);
    assert.equal(reset.day.phase, 'preparing');
    assert.equal(reset.day.number, 1);
    assert.equal(reset.visit, null);
    assert.equal(reset.visitCount, 0);
    assert.equal(reset.session, before.session + 1);
    assert.equal(reset.saveInfo.status, 'saved');
    const loaded = createGameStore(createSaveRepository(storage));
    assert.equal(loaded.getSnapshot().economy.gold, 1000);
    assert.equal(loaded.getSnapshot().day.number, 1);
});

test('새 게임 전의 방문 콜백은 방문 번호가 같아도 새 게임에서 무시', () => {
    const store = createGameStore();
    store.buy('herb'); prepareShelves(store); store.startDay();
    const old = store.getSnapshot();
    store.newGame(); store.buy('herb'); prepareShelves(store); store.startDay();
    const fresh = store.getSnapshot();
    assert.equal(fresh.visit.id, old.visit.id);
    store.advanceVisit(old.visit.id, 'arrived', old.session);
    assert.equal(store.getSnapshot(), fresh);
    store.advanceVisit(fresh.visit.id, 'arrived', fresh.session);
    assert.equal(store.getSnapshot().visit.phase, 'browsing');
});

test('저장 연결은 초기화 시 한 번만 수행하고 진행 중 상태를 교체하지 않음', () => {
    const store = createGameStore();
    store.buy('herb');
    const before = store.getSnapshot();
    assert.equal(store.connectPersistence(createSaveRepository(memoryStorage())), false);
    assert.equal(store.getSnapshot(), before);
    const loaded = createGameStore(createSaveRepository(memoryStorage()));
    assert.equal(loaded.connectPersistence(createSaveRepository(memoryStorage())), false);
});
