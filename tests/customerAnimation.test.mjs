import { prepareShelves } from './helpers/shelves.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { attachCustomerVisit } from '../src/game/CustomerVisit.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createGameUiStore } from '../src/stores/gameUiStore.ts';

// 실시간 대기나 GPU 없이 이동 완료와 대기 콜백을 제어한다.
function controlledScene() {
    const moves = [], timers = [], actors = [], images = [], texts = [];
    const scene = {
        add: {
            sprite: (_x, _y, key, frame) => {
                const image={key,frame,animation:null,anims:{isPaused:false,pause(){this.isPaused=true;},resume(){this.isPaused=false;}},play(value){this.animation=value;return this;},stop(){this.animation=null;return this;},setTexture(value,frame){this.key=value;this.frame=frame;return this;},setDisplaySize(){return this;},setOrigin(){return this;},setFrame(value){this.frame=value;return this;},setFlipX(value){this.flipX=value;return this;}};
                images.push(image);return image;
            },
            text: (x,y,value) => {const text={x,y,text:value,visible:true,alpha:1,setOrigin(){return this;},setText(value){this.text=value;return this;},setVisible(value){this.visible=value;return this;},setAlpha(value){this.alpha=value;return this;},setY(value){this.y=value;return this;}};texts.push(text);return text;},
            container: () => {
                const actor = { setDepth() { return this; }, setVisible(value) { this.visible = value; return this; }, setPosition(x, y) { this.x = x; this.y = y; return this; } };
                actors.push(actor); return actor;
            },
        },
        tweens: { add(config) { const motion = { config, stopped: false, stop() { this.stopped = true; } }; moves.push(motion); return motion; } },
        time: { delayedCall(delay, callback) { const timer = { delay, callback, removed: false, remove() { this.removed = true; } }; timers.push(timer); return timer; } },
    };
    return { scene, moves, timers, actors, images, texts };
}

test('실제 방문 연결: 이동→확인 대기→구매→퇴장, 중간 상태 갱신으로 타이머 중복 없음', () => {
    const store = createGameStore();
    const view = controlledScene();
    const detach = attachCustomerVisit(view.scene, store);
    assert.equal(view.actors[0].visible, false);
    store.buy('herb');
    store.buy('herb');
    prepareShelves(store); store.startDay();
    assert.equal(view.moves.length, 1);
    assert.equal(view.actors[0].visible, true);
    store.setPrice('herb', 40);
    assert.equal(view.moves.length, 1);
    view.moves[0].config.onComplete();
    assert.equal(store.getSnapshot().visit.phase, 'browsing');
    assert.equal(view.timers.length, 1);
    store.buy('herb');
    assert.equal(view.timers.length, 1);
    view.timers[0].callback();
    assert.equal(store.getSnapshot().economy.gold, 1000);
    assert.equal(store.getSnapshot().economy.inventory.herb, 1);
    assert.equal(store.getSnapshot().visit.phase, 'leaving');
    assert.equal(view.moves.length, 2);
    view.timers[0].callback();
    assert.equal(store.getSnapshot().economy.unitsSold, 1);
    view.moves[1].config.onComplete();
    assert.equal(store.getSnapshot().visit.phase, 'arriving');
    assert.equal(store.getSnapshot().visit.id, 2);
    assert.equal(store.getSnapshot().day.completedVisits, 1);
    assert.equal(view.actors[0].visible, true);
    detach();
});

test('장면 해제 시 이동·대기 취소, 늦은 콜백 무시, 재연결 시 현재 단계부터 한 번만 진행', () => {
    const store = createGameStore();
    store.buy('herb');
    prepareShelves(store); store.startDay();
    const first = controlledScene();
    const detach = attachCustomerVisit(first.scene, store);
    detach(); detach();
    assert.equal(first.moves[0].stopped, true);
    first.moves[0].config.onComplete();
    assert.equal(store.getSnapshot().visit.phase, 'arriving');
    const second = controlledScene();
    const detachSecond = attachCustomerVisit(second.scene, store);
    second.moves[0].config.onComplete();
    assert.equal(store.getSnapshot().visit.phase, 'browsing');
    detachSecond();
    assert.equal(second.timers[0].removed, true);
    second.timers[0].callback();
    assert.equal(store.getSnapshot().economy.unitsSold, 0);
    const third = controlledScene();
    const detachThird = attachCustomerVisit(third.scene, store);
    assert.equal(third.moves.length, 0);
    third.timers[0].callback();
    assert.equal(store.getSnapshot().economy.gold, 1015);
    assert.equal(store.getSnapshot().economy.unitsSold, 1);
    detachThird();
});

