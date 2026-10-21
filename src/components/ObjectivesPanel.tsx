import { useSyncExternalStore } from 'react';
import { claimedRewardGold, objectives } from '../domain/objectives';
import { gameStore } from '../stores/gameStore';

export function ObjectivesPanel() {
    const { economy, day } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    return <section className="objectives-panel" aria-labelledby="objectives-title">
        <div className="objectives-heading"><div><span className="eyebrow">YOUR FIRST STEPS</span><h2 id="objectives-title">상점 주인의 첫 목표</h2></div><span>수령한 보상 {claimedRewardGold(economy.objectives)}G</span></div>
        <div className="objective-cards">{objectives.map(goal => {
            const status = economy.objectives[goal.id];
            return <article key={goal.id}>
                <span className={`objective-status ${status}`}>{status === 'claimed' ? '수령 완료' : status === 'ready' ? '목표 달성 · 1/1' : '진행 중 · 0/1'}</span>
                <h3>{goal.title}</h3><p>{goal.description}</p>
                <button disabled={status !== 'ready' || day.phase === 'open'} onClick={() => gameStore.claimObjective(goal.id)}>{status === 'claimed' ? '보상 수령 완료' : `보상 받기 +${goal.reward}G`}</button>
            </article>;
        })}</div>
        <p className="panel-note">보상은 준비·마감 중 목표마다 한 번 수령합니다. 수령할 때 현재 준비 상태도 함께 저장하며 저장 실패 시 지급하지 않습니다. 보상은 상품 판매 이익과 별도입니다. 제작품을 먼저 진열하고, 회수·직접 판매할 때도 제작품부터 사용합니다.</p>
    </section>;
}
