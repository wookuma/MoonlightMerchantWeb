import { checkpointLabel, decodeSave, encodeSave } from './saveData.ts';
import type { SavedState } from './saveData.ts';

export const SAVE_KEY = 'moonlight-merchant.save';
export type SaveFeedback = Readonly<{ status: 'unsaved' | 'saved' | 'error' | 'blocked'; message: string }>;
export type LoadResult = { kind: 'empty' } | { kind: 'loaded'; state: SavedState } | { kind: 'error' | 'blocked'; message: string };
export interface SaveRepository {
    load(): LoadResult;
    save(state: SavedState): SaveFeedback;
    reset(state: SavedState): SaveFeedback;
}
export interface StoragePort {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

// 저장 매체를 교체할 때 이 경계만 바꾼다. 도메인에는 브라우저 API가 들어가지 않는다.
export function createSaveRepository(storage: StoragePort): SaveRepository {
    let loaded = false;
    let knownRaw: string | null = null;
    let protectedMessage = '';
    function load(): LoadResult {
        loaded = true;
        try {
            knownRaw = storage.getItem(SAVE_KEY);
            if (knownRaw === null) { protectedMessage = ''; return { kind: 'empty' }; }
            const result = decodeSave(knownRaw);
            if (!result.ok) {
                protectedMessage = `${result.message} 기존 데이터를 보존하고 자동 저장을 중지했습니다.`;
                return { kind: 'blocked', message: protectedMessage };
            }
            protectedMessage = '';
            return { kind: 'loaded', state: result.state };
        } catch {
            protectedMessage = '저장소에 접근할 수 없습니다. 기존 데이터 보호를 위해 자동 저장을 중지했습니다.';
            return { kind: 'error', message: protectedMessage };
        }
    }
    function write(state: SavedState, replace: boolean): SaveFeedback {
        if (!replace) {
            if (!loaded) load();
            if (protectedMessage) return { status: 'blocked', message: protectedMessage };
        }
        try {
            if (!replace && storage.getItem(SAVE_KEY) !== knownRaw) {
                protectedMessage = '저장 데이터가 다른 창에서 변경되었습니다. 기존 데이터를 보존하고 자동 저장을 중지했습니다. 새로고침해서 다시 불러와 주세요.';
                return { status: 'blocked', message: protectedMessage };
            }
            const raw = encodeSave(state);
            // 기존 값을 먼저 삭제하지 않는다. 쓰기에 실패하면 이전 저장을 유지한다.
            storage.setItem(SAVE_KEY, raw);
            knownRaw = raw;
            loaded = true;
            protectedMessage = '';
            return { status: 'saved', message: `${checkpointLabel(state)} 저장 완료` };
        } catch {
            return { status: 'error', message: replace ? '새 게임을 저장하지 못했습니다. 기존 진행과 저장 데이터를 유지합니다.' : '저장하지 못했습니다. 마지막 저장 이후의 진행은 보존되지 않을 수 있어요. 다음 자동 저장 때 다시 시도합니다.' };
        }
    }
    return { load, save: state => write(state, false), reset: state => write(state, true) };
}

export function createBrowserSaveRepository(): SaveRepository {
    return createSaveRepository({
        getItem: key => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
    });
}
