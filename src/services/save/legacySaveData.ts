import { items } from './legacyCatalogue.ts';
import { dailyCustomers, expansionStage } from '../../domain/shopExpansion.ts';
import { DISPLAY_LIMIT } from '../../domain/display.ts';
import type { EconomyState } from './legacyCatalogue.ts';
import { declineReasons } from '../../domain/salesReport.ts';
import type { SalesReport } from '../../domain/salesReport.ts';
import { CUSTOMERS_PER_DAY } from '../../domain/shopDay.ts';
import { getDayPlan } from './legacyCatalogue.ts';
import type { DaySummary, ShopDay } from '../../domain/shopDay.ts';

export const SAVE_VERSION = 5;
export type SavePoint = 'before-open' | 'closed' | 'next-day' | 'new-game';
export type SavedState = Readonly<{ economy: EconomyState; day: ShopDay; visitCount: number; checkpoint: SavePoint }>;
export type DecodeResult = { ok: true; state: SavedState } | { ok: false; message: string };
type DisplayEconomy = Omit<EconomyState, 'expansionLevel' | 'expansionSpend'>;
type CostEconomy = Omit<DisplayEconomy, 'displayed'>;
type LegacyEconomy = Omit<CostEconomy, 'inventoryCosts'>;

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const natural = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => natural(value) && value > 0;

function commonEconomy(value: unknown, expanded = false): value is LegacyEconomy {
    if (!object(value) || !object(value.inventory) || !object(value.prices)) return false;
    const inventory = value.inventory, prices = value.prices;
    if (!items.every(item => natural(inventory[item.id]) && positive(prices[item.id]))) return false;
    if (!natural(value.gold) || !natural(value.purchaseSpend) || !natural(value.revenue) || !natural(value.costOfGoodsSold) || !natural(value.unitsSold)) return false;
    const spend = expanded ? value.expansionSpend : 0;
    if (!natural(spend) || value.gold !== 1000 - value.purchaseSpend - spend + value.revenue) return false;
    return value.unitsSold === 0 ? value.revenue === 0 && value.costOfGoodsSold === 0 : value.revenue >= value.unitsSold && value.costOfGoodsSold >= value.unitsSold;
}

function legacyEconomy(value: unknown): value is LegacyEconomy {
    if (!commonEconomy(value)) return false;
    const stockCost = items.reduce((sum, item) => sum + value.inventory[item.id] * item.buyPrice, 0);
    return natural(stockCost) && natural(stockCost + value.costOfGoodsSold)
        && value.purchaseSpend === stockCost + value.costOfGoodsSold
        && value.costOfGoodsSold % 20 === 0 && value.unitsSold <= value.costOfGoodsSold / 20 && value.unitsSold >= value.costOfGoodsSold / 120;
}

function costEconomy(value: unknown, expanded = false): value is CostEconomy {
    if (!object(value)) return false;
    const costs = value.inventoryCosts;
    if (!commonEconomy(value, expanded) || !object(costs)) return false;
    if (!items.every(item => natural(costs[item.id]) && (value.inventory[item.id] === 0 ? costs[item.id] === 0 : Number(costs[item.id]) >= value.inventory[item.id]))) return false;
    const stockCost = items.reduce((sum, item) => sum + Number(costs[item.id]), 0);
    return natural(stockCost) && natural(stockCost + value.costOfGoodsSold) && value.purchaseSpend === stockCost + value.costOfGoodsSold;
}

function displayEconomy(value: unknown): value is DisplayEconomy {
    if (!object(value)) return false;
    const displayed = value.displayed;
    return costEconomy(value) && object(displayed) && items.every(item => natural(displayed[item.id])
        && Number(displayed[item.id]) <= DISPLAY_LIMIT && Number(displayed[item.id]) <= value.inventory[item.id]);
}

function isEconomy(value: unknown): value is EconomyState {
    if (!object(value) || !natural(value.expansionLevel)) return false;
    const stage = expansionStage(value.expansionLevel);
    if (!stage || value.expansionSpend !== stage.totalCost) return false;
    const displayed = value.displayed;
    return costEconomy(value, true) && object(displayed) && items.every(item => natural(displayed[item.id])
        && Number(displayed[item.id]) <= stage.capacity && Number(displayed[item.id]) <= value.inventory[item.id]);
}

function migrateDisplay(economy: CostEconomy): DisplayEconomy {
    return { ...economy, displayed: {
        herb: Math.min(DISPLAY_LIMIT, economy.inventory.herb),
        potion: Math.min(DISPLAY_LIMIT, economy.inventory.potion),
        sword: Math.min(DISPLAY_LIMIT, economy.inventory.sword),
    } };
}

