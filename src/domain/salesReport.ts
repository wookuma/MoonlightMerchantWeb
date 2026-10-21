import { items } from './economy.ts';
import type { ItemId } from './economy.ts';
import type { Customer, CustomerVisit, VisitOutcome } from './customerVisit.ts';

export type DeclineReason = Extract<VisitOutcome, { kind: 'declined' }>['reason'];
export const declineReasons = ['stock', 'display', 'budget', 'price', 'transaction'] as const satisfies readonly DeclineReason[];
export const reasonLabels: Readonly<Record<DeclineReason, string>> = {
    stock: '품절', display: '미진열', budget: '예산 초과', price: '높은 가격', transaction: '거래 실패',
};
export type ReportVisit = Readonly<{ id: number; itemId: ItemId; result: 'purchased' | DeclineReason }>;
export type SalesReport = Readonly<{ plan: readonly ItemId[]; visits: readonly ReportVisit[] }>;

export function createSalesReport(plan: readonly Customer[]): SalesReport {
    return { plan: plan.map(customer => customer.itemId), visits: [] };
}

// 퇴장 완료 때만 기록한다. 같은 방문 번호와 계획 밖의 결과는 집계하지 않는다.
export function recordCompletedVisit(report: SalesReport, visit: CustomerVisit): SalesReport {
    if (visit.phase !== 'completed' || !visit.outcome || report.visits.some(entry => entry.id === visit.id)
        || report.plan[report.visits.length] !== visit.customer.itemId) return report;
    const result = visit.outcome.kind === 'purchased' ? 'purchased' : visit.outcome.reason;
    return { ...report, visits: [...report.visits, { id: visit.id, itemId: visit.customer.itemId, result }] };
}

export function reportRows(report: SalesReport) {
    return items.map(item => {
        const visits = report.visits.filter(visit => visit.itemId === item.id);
        const failures: Record<DeclineReason, number> = { stock: 0, display: 0, budget: 0, price: 0, transaction: 0 };
        for (const visit of visits) if (visit.result !== 'purchased') failures[visit.result]++;
        return {
            item, demand: report.plan.filter(id => id === item.id).length,
            sold: visits.filter(visit => visit.result === 'purchased').length,
            missed: visits.filter(visit => visit.result !== 'purchased').length, failures,
        };
    });
}

export function reportAdvice(report: SalesReport): readonly string[] {
    const rows = reportRows(report);
    const count = (reason: DeclineReason) => rows.reduce((sum, row) => sum + row.failures[reason], 0);
    const advice: string[] = [];
    if (count('stock')) advice.push('품절이 있었어요. 다음 날 예상 수요를 확인하고 매입·제작 수량을 준비해 보세요.');
    if (count('display')) advice.push('보관 재고가 있어도 진열되지 않으면 팔리지 않아요. 개점 전에 진열 수량을 확인해 주세요.');
    if (count('price') + count('budget')) advice.push('가격 때문에 돌아간 손님이 있어요. 판매가를 손님의 예산·적정가와 비교해 보세요.');
    if (count('transaction')) advice.push('완료하지 못한 거래가 있어요. 상품의 거래 정보를 확인해 주세요.');
    if (!advice.length) advice.push('오늘의 수요를 모두 충족했어요. 다음 날에도 바뀐 예상 수요에 맞춰 준비해 보세요.');
    return advice;
}
