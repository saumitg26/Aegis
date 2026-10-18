import {useEffect,useState} from 'react';
import {useVoiceRecorder} from '../hooks/useVoiceRecorder';
import {api, authHeaders} from '../api';
import {Button} from './ui/button';

/** Shared by story, incident notes and case questions. Recording never uploads unless requested. */
export function VoiceCapture({enabled,onTranscript,onSavedEvidence}:{enabled:boolean;onTranscript:(text:string)=>void;onSavedEvidence?:(filename:string)=>void}){
 const voice=useVoiceRecorder();
 const [url,setUrl]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[savedNotice,setSavedNotice]=useState('');
 useEffect(()=>{if(!voice.clip){setUrl('');setSavedNotice('');return;}const next=URL.createObjectURL(voice.clip);setUrl(next);return()=>URL.revokeObjectURL(next)},[voice.clip]);
 async function transcribe(){
  if(!voice.clip||!consent||!enabled)return;
  setBusy(true);setError('');
  try{const form=new FormData();form.append('file',voice.clip,voice.clip.type.includes('mp4')?'recording.mp4':'recording.webm');form.append('consent','true');const r=await api<{text:string}>('/voice/transcribe',form);if(!r.text?.trim())throw Error('No speech was returned. Your recording is still available below.');onTranscript(r.text)}
  catch(e){setError(e instanceof Error?e.message:'Transcription failed. Keep or retry your recording.')}
  finally{setBusy(false)}
 }
 async function saveToEvidence(){
  if(!voice.clip)return;
  setBusy(true);setError('');setSavedNotice('');
  try{
    const form=new FormData();
    const fname=`recording-${new Date().toISOString().slice(0,10)}-${Date.now().toString().slice(-4)}.webm`;
    form.append('file',voice.clip,fname);
    const headers=authHeaders();
    const r=await fetch('/api/evidence',{method:'POST',body:form,headers:Object.keys(headers).length?headers:undefined});
    if(!r.ok)throw Error('Failed to save audio recording');
    setSavedNotice(`Audio saved to your records as ${fname}!`);
    onSavedEvidence?.(fname);
  }catch(e){setError(e instanceof Error?e.message:'Failed to save audio')}
  finally{setBusy(false)}
 }
  return <section className="voice-capture" aria-label="Local voice recording"><p>Record locally, listen, then choose whether to transcribe or save directly as evidence. Audio is not sent when recording stops.</p><div className="button-row"><Button type="button" variant="outline" disabled={busy||voice.phase==='requesting'} onClick={()=>voice.phase==='recording'?voice.stop():void voice.start()}>{voice.phase==='recording'?`Stop recording (${voice.seconds}s)`:'Record locally'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={voice.cancel}>Discard</Button></div>{(voice.error||error)&&<p role="alert">{voice.error||error}</p>}{savedNotice&&<p style={{color:'#16A34A',fontWeight:600,fontSize:13}}>{savedNotice}</p>}{url&&<><audio src={url} controls aria-label="Review your recording"/><div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'8px 0'}}><Button type="button" variant="outline" disabled={busy} onClick={saveToEvidence}>Save audio as evidence</Button><a href={url} download="local-recording" style={{fontSize:13,alignSelf:'center'}}>Download recording</a></div><label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>I consent to sending this recording to ElevenLabs for transcription. The provider may retain it.</label><Button type="button" disabled={!enabled||!consent||busy} onClick={transcribe}>{busy?'Transcribing…':'Send to ElevenLabs'}</Button></>}{!enabled&&<small>External transcription is unavailable in this preview. You can record locally or type instead.</small>}</section>
}
