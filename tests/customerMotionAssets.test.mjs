import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addArtFrames, addCustomerAnimations, artAssets } from '../src/game/art.ts';

// 실제 PNG 크기로 프레임을 등록한다. 파일 누락·잘못된 분할·애니메이션의 다른 인물 참조를 잡는다.
test('실제 손님 PNG의 모든 프레임이 이미지 안에 있고 동작 등록은 중복되지 않음',()=>{
    const textures=new Map(),animations=new Map();
    for(const asset of Object.values(artAssets)){
        const data=readFileSync(new URL(`../public${asset.url}`,import.meta.url));
        assert.equal(data.toString('hex',0,8),'89504e470d0a1a0a');
        const width=data.readUInt32BE(16),height=data.readUInt32BE(20),frames=new Map();
        if(asset.url.includes('-motion-'))assert.equal(data[25],6,'손님 동작 PNG에 알파 채널 필요');
        textures.set(asset.key,{getSourceImage:()=>({width,height}),add(index,_source,x,y,w,h){
            assert.ok(Number.isInteger(x)&&Number.isInteger(y)&&Number.isInteger(w)&&Number.isInteger(h));
            assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=width&&y+h<=height);frames.set(index,{x,y,w,h});
        },frames});
    }
    const scene={textures:{get:key=>textures.get(key)},anims:{exists:key=>animations.has(key),create(config){assert.equal(animations.has(config.key),false);animations.set(config.key,config);}}};
    addArtFrames(scene);addCustomerAnimations(scene);addCustomerAnimations(scene);assert.equal(animations.size,10);
    for(const name of ['luna','rowen','theo','mira','selene']){
        const texture=textures.get(`moonlight-${name}-motion-v1`);assert.equal(texture.frames.size,8);
        for(const action of ['walk','idle']){
            const animation=animations.get(`${name}-${action}-v1`);assert.equal(animation.repeat,-1);
            for(const frame of animation.frames){assert.equal(frame.key,`moonlight-${name}-motion-v1`);assert.equal(texture.frames.has(frame.frame),true);}
        }
    }
});
