import type { EconomyState } from './economy.ts';
import { getShopEvent } from './shopEvent.ts';
import { dailyCustomers } from './shopExpansion.ts';
import { customers } from './customerVisit.ts';
import { createSalesReport, recordCompletedVisit } from './salesReport.ts';
import type { SalesReport } from './salesReport.ts';
import type { CustomerVisit } from './customerVisit.ts';
import type { Customer } from './customerVisit.ts';

export const CUSTOMERS_PER_DAY = 5;
export type DaySummary = Readonly<{
    day: number; visitors: number; buyers: number;
    revenue: number; costOfGoodsSold: number; profit: number;
}>;
export type ShopDay = Readonly<{
    number: number;
    phase: 'preparing' | 'open' | 'closed';
    completedVisits: number;
    baseline: Pick<EconomyState, 'revenue' | 'costOfGoodsSold' | 'unitsSold'> | null;
    summary: DaySummary | null;
    report: SalesReport | null;
}>;

export function createDay(number = 1): ShopDay {
    if (!Number.isSafeInteger(number) || number < 1) throw new RangeError('날짜는 1 이상의 안전한 정수여야 합니다.');
    return { number, phase: 'preparing', completedVisits: 0, baseline: null, summary: null, report: null };
}

export function openDay(day: ShopDay, economy: EconomyState): ShopDay {
    if (day.phase !== 'preparing') return day;
    const { revenue, costOfGoodsSold, unitsSold } = economy;
    return { ...day, phase: 'open', report: createSalesReport(getDayPlan(day.number, dailyCustomers(economy))), baseline: { revenue, costOfGoodsSold, unitsSold } };
}

export function getDayStats(day: ShopDay, economy: EconomyState): DaySummary {
    if (day.summary) return day.summary;
    const revenue = day.baseline ? economy.revenue - day.baseline.revenue : 0;
    const costOfGoodsSold = day.baseline ? economy.costOfGoodsSold - day.baseline.costOfGoodsSold : 0;
    return {
        day: day.number, visitors: day.completedVisits,
        buyers: day.baseline ? economy.unitsSold - day.baseline.unitsSold : 0,
        revenue, costOfGoodsSold, profit: revenue - costOfGoodsSold,
    };
}

export function finishCustomer(day: ShopDay, economy: EconomyState, visit?: CustomerVisit): ShopDay {
    const limit = dailyCustomers(economy);
    if (day.phase !== 'open' || day.completedVisits >= limit) return day;
    const report = day.report && visit ? recordCompletedVisit(day.report, visit) : null;
    if (day.report && visit && report === day.report) return day;
    const updated = { ...day, report, completedVisits: day.completedVisits + 1 };
    if (updated.completedVisits < limit) return updated;
    return { ...updated, phase: 'closed', summary: getDayStats(updated, economy) };
}

export function prepareNextDay(day: ShopDay): ShopDay {
    return day.phase === 'closed' ? createDay(day.number + 1) : day;
}

// 날짜·손님 수가 같으면 수요와 순서도 같다. 시계·Math.random·누적 방문 수에 의존하지 않는다.
export function getDayPlan(dayNumber = 1, limit: number = CUSTOMERS_PER_DAY): readonly Customer[] {
    if (!Number.isSafeInteger(dayNumber) || dayNumber < 1) throw new RangeError('날짜는 1 이상의 안전한 정수여야 합니다.');
    if (limit !== 5 && limit !== 7 && limit !== 9) throw new RangeError('하루 손님 수는 5·7·9명이어야 합니다.');
    // 첫날은 기본 상품을 차례로 경험하는 균형 구성이다.
    if (dayNumber === 1) return Array.from({ length: limit }, (_, index) => customers[index % 3]);

    // 하루에는 3종의 수요가 집중된다. 2일차부터 새 재료·물약도 순환에 들어온다.
    const start = (dayNumber - 2) % customers.length;
    const pool = [customers[start], customers[(start + 3) % customers.length], customers[(start + 4) % customers.length]];

    let seed = dayNumber % 0x100000000;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
    const event = getShopEvent(dayNumber);
    const plan: Customer[] = [];
    if (event.id === 'market') {
        const featured = (dayNumber - 2) % pool.length;
        const extra = limit - pool.length;
        const focused = Math.ceil(extra * 0.6);
        plan.push(...pool);
        for (let i = 0; i < focused; i++) plan.push(pool[featured]);
        for (let i = focused; i < extra; i++) plan.push(pool[(featured + 1 + Math.floor(random() * 2)) % pool.length]);
    } else {
        // 대표 상품 두 종류에 수요를 고르게 배분하고 보조 상품 손님 한 명을 더한다.
        for (const id of event.featured) {
            const customer = customers.find(customer => customer.itemId === id)!;
            for (let i = 0; i < (limit - 1) / 2; i++) plan.push(customer);
        }
        plan.push(customers.find(customer => customer.itemId === event.supporting)!);
    }
    // 방문 순서는 날짜로 결정한 난수로 섞고, 예고와 실제 방문이 이 배열을 공유한다.
    for (let i = plan.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [plan[i], plan[j]] = [plan[j], plan[i]];
    }
    return plan;
}
