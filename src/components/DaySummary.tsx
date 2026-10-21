import { declineReasons, reasonLabels, reportAdvice, reportRows } from '../domain/salesReport';
import type { SalesReport } from '../domain/salesReport';
import type { DaySummary as Summary } from '../domain/shopDay';

const gold = (value: number) => value.toLocaleString('ko-KR');

export function DaySummary({ summary, report }: { summary: Summary; report: SalesReport | null }) {
    return <section className="day-summary" aria-labelledby="summary-title">
        <div className="summary-heading">
            <div><span className="eyebrow">A DAY WELL SPENT</span><h2 id="summary-title">{summary.day}일차 영업 결산</h2><p>오늘도 수고했어요. 장부를 살펴보고 다음 날을 준비해요.</p></div>
        </div>
        <dl className="summary-grid">
            <div><dt>방문 손님</dt><dd>{summary.visitors}<small> 명</small></dd></div>
            <div><dt>구매 손님</dt><dd>{summary.buyers}<small> 명</small></dd></div>
            <div><dt>오늘 매출</dt><dd>{gold(summary.revenue)}<small> G</small></dd></div>
            <div><dt>판매 원가</dt><dd>{gold(summary.costOfGoodsSold)}<small> G</small></dd></div>
            <div><dt>판매 이익</dt><dd className={summary.profit < 0 ? 'negative' : 'positive'}>{summary.profit > 0 ? '+' : ''}{gold(summary.profit)}<small> G</small></dd></div>
        </dl>
        {report ? <div className="sales-report">
            <h3>오늘 놓친 판매</h3>
            <div className="report-table-wrap"><table className="report-table">
                <caption>상품별 예상 수요와 판매 결과</caption>
                <thead><tr><th scope="col">상품</th><th scope="col">예상 수요</th><th scope="col">판매</th><th scope="col">놓친 판매와 이유</th></tr></thead>
                <tbody>{reportRows(report).map(row => <tr key={row.item.id}>
                    <th scope="row">{row.item.name}</th><td>{row.demand}개</td><td>{row.sold}개</td>
                    <td><strong>{row.missed}개</strong><span>{row.missed ? declineReasons.filter(reason => row.failures[reason] > 0).map(reason => `${reasonLabels[reason]} ${row.failures[reason]}명`).join(' · ') : '모두 판매'}</span></td>
                </tr>)}</tbody>
            </table></div>
            <div className="report-advice"><h3>다음 날 준비 메모</h3><ul>{reportAdvice(report).map(message => <li key={message}>{message}</li>)}</ul></div>
        </div> : <p className="summary-note">이전 버전의 결산에는 상품별 상세 기록이 없습니다. 다음 영업부터 놓친 판매와 이유를 기록합니다.</p>}
        <p className="summary-note">이익 = 오늘 매출 − 오늘 판매된 상품의 매입 원가. 팔리지 않은 재고는 다음 날로 넘어갑니다.</p>
    </section>;
}