test('이동·대기 콜백만으로 다섯 손님이 연속 방문하고 결산, 여섯 번째 자동 방문 없음', () => {
    const store = createGameStore();
    for (const [id, count] of [['herb', 2], ['potion', 2], ['sword', 1]]) for (let i = 0; i < count; i++) store.buy(id);
    const view = controlledScene();
    const detach = attachCustomerVisit(view.scene, store);
    prepareShelves(store); store.startDay();
    for (let i = 0; i < 5; i++) {
        assert.equal(view.moves.length, i * 2 + 1);
        assert.equal(store.getSnapshot().visit.id, i + 1);
        view.moves[i * 2].config.onComplete();
        assert.equal(view.timers.length, i + 1);
        view.timers[i].callback();
        assert.equal(store.getSnapshot().visit.phase, 'leaving');
        assert.equal(store.getSnapshot().day.summary, null);
        view.moves[i * 2 + 1].config.onComplete();
        assert.equal(store.getSnapshot().day.completedVisits, i + 1);
    }
    const closed = store.getSnapshot();
    assert.equal(closed.day.phase, 'closed');
    assert.equal(closed.economy.gold, 1150);
    assert.equal(closed.day.summary.profit, 150);
    assert.equal(view.actors[0].visible, false);
    assert.equal(view.moves.length, 10);
    view.moves[9].config.onComplete();
    view.timers[4].callback();
    assert.equal(store.getSnapshot(), closed);
    store.nextDay();
    assert.equal(view.actors[0].visible, false);
    assert.equal(view.moves.length, 10);
    assert.equal(store.getSnapshot().day.phase, 'preparing');
    detach();
});

test('새 게임 후 이전 손님의 콜백은 무시하고 새 손님의 대기·이동을 보존', () => {
    const store = createGameStore();
    const view = controlledScene();
    const detach = attachCustomerVisit(view.scene, store);
    store.buy('herb'); prepareShelves(store); store.startDay();
    view.moves[0].config.onComplete();
    assert.equal(view.timers.length, 1);
    store.newGame();
    assert.equal(view.timers[0].removed, true);
    assert.equal(view.actors[0].visible, false);
    store.buy('herb'); prepareShelves(store); store.startDay();
    const newArrival = store.getSnapshot();
    view.moves[0].config.onComplete();
    view.timers[0].callback();
    assert.equal(store.getSnapshot(), newArrival);
    view.moves[1].config.onComplete();
    const browsing = store.getSnapshot();
    assert.equal(browsing.visit.phase, 'browsing');
    assert.equal(view.timers.length, 2);
    view.timers[0].callback();
    assert.equal(store.getSnapshot(), browsing);
    view.timers[1].callback();
    assert.equal(store.getSnapshot().economy.gold, 1015);
    assert.equal(store.getSnapshot().economy.unitsSold, 1);
    assert.equal(store.getSnapshot().visit.phase, 'leaving');
    detach();
});

test('확장된 상점도 이동·대기 콜백으로 9명 방문 후 한 번만 마감', () => {
    const store=createGameStore(); store.expandShop(); store.expandShop();
    const view=controlledScene(), detach=attachCustomerVisit(view.scene,store);
    store.startDay();
    for(let i=0;i<9;i++) {
        view.moves[i*2].config.onComplete();
        view.timers[i].callback();
        view.moves[i*2+1].config.onComplete();
        assert.equal(store.getSnapshot().day.phase,i===8?'closed':'open');
    }
    assert.equal(store.getSnapshot().day.summary.visitors,9);
    assert.equal(view.moves.length,18);
    assert.equal(view.actors[0].visible,false);
    const closed=store.getSnapshot();
    view.moves[17].config.onComplete(); view.timers[8].callback();
    assert.equal(store.getSnapshot(),closed);
    detach();
});


