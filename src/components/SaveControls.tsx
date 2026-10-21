import { useRef, useSyncExternalStore } from 'react';
import { gameStore } from '../stores/gameStore';

export function SaveControls() {
    const { saveInfo } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const dialog = useRef<HTMLDialogElement>(null);
    const failed = saveInfo.status === 'error' || saveInfo.status === 'blocked';
    function confirmNewGame() {
        if (gameStore.newGame()) dialog.current?.close();
    }
    return <>
        <div className={`save-controls ${failed ? 'save-error' : ''}`}>
            <span role={failed ? 'alert' : 'status'} aria-live={failed ? 'assertive' : 'polite'}>{saveInfo.message}</span>
            <button className="new-game-button" onClick={() => dialog.current?.showModal()}>새 게임</button>
        </div>
        <dialog ref={dialog} className="new-game-dialog" aria-labelledby="new-game-title" aria-describedby="new-game-description">
            <h2 id="new-game-title">새 게임을 시작할까요?</h2>
            <p id="new-game-description">현재 진행과 기존 저장 데이터를 지우고 1일차, 1,000G로 다시 시작합니다. 이 작업은 되돌릴 수 없습니다.</p>
            {failed && <p className="reset-error" role="alert">{saveInfo.message}</p>}
            <div className="dialog-actions">
                <button autoFocus onClick={() => dialog.current?.close()}>취소</button>
                <button className="confirm-reset" onClick={confirmNewGame}>초기화하고 시작</button>
            </div>
        </dialog>
    </>;
}
