import { claimObjective, completeDayObjectives } from '../domain/objectives.ts';
import { createInitialState, setSalePrice, trade } from '../domain/economy.ts';
import { dailyCustomers } from '../domain/shopExpansion.ts';
import { expandShop } from '../domain/shopExpansion.ts';
import { craft } from '../domain/crafting.ts';
import { setDisplayQuantity } from '../domain/display.ts';
import type { EconomyState, ItemId, Result } from '../domain/economy.ts';
import { advanceVisit, createVisit } from '../domain/customerVisit.ts';
import type { CustomerVisit, VisitEvent } from '../domain/customerVisit.ts';
import { createDay, finishCustomer, getDayPlan, openDay, prepareNextDay } from '../domain/shopDay.ts';
import type { ShopDay } from '../domain/shopDay.ts';
import { checkpointLabel } from '../services/save/saveData.ts';
import type { SavedState, SavePoint } from '../services/save/saveData.ts';
import type { SaveFeedback, SaveRepository } from '../services/save/saveRepository.ts';

type Snapshot = Readonly<{
    economy: EconomyState; visit: CustomerVisit | null; visitCount: number; day: ShopDay;
    message: string; success: boolean; revision: number; session: number; saveInfo: SaveFeedback;
}>;

function initialSnapshot(): Snapshot {
    return {
        economy: createInitialState(), visit: null, visitCount: 0, day: createDay(),
        message: '상품을 준비하고 영업 시작을 눌러보세요. 오늘은 손님 5명이 찾아옵니다.', success: true, revision: 0, session: 0,
        saveInfo: { status: 'unsaved', message: '첫 자동 저장 전입니다. 개점 직전·마감·다음 날 준비 시 저장합니다.' },
    };
}

function checkpoint(state: Pick<Snapshot, 'economy' | 'day' | 'visitCount'>, point: SavePoint): SavedState {
    return { economy: state.economy, day: state.day, visitCount: state.visitCount, checkpoint: point };
}