test('상품별 손님 외형과 새 입구·진열대 좌표가 실제 방문 순서와 함께 바뀜', () => {
    const store=createGameStore(),view=controlledScene(),detach=attachCustomerVisit(view.scene,store);
    store.startDay();
    assert.equal(view.images[0].key,'moonlight-luna-motion-v1');
    assert.equal(view.actors[0].x,400);assert.equal(view.actors[0].y,548);
    for(const frame of [0,1,2,0,1]){
        const { visit }=store.getSnapshot();
        assert.equal(view.images[0].key,`moonlight-${['luna','rowen','theo'][frame]}-motion-v1`);

        assert.equal(view.moves.at(-1).config.x,112+frame*116);
        assert.equal(view.moves.at(-1).config.y,355);
        store.advanceVisit(visit.id,'arrived');store.advanceVisit(visit.id,'decide');store.advanceVisit(visit.id,'departed');
    }
    assert.equal(store.getSnapshot().day.phase,'closed');assert.equal(view.actors[0].visible,false);
    detach();
});


test('루나의 걷기·대기·구매 반응과 메뉴 정지 연결, 다음 손님 동작으로 전환', () => {
    const ui=createGameUiStore(),store=createGameStore(),view=controlledScene(),detach=attachCustomerVisit(view.scene,store,ui);
    store.buy('herb');store.setDisplay('herb',1);store.startDay();const sprite=view.images[0];
    assert.equal(sprite.animation,'luna-walk-v1');assert.equal(sprite.flipX,true);
    ui.openShelf('herb');assert.equal(sprite.anims.isPaused,true);
    ui.open('quests');assert.equal(sprite.anims.isPaused,true);ui.close();assert.equal(sprite.anims.isPaused,false);
    view.moves[0].config.onComplete();assert.equal(sprite.animation,'luna-idle-v1');
    view.timers[0].callback();assert.equal(sprite.frame,6);assert.equal(sprite.animation,null);
    assert.equal(view.moves[1].config.delay+view.moves[1].config.duration,1500);assert.equal(sprite.flipX,false);
    ui.openShelf('herb');view.moves[1].config.onStart();assert.equal(sprite.animation,null);ui.close();
    view.moves[1].config.onStart();assert.equal(sprite.animation,'luna-walk-v1');view.moves[1].config.onComplete();
    assert.equal(sprite.key,'moonlight-rowen-motion-v1');assert.equal(sprite.animation,'rowen-walk-v1');
    detach();ui.open('settings');assert.equal(sprite.anims.isPaused,false);
});

test('루나가 상품을 사지 못하면 실망 포즈 후 퇴장, 다시 영업해도 반응 중복 없음',()=>{
    const store=createGameStore(),view=controlledScene(),detach=attachCustomerVisit(view.scene,store);
    store.startDay();view.moves[0].config.onComplete();view.timers[0].callback();
    assert.equal(view.images[0].frame,7);assert.equal(store.getSnapshot().economy.unitsSold,0);
    view.moves[1].config.onStart();assert.equal(view.images[0].animation,'luna-walk-v1');
    detach();
});


