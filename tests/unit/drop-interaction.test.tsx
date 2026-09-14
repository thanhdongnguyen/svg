// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { Converter } from '../../src/components/converter/converter';
const {choose}=vi.hoisted(()=>({choose:vi.fn()}));
vi.mock('@/hooks/use-image-converter',()=>({useImageConverter:()=>({state:{status:'idle',source:null,result:null,error:null,stage:'decoding'},choose,convert:vi.fn(),cancel:vi.fn(),reset:vi.fn(),invalidate:vi.fn()})}));
let container:HTMLDivElement,root:Root;
beforeEach(async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});choose.mockClear();container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(()=>root.render(<Converter/>));});
afterEach(async()=>{await act(()=>root.unmount());container.remove();});
function event(type:string,files:File[],types=['Files']) {return Object.assign(new Event(type,{bubbles:true,cancelable:true}),{dataTransfer:{files,types}});}
it('accepts a single dropped file and dismisses its overlay',async()=>{const file=new File(['fixture'],'a.png',{type:'image/png'});const main=container.querySelector('main')!;await act(()=>{main.dispatchEvent(event('dragenter',[file]));});expect(container.textContent).toContain('Thả ảnh vào đây');await act(()=>{main.dispatchEvent(event('drop',[file]));});expect(choose).toHaveBeenCalledWith(file);expect(container.textContent).not.toContain('Thả ảnh vào đây');});
it('rejects multiple dropped files instead of silently processing one',async()=>{await act(()=>{container.querySelector('main')!.dispatchEvent(event('drop',[new File(['a'],'a.png'),new File(['b'],'b.png')]));});expect(choose).not.toHaveBeenCalled();expect(container.querySelector('[role="alert"]')?.textContent).toContain('từng ảnh một');});
it('does not treat dragged text as an image',async()=>{await act(()=>{container.querySelector('main')!.dispatchEvent(event('dragenter',[],['text/plain']));});expect(container.textContent).not.toContain('Thả ảnh vào đây');expect(choose).not.toHaveBeenCalled();});