export function createGameStore(initialRepository?: SaveRepository) {
    let snapshot = initialSnapshot();
    let repository: SaveRepository | undefined;
    const listeners = new Set<() => void>();
    function publish(patch: Partial<Snapshot>) {
        snapshot = { ...snapshot, ...patch, revision: snapshot.revision + 1 };
        listeners.forEach(listener => listener());
    }
    function persist(state: Pick<Snapshot, 'economy' | 'day' | 'visitCount'>, point: SavePoint): SaveFeedback {
        return repository?.save(checkpoint(state, point)) ?? snapshot.saveInfo;
    }
    function apply(result: Result) {
        publish({ economy: result.state, message: result.message, success: result.ok });
    }
    function canPrepare() {
        if (snapshot.day.phase === 'preparing') return true;
        publish({ message: '매입과 직접 판매는 영업 준비 시간에만 가능합니다.', success: false });
        return false;
    }
    const store = {
        getSnapshot: () => snapshot,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        buy(id: ItemId, quantity = 1) {
            if (canPrepare()) apply(trade(snapshot.economy, 'buy', id, quantity));
        },
        sell(id: ItemId, quantity = 1) {
            if (canPrepare()) apply(trade(snapshot.economy, 'sell', id, quantity));
        },
        claimObjective(id: string) {
            if (snapshot.day.phase === 'open') {
                publish({ message: '보상은 영업 준비 또는 마감 시간에 수령해 주세요.', success: false });
                return;
            }
            const result = claimObjective(snapshot.economy, id);
            if (!result.ok) { apply(result); return; }
            const saveInfo = persist({ economy: result.state, day: snapshot.day, visitCount: snapshot.visitCount }, snapshot.day.phase === 'closed' ? 'closed' : 'before-open');
            if (repository && saveInfo.status !== 'saved') {
                publish({ saveInfo, message: '보상을 저장하지 못해 골드와 수령 상태를 유지했습니다. 저장 상태를 확인한 뒤 다시 수령해 주세요.', success: false });
                return;
            }
            publish({ economy: result.state, saveInfo, message: result.message, success: true });
        },
        expandShop() {
            if (snapshot.day.phase !== 'preparing') {
                publish({ message: '진열대 확장은 영업 준비 시간에만 가능합니다.', success: false });
                return;
            }
            apply(expandShop(snapshot.economy));
        },
        setDisplay(id: ItemId, quantity: number) {
            if (snapshot.day.phase !== 'preparing') {
                publish({ message: '진열과 회수는 영업 준비 시간에만 가능합니다.', success: false });
                return;
            }
            apply(setDisplayQuantity(snapshot.economy, id, quantity));
        },
        adjustDisplay(id: ItemId, delta: number) {
            if (delta !== 1 && delta !== -1) {
                publish({ message: '진열 수량은 한 개씩 조정해 주세요.', success: false });
                return;
            }
            store.setDisplay(id, snapshot.economy.displayed[id] + delta);
        },
        craft(recipeId: string, batches = 1) {
            if (snapshot.day.phase !== 'preparing') {
                publish({ message: '제작은 영업 준비 시간에만 가능합니다.', success: false });
                return;
            }
            apply(craft(snapshot.economy, recipeId, batches));
        },
        setPrice(id: ItemId, price: number) {
            if (snapshot.day.phase === 'closed') {
                publish({ message: '다음 날 준비를 시작한 뒤 가격을 변경해 주세요.', success: false });
                return;
            }
            apply(setSalePrice(snapshot.economy, id, price));
        },
        startDay() {
            if (snapshot.day.phase !== 'preparing') return;
            const saveInfo = persist(snapshot, 'before-open');
            const day = openDay(snapshot.day, snapshot.economy);
            const plan = getDayPlan(day.number, dailyCustomers(snapshot.economy));
            const visit = createVisit(snapshot.visitCount + 1, plan[day.completedVisits]);
            publish({ day, visit, visitCount: visit.id, saveInfo, message: `${day.number}일차 영업 시작! ${visit.customer.name} 님이 입장합니다.`, success: true });
        },
        advanceVisit(id: number, event: VisitEvent, session = snapshot.session) {
            if (session !== snapshot.session) return;
            if (snapshot.day.phase !== 'open' || !snapshot.visit) return;
            const next = advanceVisit(snapshot.economy, snapshot.visit, id, event);
            if (next.visit === snapshot.visit) return;
            if (next.visit.phase === 'completed') {
                const day = finishCustomer(snapshot.day, next.economy, next.visit);
                if (day.phase === 'closed') {
                    const economy = completeDayObjectives(next.economy, day.summary!);
                    const saveInfo = persist({ economy, day, visitCount: snapshot.visitCount }, 'closed');
                    publish({ economy, day, visit: next.visit, saveInfo, message: `${day.number}일차 영업이 끝났습니다. 오늘의 결산을 확인하세요.`, success: true });
                } else {
                    const plan = getDayPlan(day.number, dailyCustomers(snapshot.economy));
                    const visit = createVisit(snapshot.visitCount + 1, plan[day.completedVisits]);
                    publish({ economy: next.economy, day, visit, visitCount: visit.id, message: `${visit.customer.name} 님이 상점에 들어옵니다.`, success: true });
                }
                return;
            }
            const message = next.visit.outcome?.message ?? `${next.visit.customer.name} 님이 상품을 살펴봅니다.`;
            publish({ economy: next.economy, visit: next.visit, message, success: next.visit.outcome?.kind !== 'declined' });
        },
        nextDay() {
            if (snapshot.day.phase !== 'closed') return;
            const day = prepareNextDay(snapshot.day);
            const saveInfo = persist({ economy: snapshot.economy, day, visitCount: snapshot.visitCount }, 'next-day');
            publish({ day, visit: null, saveInfo, message: `${day.number}일차 준비를 시작합니다. 남은 골드와 재고는 그대로예요.`, success: true });
        },
        // React/Phaser를 마운트하기 전에 한 번 연결한다. 진행 중인 상태를 로드로 교체하지 않는다.
        connectPersistence(adapter: SaveRepository) {
            if (repository || snapshot.revision !== 0 || listeners.size !== 0) return false;
            repository = adapter;
            const loaded = adapter.load();
            if (loaded.kind === 'loaded') {
                snapshot = {
                    ...snapshot, economy: loaded.state.economy, day: loaded.state.day, visitCount: loaded.state.visitCount,
                    visit: null, message: `${checkpointLabel(loaded.state)} 시점부터 이어합니다.`,
                    saveInfo: { status: 'saved', message: `${checkpointLabel(loaded.state)} 저장을 불러왔습니다.` },
                };
            } else if (loaded.kind === 'error' || loaded.kind === 'blocked') {
                snapshot = { ...snapshot, message: '저장 데이터를 불러오지 못해 임시 게임으로 시작합니다. 기존 저장은 보존합니다.', saveInfo: { status: loaded.kind, message: loaded.message } };
            }
            return true;
        },
        // UI 확인창에서 동의한 후에만 호출한다. 저장 실패 시 기존 진행도 유지한다.
        newGame() {
            const fresh = initialSnapshot();
            const saveInfo = repository?.reset(checkpoint(fresh, 'new-game')) ?? fresh.saveInfo;
            if (repository && saveInfo.status !== 'saved') {
                publish({ saveInfo });
                return false;
            }
            publish({ ...fresh, session: snapshot.session + 1, saveInfo, message: '새 게임을 시작합니다. 1일차 상점을 준비해 보세요.' });
            return true;
        },
    };
    if (initialRepository) store.connectPersistence(initialRepository);
    return store;
}

export const gameStore = createGameStore();