for (const [itemId, character, facesRight] of [['potion','rowen',true],['sword','theo',false],['mushroom','mira',true],['manaPotion','selene',true]]) {
    for (const purchased of [true,false]) test(`${character} ${purchased ? '구매 성공' : '구매 실패'}: 걷기·대기·반응·퇴장과 메뉴 정지, 늦은 콜백 차단`,()=>{
        const ui=createGameUiStore(),store=createGameStore(),view=controlledScene(),detach=attachCustomerVisit(view.scene,store,ui);
        let found=false;
        for(let day=0;day<3&&!found;day++){
            if(purchased){store.buy(itemId);store.setDisplay(itemId,store.getSnapshot().economy.inventory[itemId]);}
            store.startDay();
            while(store.getSnapshot().day.phase==='open'){
                const {visit}=store.getSnapshot();if(visit.customer.itemId===itemId){found=true;break;}
                for(const event of ['arrived','decide','departed'])store.advanceVisit(visit.id,event);
            }
            if(!found)store.nextDay();
        }
        assert.equal(found,true);
        const sprite=view.images[0],arrival=view.moves.at(-1),saleCount=store.getSnapshot().economy.unitsSold;
        assert.equal(sprite.key,`moonlight-${character}-motion-v1`);assert.equal(sprite.animation,`${character}-walk-v1`);
        assert.equal(sprite.flipX,facesRight ? arrival.config.x < 400 : arrival.config.x >= 400);
        ui.open('forest');assert.equal(sprite.anims.isPaused,true);ui.open('goods');assert.equal(sprite.anims.isPaused,true);ui.close();assert.equal(sprite.anims.isPaused,false);
        arrival.config.onComplete();assert.equal(sprite.animation,`${character}-idle-v1`);
        const beforeTimers=view.timers.length;store.setPrice(itemId,store.getSnapshot().economy.prices[itemId]);assert.equal(view.timers.length,beforeTimers);
        view.timers.at(-1).callback();assert.equal(sprite.frame,purchased ? 6 : 7);assert.equal(sprite.animation,null);
        assert.equal(store.getSnapshot().economy.unitsSold,saleCount+(purchased ? 1 : 0));
        const departure=view.moves.at(-1);assert.equal(departure.config.delay,350);assert.equal(departure.config.duration,1150);
        ui.open('ledger');departure.config.onStart();assert.equal(sprite.animation,null);ui.close();departure.config.onStart();assert.equal(sprite.animation,`${character}-walk-v1`);
        const completed=store.getSnapshot().day.completedVisits;departure.config.onComplete();assert.equal(store.getSnapshot().day.completedVisits,completed+1);
        detach();const stopped=store.getSnapshot();departure.config.onStart();departure.config.onComplete();assert.equal(store.getSnapshot(),stopped);assert.equal(sprite.animation,null);
    });
}


test('실제 구매 금액은 한 번 표시하고 가격 변경·모달 정지·이전 콜백이 표시를 바꾸지 않음',()=>{
    const ui=createGameUiStore(),store=createGameStore(),view=controlledScene(),detach=attachCustomerVisit(view.scene,store,ui);
    store.buy('herb');store.setDisplay('herb',1);store.startDay();view.moves[0].config.onComplete();view.timers[0].callback();
    const [speech,gain]=view.texts,departure=view.moves[1];assert.equal(gain.visible,true);assert.equal(gain.text,'+35G');assert.equal(speech.text,'고마워요!');assert.equal(view.texts.length,2);
    store.setPrice('herb',40);assert.equal(gain.text,'+35G');assert.equal(view.moves.length,2);assert.equal(view.texts.length,2);
    departure.progress=0.5;departure.config.onUpdate();const y=gain.y,alpha=gain.alpha;ui.open('ledger');departure.progress=1;departure.config.onUpdate();assert.equal(gain.y,y);assert.equal(gain.alpha,alpha);
    ui.close();departure.config.onUpdate();assert.ok(gain.y<y);departure.config.onComplete();assert.equal(gain.visible,false);
    const next=store.getSnapshot();departure.config.onUpdate();assert.equal(gain.visible,false);assert.equal(store.getSnapshot(),next);
    store.newGame();assert.equal(gain.visible,false);detach();
});

for(const [kind,setup,expected] of [
    ['stock',()=>{},'찾는 상품이 품절이에요.'],
    ['display',store=>store.buy('herb'),'상품이 진열되어 있지 않아요.'],
    ['budget',store=>{store.buy('herb');store.setDisplay('herb',1);store.setPrice('herb',51);},'가진 골드가 부족해요.'],
    ['price',store=>{store.buy('herb');store.setDisplay('herb',1);store.setPrice('herb',46);},'생각했던 가격보다 비싸요.'],
])test(`실제 ${kind} 거절 사유를 말풍선에 표시, 매출 금액은 표시하지 않음`,()=>{
    const store=createGameStore(),view=controlledScene(),detach=attachCustomerVisit(view.scene,store);setup(store);store.startDay();view.moves[0].config.onComplete();view.timers[0].callback();
    assert.equal(store.getSnapshot().visit.outcome.reason,kind);assert.equal(view.texts[0].text,expected);assert.equal(view.texts[1].visible,false);assert.equal(store.getSnapshot().economy.revenue,0);detach();
});
