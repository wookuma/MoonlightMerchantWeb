import type { EconomyState, Result } from './economy.ts';
import type { DaySummary } from './shopDay.ts';

export const objectives = [
    { id: 'firstDay', title: '첫 영업 마치기', description: '손님 수나 판매량과 관계없이 하루 영업을 마감하세요.', reward: 100 },
    { id: 'craftedSale', title: '직접 만든 물약 판매하기', description: '직접 제작한 체력·마나 물약을 진열해 손님에게 1개 판매하세요. 직접 판매는 제외합니다.', reward: 150 },
    { id: 'perfectDay', title: '모든 손님에게 판매하기', description: '하루 방문한 손님 전원에게 상품을 판매한 뒤 마감하세요.', reward: 200 },
] as const;
export type ObjectiveId = typeof objectives[number]['id'];
export type ObjectiveStatus = 'in-progress' | 'ready' | 'claimed';
export type ObjectiveProgress = Readonly<Record<ObjectiveId, ObjectiveStatus>>;
export const createObjectiveProgress = (): ObjectiveProgress => ({ firstDay: 'in-progress', craftedSale: 'in-progress', perfectDay: 'in-progress' });
export const claimedRewardGold = (progress: ObjectiveProgress) => objectives.reduce((sum, goal) => sum + (progress[goal.id] === 'claimed' ? goal.reward : 0), 0);

export function markObjective(state: EconomyState, id: ObjectiveId): EconomyState {
    return state.objectives[id] === 'in-progress' ? { ...state, objectives: { ...state.objectives, [id]: 'ready' } } : state;
}

export function completeDayObjectives(state: EconomyState, summary: DaySummary): EconomyState {
    let next = markObjective(state, 'firstDay');
    if (summary.visitors > 0 && summary.buyers === summary.visitors) next = markObjective(next, 'perfectDay');
    return next;
}

export function claimObjective(state: EconomyState, id: string): Result {
    const fail = (message: string): Result => ({ ok: false, state, message });
    const objective = objectives.find(goal => goal.id === id);
    if (!objective) return fail('등록되지 않은 목표입니다.');
    if (state.objectives[objective.id] === 'claimed') return fail('이미 수령한 보상입니다.');
    if (state.objectives[objective.id] !== 'ready') return fail('아직 달성하지 않은 목표입니다.');
    const gold = state.gold + objective.reward;
    if (!Number.isSafeInteger(gold) || gold < 0) return fail('보상 수령 가능한 골드 범위를 초과했습니다.');
    return { ok: true, state: { ...state, gold, objectives: { ...state.objectives, [objective.id]: 'claimed' } }, message: `${objective.title} 보상 수령 · +${objective.reward}G` };
}