function isTotals(value: unknown, legacy: boolean): value is Pick<EconomyState, 'revenue' | 'costOfGoodsSold' | 'unitsSold'> {
    if (!object(value) || !natural(value.revenue) || !natural(value.costOfGoodsSold) || !natural(value.unitsSold)) return false;
    if (value.unitsSold === 0 && (value.revenue !== 0 || value.costOfGoodsSold !== 0)) return false;
    if (value.revenue < value.unitsSold || value.costOfGoodsSold < value.unitsSold) return false;
    return !legacy || (value.costOfGoodsSold % 20 === 0 && value.unitsSold <= value.costOfGoodsSold / 20 && value.unitsSold >= value.costOfGoodsSold / 120);
}

function isSummary(value: unknown): value is DaySummary {
    return object(value) && positive(value.day) && natural(value.visitors) && natural(value.buyers)
        && natural(value.revenue) && natural(value.costOfGoodsSold)
        && typeof value.profit === 'number' && Number.isSafeInteger(value.profit);
}

function validDay(value: Record<string, unknown>, economy: LegacyEconomy, legacy = false, limit: number = CUSTOMERS_PER_DAY, expanded = false): boolean {
    if (!object(value.day) || !natural(value.visitCount)) return false;
    const { day, visitCount } = value;
    if (!positive(day.number) || !Number.isSafeInteger(day.number * limit)) return false;
    // Past days can have used smaller stages. Every stage adds two visitors.
    const completedDays = day.number - 1;
    const priorVisits = day.phase === 'closed' ? visitCount - limit : visitCount;
    const validHistory = expanded
        ? priorVisits >= completedDays * CUSTOMERS_PER_DAY && priorVisits <= completedDays * limit
            && (priorVisits - completedDays * CUSTOMERS_PER_DAY) % 2 === 0
        : priorVisits === completedDays * CUSTOMERS_PER_DAY;
    if (!validHistory) return false;
    if (day.phase === 'preparing') {
        const checkpoint = value.checkpoint === 'before-open' || value.checkpoint === 'next-day' || value.checkpoint === 'new-game';
        return checkpoint && day.completedVisits === 0 && day.baseline === null && day.summary === null;
    }
    if (day.phase !== 'closed' || value.checkpoint !== 'closed' || day.completedVisits !== limit) return false;
    if (!isTotals(day.baseline, legacy) || !isSummary(day.summary)) return false;
    const baseline = day.baseline, summary = day.summary;
    if (baseline.revenue > economy.revenue || baseline.costOfGoodsSold > economy.costOfGoodsSold || baseline.unitsSold > economy.unitsSold) return false;
    const consistent = summary.day === day.number && summary.visitors === limit && summary.buyers <= limit
        && summary.buyers === economy.unitsSold - baseline.unitsSold
        && summary.revenue === economy.revenue - baseline.revenue
        && summary.costOfGoodsSold === economy.costOfGoodsSold - baseline.costOfGoodsSold
        && summary.profit === summary.revenue - summary.costOfGoodsSold
        && (summary.buyers === 0 ? summary.revenue === 0 && summary.costOfGoodsSold === 0 : summary.revenue >= summary.buyers && summary.costOfGoodsSold >= summary.buyers);
    return consistent && (!legacy || (summary.costOfGoodsSold >= summary.buyers * 20 && summary.costOfGoodsSold <= summary.buyers * 120));
}

function validReport(value: Record<string, unknown>, limit: number): boolean {
    if (!object(value.day)) return false;
    const day = value.day;
    if (day.phase === 'preparing') return day.report === null;
    if (day.report === null) return true; // 구버전 마감은 상세 기록을 추정하지 않는다.
    if (!object(day.report) || !Array.isArray(day.report.plan) || !Array.isArray(day.report.visits) || !object(day.summary)) return false;
    const { plan, visits } = day.report;
    if (plan.length !== limit || visits.length !== limit || !natural(value.visitCount) || !positive(day.number)) return false;
    const expected = getDayPlan(day.number, limit);
    if (!plan.every((id, index) => id === expected[index].itemId)) return false;
    const firstVisit = value.visitCount - limit + 1;
    let buyers = 0;
    for (let index = 0; index < visits.length; index++) {
        const visit: unknown = visits[index];
        if (!object(visit) || visit.id !== firstVisit + index || visit.itemId !== plan[index]) return false;
        if (visit.result === 'purchased') buyers++;
        else if (!declineReasons.some(reason => reason === visit.result)) return false;
    }
    return buyers === day.summary.buyers;
}

function isSavedState(value: unknown): value is SavedState {
    return object(value) && isEconomy(value.economy)
        && validDay(value, value.economy, false, dailyCustomers(value.economy), true)
        && validReport(value, dailyCustomers(value.economy));
}

function migrateReport(state: Record<string, unknown>) {
    return { ...state, day: object(state.day) ? { ...state.day, report: null } : null };
}

function copyReport(report: SalesReport | null): SalesReport | null {
    return report ? { plan: [...report.plan], visits: report.visits.map(visit => ({ id: visit.id, itemId: visit.itemId, result: visit.result })) } : null;
}

