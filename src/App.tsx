import { useEffect, useRef, useSyncExternalStore } from 'react';
import { PhaserGame } from './PhaserGame';
import { GameModal } from './components/GameModal';
import { ShopPanel } from './components/ShopPanel';
import { CraftingPanel } from './components/CraftingPanel';
import { PreparationPanel } from './components/PreparationPanel';
import { CustomerPanel } from './components/CustomerPanel';
import { ObjectivesPanel } from './components/ObjectivesPanel';
import { ExpansionPanel } from './components/ExpansionPanel';
import { LedgerPanel } from './components/LedgerPanel';
import { SaveControls } from './components/SaveControls';
import { dailyCustomers } from './domain/shopExpansion';
import { getShopEvent } from './domain/shopEvent';
import { objectives } from './domain/objectives';
import { gameStore } from './stores/gameStore';
import { dockMenus, gameMenus, gameUiStore } from './stores/gameUiStore';

const dockLabels = { goods: '상품 관리', craft: '제작', prepare: '영업 준비', quests: '퀘스트', upgrade: '상점 확장', ledger: '장부' };

export default function App() {
    const { economy, day, visit, message, success, session, saveInfo } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const { menu } = useSyncExternalStore(gameUiStore.subscribe, gameUiStore.getSnapshot);
    const previous = useRef({ phase: day.phase, session });
    const lastSession = useRef(session);
    const event = getShopEvent(day.number);
    const limit = dailyCustomers(economy);
    const rewards = objectives.filter(goal => economy.objectives[goal.id] === 'ready').length;
    const saveFailed = saveInfo.status === 'error' || saveInfo.status === 'blocked';
    useEffect(() => {
        if (lastSession.current !== session) { lastSession.current = session; gameUiStore.close(); }
        if (previous.current.session === session && previous.current.phase === 'open' && day.phase === 'closed') gameUiStore.open('ledger');
        previous.current = { phase: day.phase, session };
    }, [day.phase, session]);
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || gameUiStore.getSnapshot().menu !== null) return;
            const target = event.target;
            if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, dialog'))) return;
            const index = Number(event.key) - 1;
            if (Number.isInteger(index) && index >= 0 && index < dockMenus.length) { event.preventDefault(); gameUiStore.open(dockMenus[index]); }
        };
        document.addEventListener('keydown', handleKey);
        return () => { document.removeEventListener('keydown', handleKey); };
    }, []);
    const statusTitle = day.phase === 'open' && visit ? `${visit.customer.name} · 손님 ${day.completedVisits + 1}/${limit}` : day.phase === 'closed' ? `${day.number}일차 영업이 끝났어요` : `${day.number}일차 · 손님 맞이 준비`;
    const statusText = day.phase === 'open' && visit ? visit.outcome?.message ?? visit.customer.request : day.phase === 'closed' ? '장부에서 결산을 확인하고 다음 날을 준비해요.' : '상품 매입 → 진열·가격 설정 → 준비 확인 후 영업을 시작해요.';
    return <main className="game-viewport"><div className="game-shell">
        <header className="shell-topbar">
            <div className="shell-brand"><span aria-hidden="true">☾</span><div><strong>Moonlight Merchant</strong><small>달빛 잡화점</small></div></div>
            <div className="shell-hud"><span>{day.number}일차 · {day.phase === 'open' ? '영업 중' : day.phase === 'closed' ? '영업 마감' : '영업 준비'}</span><strong className="shell-gold">{economy.gold.toLocaleString('ko-KR')} <small>G</small></strong><button className={`shell-icon-button ${saveFailed ? 'save-warning' : ''}`} aria-label={saveFailed ? '게임 메뉴 · 저장 상태 확인 필요' : '게임 메뉴'} title={saveInfo.message} onClick={() => gameUiStore.open('settings')}>☰{saveFailed && <i aria-hidden="true">!</i>}</button></div>
        </header>
        <section className="game-stage" aria-label="달빛 잡화점 게임 화면">
            <div className="game-canvas"><PhaserGame /></div>
            {day.phase !== 'closed' && <button className={`stage-event ${event.id}`} onClick={() => gameUiStore.open('prepare')} aria-label={`오늘의 이벤트: ${event.title}. 영업 준비 열기`}><small>오늘의 이벤트 ↗</small><span>✦ {event.title}</span></button>}
            <span className="stage-caption">● 달빛 잡화점 · 진열대 {economy.expansionLevel}단계</span>
            {menu && <span className="stage-paused" aria-hidden="true">일시정지</span>}
        </section>
        <section className="game-statusbar" aria-label="영업 현황">
            <span className="status-star" aria-hidden="true">✧</span><div className="status-copy"><strong>{statusTitle}</strong><span role="status" aria-live="polite">{statusText}</span></div>
            <button className="open-shop-button" disabled={day.phase === 'open'} onClick={() => day.phase === 'closed' ? gameUiStore.open('ledger') : gameUiStore.open('prepare')}>{day.phase === 'open' ? '영업 중…' : day.phase === 'closed' ? '결산 보기' : '준비 확인 →'}</button>
        </section>
        <nav className="game-dock" aria-label="상점 관리 메뉴">{dockMenus.map((key, index) => <button key={key} onClick={() => gameUiStore.open(key)} aria-label={`${dockLabels[key]} 열기${key === 'quests' && rewards > 0 ? ` · 보상 ${rewards}개 수령 가능` : ''}`} aria-haspopup="dialog"><kbd>{index + 1}</kbd><span className="dock-symbol" aria-hidden="true">{gameMenus[key].icon}</span><span>{dockLabels[key]}</span>{key === 'quests' && rewards > 0 && <b className="dock-badge">{rewards}</b>}</button>)}</nav>
        {!success && !menu && <button className="shell-notice" role="alert" onClick={() => gameUiStore.open(saveFailed ? 'settings' : 'prepare')}>{message}</button>}
        <GameModal>
            {menu === 'goods' && <ShopPanel key={`${session}:${day.number}`} />}
            {menu === 'craft' && <CraftingPanel key={session} />}
            {menu === 'prepare' && <><CustomerPanel /><PreparationPanel onNavigate={gameUiStore.open} />{day.phase === 'closed' && <button className="open-shop-button" onClick={() => gameUiStore.open('ledger')}>결산 확인하기</button>}</>}
            {menu === 'quests' && <ObjectivesPanel />}
            {menu === 'upgrade' && <ExpansionPanel />}
            {menu === 'ledger' && <LedgerPanel key={session} />}
            {menu === 'settings' && <section className="settings-panel" aria-label="게임과 저장 관리"><SaveControls /><p className="panel-note">영업 중 게임에 재접속하면 개점 직전부터 이어집니다. 지금 메뉴를 닫으면 멈춘 시점부터 영업이 계속됩니다.</p></section>}
        </GameModal>
    </div></main>;
}
