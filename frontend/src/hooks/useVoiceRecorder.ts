import { useEffect, useRef, useState } from 'react';

export function useVoiceRecorder() {
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'recording' | 'ready'>('idle');
  const [clip, setClip] = useState<Blob | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimers = () => {
    if (timer.current) clearInterval(timer.current);
    if (limit.current) clearTimeout(limit.current);
  };
  const stopTracks = () => recorder.current?.stream.getTracks().forEach(track => track.stop());

  function cancel() {
    generation.current++;
    clearTimers();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stopTracks();
    setPhase('idle');
    setClip(null);
    setSeconds(0);
    setError('');
  }
  useEffect(() => () => {
    generation.current++;
    clearTimers();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stopTracks();
  }, []);

  async function start() {
    cancel();
    const current = generation.current;
    setPhase('requesting');
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Recording is unavailable in this browser. Use a current browser on localhost or HTTPS, or type your question.');
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== generation.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onstop = () => {
        rec.stream.getTracks().forEach(t => t.stop());
        if (current !== generation.current) return;
        clearTimers();
        const recording = new Blob(chunks, { type: rec.mimeType });
        if (!recording.size) {
          setError('No audio was captured. Check your microphone and try again.');
          setPhase('idle');
        } else { setClip(recording); setPhase('ready'); }
      };
      rec.onerror = () => {
        cancel();
        setError('The microphone stopped unexpectedly. Please record again or type your question.');
      };
      rec.start();
      setPhase('recording');
      const started = Date.now();
      timer.current = setInterval(() => setSeconds(Math.min(60, Math.floor((Date.now() - started) / 1000))), 250);
      limit.current = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 60_000);
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop());
      if (current !== generation.current) return;
      setPhase('idle');
      const name = e && typeof e === 'object' && 'name' in e ? String(e.name) : '';
      setError(name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser settings, or type your question.' : name === 'NotFoundError' ? 'No microphone was found. Connect one, or type your question.' : e instanceof Error ? e.message : 'Recording could not start. Try typing instead.');
    }
  }
  function stop() { if (recorder.current?.state === 'recording') recorder.current.stop(); }
  return { phase, clip, seconds, error, start, stop, cancel };
}
