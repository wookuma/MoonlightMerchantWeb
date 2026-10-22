import test from 'node:test';
import TweenManager from '../node_modules/phaser/src/tweens/TweenManager.js';
import assert from 'node:assert/strict';
import { createGameUiStore } from '../src/stores/gameUiStore.ts';
import { createGameStore } from '../src/stores/gameStore.ts';
import { createSaveRepository } from '../src/services/save/saveRepository.ts';
import { attachCustomerVisit } from '../src/game/CustomerVisit.ts';
import { bindMenuPause } from '../src/game/menuPause.ts';

// 엔진의 paused 플래그와 남은 시간을 모델링한다. 실제 방문 연결 코드를 그대로 사용한다.
function timedScene() {
    const moves=[],timers=[],sprites=[];
    const scene={
        add:{sprite:()=>{const sprite={elapsed:0,playing:false,anims:{isPaused:false,pause(){this.isPaused=true;},resume(){this.isPaused=false;}},play(){this.playing=true;return this;},stop(){this.playing=false;return this;},setTexture(){return this;},setDisplaySize(){return this;},setOrigin(){return this;},setFrame(){return this;},setFlipX(){return this;}};sprites.push(sprite);return sprite;},text:()=>({setOrigin(){return this;},setText(){return this;},setVisible(){return this;},setAlpha(){return this;},setY(){return this;}}),container:()=>({setDepth(){return this;},setVisible(){return this;},setPosition(){return this;}})},
        tweens:{paused:false,startTime:0,prevTime:0,add(config){const move={config,elapsed:0,stopped:false,done:false,stop(){this.stopped=true;}};moves.push(move);return move;}},
        time:{paused:false,delayedCall(delay,callback){const timer={delay,callback,elapsed:0,removed:false,remove(){this.removed=true;}};timers.push(timer);return timer;}},
    };
    function advance(ms){
        const oldMoves=[...moves],oldTimers=[...timers];
        for(const sprite of sprites)if(sprite.playing&&!sprite.anims.isPaused)sprite.elapsed+=ms;
        if(!scene.tweens.paused)for(const move of oldMoves)if(!move.stopped&&!move.done){move.elapsed+=ms;if(move.elapsed>=(move.config.delay??0)&&!move.started){move.started=true;move.config.onStart?.();}if(move.elapsed>=move.config.duration+(move.config.delay??0)){move.done=true;move.config.onComplete();}}
        if(!scene.time.paused)for(const timer of oldTimers)if(!timer.removed){timer.elapsed+=ms;if(timer.elapsed>=timer.delay){timer.removed=true;timer.callback();}}
    }
    return{scene,moves,timers,sprites,advance};
}

test('이동·구매 대기·퇴장 도중 메뉴를 열면 남은 시간 보존, 메뉴 전환 후 닫을 때 한 번만 재개',()=>{
    const ui=createGameUiStore(),store=createGameStore(),view=timedScene();
    const unpause=bindMenuPause(view.scene,ui),detach=attachCustomerVisit(view.scene,store,ui);
    store.buy('herb');store.setDisplay('herb',1);store.startDay();
    view.advance(500);ui.open('quests');view.advance(5000);ui.open('upgrade');view.advance(5000);
    assert.equal(store.getSnapshot().visit.phase,'arriving');assert.equal(view.moves[0].elapsed,500);assert.equal(view.moves.length,1);assert.equal(view.sprites[0].elapsed,500);
    ui.close();view.advance(999);assert.equal(store.getSnapshot().visit.phase,'arriving');view.advance(1);
    assert.equal(store.getSnapshot().visit.phase,'browsing');assert.equal(view.timers.length,1);
    view.advance(700);ui.open('goods');view.advance(50000);assert.equal(view.timers[0].elapsed,700);assert.equal(store.getSnapshot().economy.unitsSold,0);
    ui.close();view.advance(1099);assert.equal(store.getSnapshot().economy.unitsSold,0);view.advance(1);
    assert.equal(store.getSnapshot().economy.unitsSold,1);assert.equal(store.getSnapshot().economy.gold,1015);
    assert.equal(store.getSnapshot().visit.phase,'leaving');view.advance(500);ui.open('ledger');view.advance(5000);
    assert.equal(store.getSnapshot().day.completedVisits,0);ui.close();view.advance(1000);
    assert.equal(store.getSnapshot().day.completedVisits,1);assert.equal(store.getSnapshot().visit.id,2);
    assert.equal(view.moves.length,3);assert.equal(view.timers.length,1);
    detach();unpause();
});

