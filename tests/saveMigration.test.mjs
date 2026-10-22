import { expectedObjectiveMetadata } from './helpers/objectiveMetadata.mjs';
import { prepareShelves } from './helpers/shelves.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeSave, encodeSave, SAVE_VERSION } from '../src/services/save/saveData.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { createGameStore } from '../src/stores/gameStore.ts';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
function storage(raw) {
    return { raw, writes: 0, fail: false, getItem() { return this.raw; }, setItem(_key, value) { if (this.fail) throw new Error('quota'); this.writes++; this.raw = value; } };
}

for (const file of ['save-v1-preparing.json', 'save-v1-closed.json', 'save-v2-preparing.json', 'save-v2-closed.json', 'save-v3-preparing.json', 'save-v3-closed.json']) test(`실제 구버전 저장 호환: ${file}`, () => {
    const raw = fixture(file);
    const legacy = JSON.parse(raw);
    assert.ok(legacy.version >= 1 && legacy.version <= 3);
    const decoded = decodeSave(raw);
    assert.equal(decoded.ok, true);
    const costs = legacy.state.economy.inventoryCosts ?? { herb: legacy.state.economy.inventory.herb * 20, potion: legacy.state.economy.inventory.potion * 40, sword: legacy.state.economy.inventory.sword * 120 };
    assert.deepEqual(decoded.state.economy, { ...legacy.state.economy, ...expectedObjectiveMetadata(legacy.state.day), expansionLevel: 0, expansionSpend: 0, inventory: { ...legacy.state.economy.inventory, mushroom: 0, manaPotion: 0 }, prices: { ...legacy.state.economy.prices, mushroom: 40, manaPotion: 90 }, inventoryCosts: { ...costs, mushroom: 0, manaPotion: 0 }, displayed: { herb: legacy.state.economy.displayed?.herb ?? Math.min(3, legacy.state.economy.inventory.herb), potion: legacy.state.economy.displayed?.potion ?? Math.min(3, legacy.state.economy.inventory.potion), sword: legacy.state.economy.displayed?.sword ?? Math.min(3, legacy.state.economy.inventory.sword), mushroom: 0, manaPotion: 0 } });
    assert.deepEqual(decoded.state.day, { ...legacy.state.day, report: null, explorationUsed: 0 });
    assert.equal(decoded.state.visitCount, legacy.state.visitCount);
    assert.equal(decoded.state.checkpoint, legacy.state.checkpoint);
    const port = storage(raw);
    const store = createGameStore(createSaveRepository(port));
    assert.equal(store.getSnapshot().saveInfo.status, 'saved');
    assert.equal(port.raw, raw);
    assert.equal(port.writes, 0);
    if (store.getSnapshot().day.phase === 'closed') { store.nextDay(); } else { prepareShelves(store); store.startDay(); }
    assert.equal(port.writes, 1);
    assert.equal(JSON.parse(port.raw).version, SAVE_VERSION);
    assert.deepEqual(decodeSave(port.raw).state.economy, decoded.state.economy);
});

test('구버전 재고를 재료로 제작한 뒤 개점하면 원가를 보존한 새 저장 생성', () => {
    const port = storage(fixture('save-v1-preparing.json'));
    const store = createGameStore(createSaveRepository(port));
    store.setDisplay('herb', 1); store.craft('health-potion');
    assert.deepEqual(store.getSnapshot().economy.inventory, { herb: 1, potion: 3, sword: 1, mushroom: 0, manaPotion: 0 });
    assert.deepEqual(store.getSnapshot().economy.inventoryCosts, { herb: 20, potion: 120, sword: 120, mushroom: 0, manaPotion: 0 });
    assert.equal(store.getSnapshot().economy.gold, 740);
    assert.equal(port.writes, 0);
    prepareShelves(store); store.startDay();
    assert.equal(JSON.parse(port.raw).version, SAVE_VERSION);
    const restored = createGameStore(createSaveRepository(port));
    assert.deepEqual(restored.getSnapshot().economy, store.getSnapshot().economy);
    assert.equal(restored.getSnapshot().economy.prices.herb, 40);
});

test('구버전 변환 후 저장 실패 시 원본 버전 1 문자열 그대로 보존', () => {
    const raw = fixture('save-v1-preparing.json');
    const port = storage(raw); port.fail = true;
    const store = createGameStore(createSaveRepository(port));
    store.setDisplay('herb', 1); store.craft('health-potion'); prepareShelves(store); store.startDay();
    assert.equal(store.getSnapshot().saveInfo.status, 'error');
    assert.equal(port.raw, raw);
    assert.equal(port.writes, 0);
});

test('손상된 버전 1과 미래 버전은 호환으로 오인하지 않고 덮어쓰기 방지', () => {
    const bad = JSON.parse(fixture('save-v1-preparing.json'));
    bad.state.economy.inventory.herb++;
    for (const raw of [JSON.stringify(bad), JSON.stringify({ version: SAVE_VERSION + 1, state: {} })]) {
        const port = storage(raw);
        const store = createGameStore(createSaveRepository(port));
        assert.equal(store.getSnapshot().saveInfo.status, 'blocked');
        prepareShelves(store); store.startDay();
        assert.equal(port.raw, raw);
        assert.equal(port.writes, 0);
    }
});

test('버전 3의 재고 원가 누락·음수·소수·합계 불일치·빈 재고의 잔여 원가 거부', () => {
    const valid = decodeSave(fixture('save-v1-preparing.json')).state;
    const raw = encodeSave(valid);
    for (const mutate of [
        data => { delete data.economy.inventoryCosts; },
        data => { data.economy.inventoryCosts.herb = -1; },
        data => { data.economy.inventoryCosts.herb = 1.5; },
        data => { data.economy.inventoryCosts.herb++; },
        data => { data.economy.inventoryCosts.potion = '80'; },
        data => { data.economy.inventory.sword = 0; },
        data => { data.economy.inventoryCosts.herb = Number.MAX_SAFE_INTEGER; },
    ]) {
        const value = JSON.parse(raw); mutate(value.state);
        assert.equal(decodeSave(JSON.stringify(value)).ok, false);
    }
    assert.equal(SAVE_VERSION, 8);
});
