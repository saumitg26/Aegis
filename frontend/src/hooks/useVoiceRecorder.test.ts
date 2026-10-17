// @vitest-environment jsdom
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useVoiceRecorder} from './useVoiceRecorder';

class FakeRecorder {
 static isTypeSupported = () => true;
 static last:FakeRecorder;
 state='inactive'; mimeType='audio/webm';
 ondataavailable:((e:{data:Blob})=>void)|null=null;
 onstop:(()=>void)|null=null; onerror:(()=>void)|null=null;
 constructor(public stream:MediaStream){FakeRecorder.last=this;}
 start(){this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['synthetic audio'])});this.onstop?.();}
}
const stop=vi.fn();
const stream={getTracks:()=>[{stop}]} as unknown as MediaStream;
const getUserMedia=vi.fn();
beforeEach(()=>{
 vi.useFakeTimers();stop.mockClear();getUserMedia.mockReset().mockResolvedValue(stream);
 vi.stubGlobal('MediaRecorder',FakeRecorder);
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
describe('local voice recording',()=>{
 it('captures a clip locally and releases the microphone on stop',async()=>{
  const {result}=renderHook(()=>useVoiceRecorder());
  await act(()=>result.current.start());expect(result.current.phase).toBe('recording');
  act(()=>{vi.advanceTimersByTime(2000)});expect(result.current.seconds).toBe(2);
  act(()=>result.current.stop());expect(result.current.phase).toBe('ready');expect(result.current.clip?.size).toBeGreaterThan(0);expect(stop).toHaveBeenCalled();
 });
 it('discards instead of preparing a clip when cancelled during recording',async()=>{
  const {result}=renderHook(()=>useVoiceRecorder());await act(()=>result.current.start());
  act(()=>result.current.cancel());expect(result.current.clip).toBeNull();expect(result.current.phase).toBe('idle');expect(stop).toHaveBeenCalled();
 });
 it('releases a microphone granted after navigation cancelled the request',async()=>{
  let resolve!:(s:MediaStream)=>void;getUserMedia.mockReturnValue(new Promise<MediaStream>(r=>{resolve=r}));
  const {result}=renderHook(()=>useVoiceRecorder());let pending:Promise<void>;
  act(()=>{pending=result.current.start()});act(()=>result.current.cancel());
  await act(async()=>{resolve(stream);await pending;});expect(result.current.phase).toBe('idle');expect(stop).toHaveBeenCalled();
 });
 it('explains permission denial without pretending recording succeeded',async()=>{
  getUserMedia.mockRejectedValue(new DOMException('Denied','NotAllowedError'));
  const {result}=renderHook(()=>useVoiceRecorder());await act(()=>result.current.start());
  expect(result.current.phase).toBe('idle');expect(result.current.error).toContain('denied');expect(result.current.clip).toBeNull();
 });
 it('stops automatically at sixty seconds',async()=>{
  const {result}=renderHook(()=>useVoiceRecorder());await act(()=>result.current.start());
  act(()=>{vi.advanceTimersByTime(60_000)});expect(result.current.phase).toBe('ready');expect(stop).toHaveBeenCalled();
 });
 it('stops capture on unmount',async()=>{
  const {result,unmount}=renderHook(()=>useVoiceRecorder());await act(()=>result.current.start());unmount();expect(stop).toHaveBeenCalled();expect(FakeRecorder.last.state).toBe('inactive');
 });
});