test('이미 열린 메뉴로 장면을 연결해도 정지 적용, 정지 중 늦은 콜백은 게임 상태 변경 금지',()=>{
    const ui=createGameUiStore(),store=createGameStore(),view=timedScene();ui.open('prepare');
    const unpause=bindMenuPause(view.scene,ui),detach=attachCustomerVisit(view.scene,store,ui);
    store.startDay();const before=store.getSnapshot();view.moves[0].config.onComplete();view.advance(9000);
    assert.equal(store.getSnapshot(),before);assert.equal(view.moves[0].elapsed,0);
    ui.close();view.advance(1500);assert.equal(store.getSnapshot().visit.phase,'browsing');
    ui.open('settings');const browsing=store.getSnapshot();view.timers[0].callback();assert.equal(store.getSnapshot(),browsing);
    ui.close();view.advance(1800);assert.equal(store.getSnapshot().visit.phase,'leaving');
    detach();unpause();
});

test('메뉴 구독 해제는 원래 엔진 정지 상태 복원, 중복 해제·늦은 메뉴 변경에도 안전',()=>{
    const ui=createGameUiStore(),view=timedScene();view.scene.time.paused=true;
    const detach=bindMenuPause(view.scene,ui);ui.open('craft');assert.equal(view.scene.tweens.paused,true);
    ui.close();assert.equal(view.scene.time.paused,true);assert.equal(view.scene.tweens.paused,false);
    ui.open('quests');detach();assert.equal(view.scene.time.paused,true);assert.equal(view.scene.tweens.paused,false);
    view.scene.tweens.paused=true;detach();ui.close();assert.equal(view.scene.tweens.paused,true);
});

test('메뉴 열기·전환·닫기는 골드·재고·영업·저장을 변경하지 않고 새 UI 세션은 닫힌 상태',()=>{
    const port={raw:null,writes:0,getItem(){return this.raw;},setItem(_key,value){this.raw=value;this.writes++;}};
    const store=createGameStore(createSaveRepository(port)),ui=createGameUiStore(),snapshot=store.getSnapshot();
    ui.open('goods');ui.open('quests');ui.open('settings');ui.close();
    assert.equal(store.getSnapshot(),snapshot);assert.equal(port.writes,0);
    ui.open('craft');assert.equal(createGameUiStore().getSnapshot().menu,null);
});


test('실제 Phaser delta 계산에서 짧고 긴 메뉴 정지 시간과 메뉴 전환 시간은 제외',context=>{
    let wallTime=10000;
    context.mock.method(Date,'now',()=>wallTime);
    const ui=createGameUiStore();
    const manager={paused:false,startTime:10000,prevTime:10500,time:0.5,nextTime:504,gap:1000/240,maxLag:500,lagSkip:33};
    const scene={time:{paused:false},tweens:manager};
    wallTime=10504; // 마지막 프레임 뒤 실제 플레이한 4ms도 보존
    const detach=bindMenuPause(scene,ui,()=>wallTime);
    for(const duration of [100,1000]){
        ui.open('quests');
        wallTime+=duration/2;ui.open('goods');wallTime+=duration/2;
        ui.close();wallTime+=12;
        assert.equal(TweenManager.prototype.getDelta.call(manager,false),16);
        wallTime+=4;
    }
    ui.open('upgrade');wallTime+=200;detach();wallTime+=12;
    assert.equal(TweenManager.prototype.getDelta.call(manager,false),16);
    assert.equal(manager.paused,false);
});