// 검증한 필드만 복사한다. 실행 중인 손님·타이머와 모르는 필드는 복원하지 않는다.
function copyState(state: SavedState): SavedState {
    const e = state.economy, day = state.day;
    return {
        checkpoint: state.checkpoint, visitCount: state.visitCount,
        economy: {
            expansionLevel: e.expansionLevel, expansionSpend: e.expansionSpend,
            gold: e.gold, purchaseSpend: e.purchaseSpend, revenue: e.revenue, costOfGoodsSold: e.costOfGoodsSold, unitsSold: e.unitsSold,
            inventory: { herb: e.inventory.herb, potion: e.inventory.potion, sword: e.inventory.sword },
            displayed: { herb: e.displayed.herb, potion: e.displayed.potion, sword: e.displayed.sword },
            inventoryCosts: { herb: e.inventoryCosts.herb, potion: e.inventoryCosts.potion, sword: e.inventoryCosts.sword },
            prices: { herb: e.prices.herb, potion: e.prices.potion, sword: e.prices.sword },
        },
        day: {
            number: day.number, phase: day.phase, completedVisits: day.completedVisits, report: copyReport(day.report),
            baseline: day.baseline ? { revenue: day.baseline.revenue, costOfGoodsSold: day.baseline.costOfGoodsSold, unitsSold: day.baseline.unitsSold } : null,
            summary: day.summary ? {
                day: day.summary.day, visitors: day.summary.visitors, buyers: day.summary.buyers, revenue: day.summary.revenue,
                costOfGoodsSold: day.summary.costOfGoodsSold, profit: day.summary.profit,
            } : null,
        },
    };
}

export function encodeSave(state: SavedState): string {
    if (!isSavedState(state)) throw new Error('저장할 게임 상태가 올바르지 않습니다.');
    return JSON.stringify({ version: SAVE_VERSION, state: copyState(state) });
}

export function decodeSave(raw: string): DecodeResult {
    const invalid = (): DecodeResult => ({ ok: false, message: '저장 데이터의 형식이나 수치가 올바르지 않습니다.' });
    try {
        const value: unknown = JSON.parse(raw);
        if (!object(value)) return invalid();
        if (value.version !== undefined && value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== SAVE_VERSION) {
            return { ok: false, message: '지원하지 않는 버전의 저장 데이터입니다.' };
        }
        if (value.version === 1) {
            // 구버전 규칙으로 먼저 검증한다. 읽기만으로 저장소를 변경하지 않는다.
            const state = value.state;
            if (!object(state) || !legacyEconomy(state.economy) || !validDay(state, state.economy, true)) return invalid();
            const economy = state.economy;
            const migrated = { ...state, economy: { ...migrateDisplay({ ...economy, inventoryCosts: {
                herb: economy.inventory.herb * 20, potion: economy.inventory.potion * 40, sword: economy.inventory.sword * 120,
            } }), expansionLevel: 0, expansionSpend: 0 } };
            const upgraded = migrateReport(migrated);
            if (!isSavedState(upgraded)) return invalid();
            return { ok: true, state: copyState(upgraded) };
        }
        if (value.version === 2) {
            const state = value.state;
            if (!object(state) || !costEconomy(state.economy) || !validDay(state, state.economy)) return invalid();
            const migrated = { ...state, economy: { ...migrateDisplay(state.economy), expansionLevel: 0, expansionSpend: 0 } };
            const upgraded = migrateReport(migrated);
            if (!isSavedState(upgraded)) return invalid();
            return { ok: true, state: copyState(upgraded) };
        }
        if (value.version === 3) {
            const state = value.state;
            if (!object(state) || !displayEconomy(state.economy) || !validDay(state, state.economy)) return invalid();
            const migrated = { ...state, economy: { ...state.economy, expansionLevel: 0, expansionSpend: 0 } };
            const upgraded = migrateReport(migrated);
            if (!isSavedState(upgraded)) return invalid();
            return { ok: true, state: copyState(upgraded) };
        }
        if (value.version === 4) {
            const state = value.state;
            if (!object(state) || !isEconomy(state.economy) || !validDay(state, state.economy, false, dailyCustomers(state.economy), true)) return invalid();
            const upgraded = migrateReport(state);
            if (!isSavedState(upgraded)) return invalid();
            return { ok: true, state: copyState(upgraded) };
        }
        if (value.version !== SAVE_VERSION || !isSavedState(value.state)) return invalid();
        return { ok: true, state: copyState(value.state) };
    } catch {
        return { ok: false, message: '저장 데이터를 읽을 수 없습니다.' };
    }
}

export function checkpointLabel(state: SavedState) {
    const labels = { 'before-open': '개점 직전', closed: '마감', 'next-day': '준비 시작', 'new-game': '새 게임' };
    return `${state.day.number}일차 ${labels[state.checkpoint]}`;
}
