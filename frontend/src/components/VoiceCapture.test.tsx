// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {VoiceCapture} from './VoiceCapture';
const mocked=vi.hoisted(()=>({api:vi.fn(),clip:null as Blob|null}));
vi.mock('../api',()=>({api:mocked.api}));
vi.mock('../hooks/useVoiceRecorder',()=>({useVoiceRecorder:()=>({phase:'ready',clip:mocked.clip,seconds:1,error:'',start:vi.fn(),stop:vi.fn(),cancel:vi.fn()})}));
beforeEach(()=>{mocked.api.mockReset();mocked.clip=new Blob(['synthetic audio']);URL.createObjectURL=vi.fn(()=> 'blob:local-test');URL.revokeObjectURL=vi.fn();});
afterEach(cleanup);
it('does not upload a completed local recording without consent and an explicit send',async()=>{
 const onTranscript=vi.fn();render(<VoiceCapture enabled onTranscript={onTranscript}/>);
 expect(mocked.api).not.toHaveBeenCalled();expect((screen.getByText('Send to ElevenLabs') as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('checkbox'));expect(mocked.api).not.toHaveBeenCalled();
 mocked.api.mockResolvedValue({text:'Actual provider text'});
 await act(async()=>{fireEvent.click(screen.getByText('Send to ElevenLabs'))});
 expect(mocked.api).toHaveBeenCalledTimes(1);expect(onTranscript).toHaveBeenCalledWith('Actual provider text');
});
it('preserves local playback and reports failure instead of creating text',async()=>{
 const onTranscript=vi.fn();mocked.api.mockRejectedValue(Error('Transcription unavailable'));
 render(<VoiceCapture enabled onTranscript={onTranscript}/>);fireEvent.click(screen.getByRole('checkbox'));
 await act(async()=>{fireEvent.click(screen.getByText('Send to ElevenLabs'))});
 expect(screen.getByRole('alert').textContent).toContain('unavailable');expect(screen.getByLabelText('Review your recording').getAttribute('src')).toBe('blob:local-test');expect(onTranscript).not.toHaveBeenCalled();
});
