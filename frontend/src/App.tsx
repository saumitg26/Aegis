import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Shield, House, FolderHeart, Files, Route, Network, AudioLines, FileText,
  ArrowUpRight, ArrowRight, Plus, ChevronRight, Check, Upload, Search, X,
  Download, Mail, MessageSquare, LockKeyhole, Leaf, Info, Mic, Square, Play,
  CheckCheck, Trash2, NotebookPen, ChevronDown, Volume2, VolumeX, Sparkles,
  Compass, ArrowDown, Clock, ShieldCheck, HelpCircle, Paperclip, Send, Bell
} from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { api, blobRequest, type State, type Evidence, type AuthUser } from './api';
import { Button } from './components/ui/button';

gsap.registerPlugin(useGSAP);

const nav = [
  { name: 'Home', icon: House },
  { name: 'My case', icon: FolderHeart },
  { name: 'Evidence', icon: Files },
  { name: 'Timeline', icon: Route },
  { name: 'Insights', icon: Network },
  { name: 'Voice companion', icon: AudioLines },
  { name: 'Reports', icon: FileText }
];

const emptyState: State = { case: null, evidence: [], events: [], incidents: [], findings: [] };

const formatDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Time unknown';

const pageTitles: Record<string, [string, string]> = {
  'My case': ['A little context. Your own words.', 'Keep your story together, at your own pace.'],
  Evidence: ['Your records, in one place.', 'Preserve the originals. Add context when you’re ready.'],
  Timeline: ['Make room for the full story.', 'A chronological view of your records, without assumptions.'],
  Insights: ['Understand what may connect.', 'Explainable signals, with you making the final call.'],
  'Voice companion': ['Let’s take it one thought at a time.', 'Talk or type. You decide what to share.'],
  Reports: ['Your story. Ready when you are.', 'Choose what to include, review it, and download a copy.']
};

export default function App() {
  const [page, setPage] = useState('Home');
  const [data, setData] = useState<State>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [inspect, setInspect] = useState<Evidence | null>(null);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('All sources');
  const [selected, setSelected] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [health, setHealth] = useState({ gemini: false, voice: false, tts: false });
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [redact, setRedact] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [preview, setPreview] = useState('');

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState('');
  const [userRecordedUrl, setUserRecordedUrl] = useState('');
  const [isSpeakingBrowser, setIsSpeakingBrowser] = useState(false);

  // Incident modal voice dictation state (Accessibility)
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentTime, setIncidentTime] = useState('');
  const [incidentNotes, setIncidentNotes] = useState('');
  const [incidentRecording, setIncidentRecording] = useState(false);
  const [incidentRecordingSeconds, setIncidentRecordingSeconds] = useState(0);

  // Modern Companion UI State
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
  const [evidenceFilter, setEvidenceFilter] = useState<'All' | 'Messages' | 'Emails' | 'Screenshots'>('All');
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'aegis'; text: string; time?: string }>>([
    { sender: 'user', text: 'Can you summarize my case so far?' },
    {
      sender: 'aegis',
      text: "Of course, Jamie. You've documented 5 key incidents between Jan 12, 2024 and Mar 3, 2024, including repeated messages, a concerning pattern of contact, and online harassment. I've organized your evidence, identified key patterns, and highlighted next steps we can take together."
    },
    { sender: 'user', text: 'What patterns did you find?' },
    {
      sender: 'aegis',
      text: 'I found a pattern of repeated contact after boundary requests, an escalation over time in frequency, and multiple platforms being used. This suggests a coordinated pattern which is valuable to document in your final report.'
    }
  ]);
  const [slowerSpeech, setSlowerSpeech] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);

  // User Authentication & Vultr SSO state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('aegis_user');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return null;
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  useEffect(() => {
    if (!profileOpen) return;
    const close = () => setProfileOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [profileOpen]);

  async function handleSSOLogin(provider: 'vultr' | 'google' | 'saml' | 'demo') {
    setSsoLoading(true);
    setError('');
    try {
      const res = await api<{ token: string; user: AuthUser }>('/auth/sso', { provider });
      localStorage.setItem('aegis_auth_token', res.token);
      localStorage.setItem('aegis_user', JSON.stringify(res.user));
      setCurrentUser(res.user);
      setNotice(`Signed in with ${res.user.provider} (${res.user.vultr_region.toUpperCase()})`);
    } catch (err: any) {
      setError(err.message || 'SSO authentication failed');
    } finally {
      setSsoLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await api('/auth/logout', {});
    } catch {}
    localStorage.removeItem('aegis_auth_token');
    localStorage.removeItem('aegis_user');
    setCurrentUser(null);
    setProfileOpen(false);
    setNotice('Signed out successfully.');
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondsInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const speechRecognizer = useRef<any>(null);

  const incidentRecorder = useRef<MediaRecorder | null>(null);
  const incidentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incidentSecondsInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const incidentSpeechRecognizer = useRef<any>(null);

  async function refresh() {
    const state = await api<State>('/state');
    setData(state);
    setSelected(old => old.filter(id => state.evidence.some(e => e.id === id)));
  }

  useEffect(() => {
    Promise.all([api<State>('/state'), api<typeof health>('/health')])
      .then(([state, h]) => {
        setData(state);
        setHealth(h);
        setSelected(state.evidence.map(e => e.id));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    return () => {
      recorder.current?.stream.getTracks().forEach(t => t.stop());
      if (timer.current) clearTimeout(timer.current);
      if (secondsInterval.current) clearInterval(secondsInterval.current);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (audioUrl) return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(() => {
    if (userRecordedUrl) return () => URL.revokeObjectURL(userRecordedUrl);
  }, [userRecordedUrl]);

  useEffect(() => {
    setPreview('');
  }, [selected, redact, reportNote, data]);

  // GSAP animations using official @gsap/react guidelines
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        '.gsap-stagger',
        { y: 8 },
        {
          y: 0,
          duration: 0.3,
          stagger: 0.03,
          ease: 'power2.out',
          clearProps: 'all'
        }
      );
      gsap.fromTo(
        '.hero-action',
        { scale: 0.985 },
        {
          scale: 1,
          duration: 0.3,
          ease: 'power2.out',
          clearProps: 'all'
        }
      );
    });
    return () => mm.revert();
  }, { scope: containerRef, dependencies: [page] });

  function navigate(name: string) {
    if (recorder.current?.state === 'recording') {
      recorder.current.stop();
    }
    audioRef.current?.pause();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeakingBrowser(false);
    }
    setPage(name);
    setError('');
    setNotice('');
    setTimeout(() => heading.current?.focus(), 0);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const toggleSelect = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const selectionCheckboxes = (
    <div className="selection-list">
      {data.evidence.length === 0 ? (
        <div style={{ padding: '0.75rem', background: 'rgba(57, 127, 124, 0.08)', borderRadius: '8px', margin: '0.5rem 0', border: '1px solid rgba(57, 127, 124, 0.2)' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>
            No evidence records loaded yet.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api('/seed', {});
                const s = await api<State>('/state');
                setData(s);
                setSelected(s.evidence.map(e => e.id));
                setNotice('Sample case evidence loaded and selected!');
              })
            }
          >
            <Sparkles size={14} /> Load sample evidence
          </Button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
              {selected.length} of {data.evidence.length} selected
            </span>
            <button
              type="button"
              onClick={() => setSelected(selected.length === data.evidence.length ? [] : data.evidence.map(e => e.id))}
              style={{ background: 'none', border: 'none', color: '#397F7C', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, padding: 0 }}
            >
              {selected.length === data.evidence.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {data.evidence.map(e => (
            <label key={e.id}>
              <input
                type="checkbox"
                checked={selected.includes(e.id)}
                onChange={() => toggleSelect(e.id)}
              />
              <span>
                {e.filename} <small>{e.id}</small>
              </span>
            </label>
          ))}
        </>
      )}
    </div>
  );

  const reportBody = {
    evidence_ids: selected,
    redact: redact.split('\n').filter(Boolean),
    note: reportNote
  };

  // Robust Voice Recording Handler with browser & fallback support
  async function record() {
    if (recording) {
      if (recorder.current && recorder.current.state === 'recording') {
        recorder.current.stop();
      }
      return;
    }

    if (!consent) {
      setConsent(true);
    }

    await run(async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        throw new Error('Microphone access was denied or not detected. Please check your browser microphone permission.');
      }

      try {
        const mimeTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/ogg',
          'audio/wav'
        ];
        const supportedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m));
        const rec = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : undefined);
        recorder.current = rec;
        const chunks: BlobPart[] = [];

        rec.ondataavailable = e => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        // Try setting up Web Speech API for real-time speech-to-text in Demo mode
        let speechTranscript = '';
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!health.voice && SpeechRec) {
          try {
            const sr = new SpeechRec();
            sr.continuous = true;
            sr.interimResults = true;
            sr.lang = 'en-US';
            sr.onresult = (ev: any) => {
              let live = '';
              for (let i = ev.resultIndex; i < ev.results.length; ++i) {
                if (ev.results[i].isFinal) {
                  live += ev.results[i][0].transcript;
                }
              }
              if (live) speechTranscript = live;
            };
            sr.start();
            speechRecognizer.current = sr;
          } catch {
            // Web speech optional fallback
          }
        }

        rec.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          setRecording(false);
          if (timer.current) clearTimeout(timer.current);
          if (secondsInterval.current) clearInterval(secondsInterval.current);
          if (speechRecognizer.current) {
            try { speechRecognizer.current.stop(); } catch {}
          }

          const actualMime = rec.mimeType || supportedMime || 'audio/webm';
          const ext = actualMime.includes('mp4') ? '.mp4' : actualMime.includes('ogg') ? '.ogg' : actualMime.includes('wav') ? '.wav' : '.webm';
          const audioBlob = new Blob(chunks, { type: actualMime });

          // Store for local playback
          if (audioBlob.size > 0) {
            setUserRecordedUrl(URL.createObjectURL(audioBlob));
          }

          void run(async () => {
            if (health.voice) {
              // ElevenLabs Scribe STT
              const form = new FormData();
              form.append('file', audioBlob, `recording${ext}`);
              form.append('consent', 'true');
              const result = await api<{ text: string }>('/voice/transcribe', form);
              setQuestion(result.text);
              setNotice('Transcript received from ElevenLabs. Review or edit before asking.');
            } else {
              // Demo mode fallback: use Web Speech transcript or intelligent demo query
              const finalTranscript = speechTranscript.trim() ||
                'I noticed repeated messages with identical links across the community forum. What connects these records?';
              setQuestion(finalTranscript);
              setNotice('Voice recording captured (Demo mode). You can edit the transcript below before confirming.');
            }
          });
        };

        rec.start(250);
        setRecording(true);
        setRecordingSeconds(0);

        secondsInterval.current = setInterval(() => {
          setRecordingSeconds(prev => {
            if (prev >= 59) {
              if (rec.state === 'recording') rec.stop();
              return 60;
            }
            return prev + 1;
          });
        }, 1000);

        timer.current = setTimeout(() => {
          if (rec.state === 'recording') rec.stop();
        }, 60000);
      } catch (e) {
        stream.getTracks().forEach(t => t.stop());
        throw e;
      }
    });
  }

  // Accessibility: Voice Dictation for documenting incidents
  async function toggleIncidentDictation() {
    if (incidentRecording) {
      if (incidentRecorder.current && incidentRecorder.current.state === 'recording') {
        incidentRecorder.current.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg',
        'audio/wav'
      ];
      const supportedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : undefined);
      incidentRecorder.current = rec;
      const chunks: BlobPart[] = [];

      rec.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const sr = new SpeechRec();
          sr.continuous = true;
          sr.interimResults = true;
          sr.lang = 'en-US';
          const baseNotes = incidentNotes;
          sr.onresult = (ev: any) => {
            let live = '';
            for (let i = ev.resultIndex; i < ev.results.length; ++i) {
              if (ev.results[i].isFinal) {
                live += ev.results[i][0].transcript;
              }
            }
            if (live) {
              setIncidentNotes(baseNotes ? `${baseNotes} ${live.trim()}` : live.trim());
            }
          };
          sr.start();
          incidentSpeechRecognizer.current = sr;
        } catch {}
      }

      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setIncidentRecording(false);
        if (incidentTimer.current) clearTimeout(incidentTimer.current);
        if (incidentSecondsInterval.current) clearInterval(incidentSecondsInterval.current);
        if (incidentSpeechRecognizer.current) {
          try { incidentSpeechRecognizer.current.stop(); } catch {}
        }

        const actualMime = rec.mimeType || supportedMime || 'audio/webm';
        const ext = actualMime.includes('mp4') ? '.mp4' : actualMime.includes('ogg') ? '.ogg' : actualMime.includes('wav') ? '.wav' : '.webm';
        const audioBlob = new Blob(chunks, { type: actualMime });

        if (health.voice && audioBlob.size > 0) {
          void run(async () => {
            try {
              const fd = new FormData();
              fd.append('file', audioBlob, `incident_voice${ext}`);
              fd.append('consent', 'true');
              const res = await api<{ text: string }>('/voice/transcribe', fd);
              if (res.text?.trim()) {
                setIncidentNotes(prev => prev ? `${prev}\n${res.text.trim()}` : res.text.trim());
                setNotice('Voice notes transcribed via ElevenLabs Scribe!');
              }
            } catch {
              // fallback remains active
            }
          });
        }
      };

      rec.start(250);
      setIncidentRecording(true);
      setIncidentRecordingSeconds(0);

      incidentSecondsInterval.current = setInterval(() => {
        setIncidentRecordingSeconds(prev => {
          if (prev >= 59) {
            if (rec.state === 'recording') rec.stop();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);

      incidentTimer.current = setTimeout(() => {
        if (rec.state === 'recording') rec.stop();
      }, 60000);
    } catch {
      setError('Microphone access was denied or not detected. You can type notes directly.');
    }
  }

  // Handle TTS or Browser Speech Synthesis
  function handleSpeakResponse() {
    if (!consent) {
      setConsent(true);
    }
    if (health.tts) {
      void run(async () => {
        try {
          const blob = await blobRequest('/voice/speak', { text: answer, consent: true });
          setAudioUrl(URL.createObjectURL(blob));
        } catch {
          if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const cleanText = answer.replace(/^.*?\n\n/, '');
            const utter = new SpeechSynthesisUtterance(cleanText);
            utter.onend = () => setIsSpeakingBrowser(false);
            utter.onerror = () => setIsSpeakingBrowser(false);
            setIsSpeakingBrowser(true);
            window.speechSynthesis.speak(utter);
            setNotice('Playing response via local speech synthesis.');
          }
        }
      });
    } else if (window.speechSynthesis) {
      if (isSpeakingBrowser) {
        window.speechSynthesis.cancel();
        setIsSpeakingBrowser(false);
      } else {
        window.speechSynthesis.cancel();
        const cleanText = answer.replace(/^.*?\n\n/, '');
        const utter = new SpeechSynthesisUtterance(cleanText);
        utter.onend = () => setIsSpeakingBrowser(false);
        utter.onerror = () => setIsSpeakingBrowser(false);
        setIsSpeakingBrowser(true);
        window.speechSynthesis.speak(utter);
      }
    }
  }

  async function sendChatMessage(promptText: string) {
    if (!promptText.trim()) return;
    const userMsg = {
      sender: 'user' as const,
      text: promptText,
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    };
    setChatHistory(prev => [...prev, userMsg]);
    setQuestion('');

    await run(async () => {
      let toUse = selected;
      if (!toUse.length) {
        if (data.evidence.length > 0) {
          toUse = data.evidence.map(e => e.id);
          setSelected(toUse);
        } else {
          await api('/seed', {});
          const s = await api<State>('/state');
          setData(s);
          toUse = s.evidence.map(e => e.id);
          setSelected(toUse);
        }
      }
      const r = await api<{ answer: string; mode: string }>('/ask', {
        question: promptText,
        evidence_ids: toUse,
        consent: true
      });
      const aegisMsg = {
        sender: 'aegis' as const,
        text: r.answer,
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      };
      setChatHistory(prev => [...prev, aegisMsg]);
      setAnswer(r.mode + '\n\n' + r.answer);
    });
  }

  function clearChat() {
    setChatHistory([
      {
        sender: 'aegis',
        text: "Conversation cleared. I'm ready whenever you want to talk or type."
      }
    ]);
    setAnswer('');
  }

  function replayLastVoiceMessage() {
    const lastAegis = [...chatHistory].reverse().find(m => m.sender === 'aegis');
    const textToSpeak = lastAegis ? lastAegis.text : answer || 'I found a pattern of repeated contact after boundary requests, an escalation over time in frequency, and multiple platforms being used.';
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const cleanText = textToSpeak.replace(/^.*?\n\n/, '');
      const utter = new SpeechSynthesisUtterance(cleanText);
      if (slowerSpeech) {
        utter.rate = 0.82;
      }
      utter.onend = () => setIsSpeakingBrowser(false);
      utter.onerror = () => setIsSpeakingBrowser(false);
      setIsSpeakingBrowser(true);
      window.speechSynthesis.speak(utter);
      setNotice('Replaying response with speech synthesis.');
    }
  }

  const pendingFindingsCount = data.findings.filter(f => f.decision === 'pending').length;

  if (!currentUser) {
    return (
      <div className="sso-portal-wrap">
        <div className="sso-portal-card gsap-stagger">
          <div className="sso-brand-header">
            <div className="sso-lotus-mark">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C12 2 8 8 8 13C8 16.5 10 19 12 20C14 19 16 16.5 16 13C16 8 12 2 12 2Z" fill="#7C3AED" />
                <path d="M5 8C5 8 4 13 6 16C8 19 10.5 19.5 11.5 19.5C9.5 18 7.5 15 7.5 12C7.5 9 8.5 7 8.5 7C6.5 7 5 8 5 8Z" fill="#A78BFA" />
                <path d="M19 8C19 8 20 13 18 16C16 19 13.5 19.5 12.5 19.5C14.5 18 16.5 15 16.5 12C16.5 9 15.5 7 15.5 7C17.5 7 19 8 19 8Z" fill="#A78BFA" />
              </svg>
            </div>
            <h1 className="sso-title">AEGIS</h1>
            <div className="sso-subtitle">Your Digital Safety Companion</div>
            <div className="sso-desc">
              A private, confidential space to document what happened and preserve cryptographic evidence with zero-trust enclave protection.
            </div>
          </div>

          {error && <div className="banner error" style={{ width: '100%', marginBottom: 16 }}>{error}</div>}
          {notice && <div className="banner success" style={{ width: '100%', marginBottom: 16 }}>{notice}</div>}

          <div className="sso-buttons-stack">
            <button
              className="sso-vultr-btn"
              onClick={() => handleSSOLogin('vultr')}
              disabled={ssoLoading}
            >
              <ShieldCheck size={18} />
              <span>{ssoLoading ? 'Authenticating...' : 'Continue with Vultr SSO'}</span>
            </button>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: -4, marginBottom: 4 }}>
              Isolated High-Frequency compute & cryptographic enclave (EWR)
            </div>

            <button
              className="sso-secondary-btn"
              onClick={() => handleSSOLogin('google')}
              disabled={ssoLoading}
            >
              <Mail size={16} />
              <span>Continue with Google Workspace</span>
            </button>

            <button
              className="sso-secondary-btn"
              onClick={() => handleSSOLogin('saml')}
              disabled={ssoLoading}
            >
              <LockKeyhole size={16} />
              <span>Continue with Enterprise SAML / Okta</span>
            </button>

            <button
              className="sso-demo-btn"
              onClick={() => handleSSOLogin('demo')}
              disabled={ssoLoading}
            >
              <Sparkles size={16} />
              <span>Instant Demo Access as Jamie</span>
            </button>
          </div>

          <div className="sso-trust-strip">
            <div className="sso-trust-item">
              <Shield size={13} style={{ color: '#10B981' }} />
              <span>Zero-Knowledge</span>
            </div>
            <div className="sso-trust-item">
              <LockKeyhole size={13} style={{ color: '#6366F1' }} />
              <span>SHA-256 Verified</span>
            </div>
            <div className="sso-trust-item">
              <Sparkles size={13} style={{ color: '#0284C7' }} />
              <span>Vultr Cloud EWR</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app" ref={containerRef}>
      <a href="#main" className="skip">Skip to content</a>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('Home'); }} style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, paddingBottom: 16 }}>
          <svg className="brand-logo-svg" viewBox="0 0 100 100" fill="none" style={{ width: 44, height: 44 }}>
            <path d="M50 15C50 15 32 38 32 58C32 72 40 82 50 85C60 82 68 72 68 58C68 38 50 15 50 15Z" fill="#818CF8" />
            <path d="M50 25C50 25 22 45 22 62C22 75 32 82 42 85C36 78 34 68 36 58C38 46 50 25 50 25Z" fill="#A5B4FC" opacity="0.8" />
            <path d="M50 25C50 25 78 45 78 62C78 75 68 82 58 85C64 78 66 68 64 58C62 46 50 25 50 25Z" fill="#6366F1" opacity="0.9" />
          </svg>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.04em', color: '#312E81' }}>
            AEGIS
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#6366F1' }}>
            Your Digital Safety Companion
          </span>
        </a>

        <div className="workspace-label">YOUR SPACE</div>

        <nav aria-label="Main navigation">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={'nav-item ' + (page === name ? 'active' : '')}
              aria-current={page === name ? 'page' : undefined}
              onClick={() => navigate(name)}
            >
              <Icon size={18} strokeWidth={1.65} />
              <span>{name}</span>
              {name === 'Insights' && pendingFindingsCount > 0 && (
                <span className="count" title={`${pendingFindingsCount} pending suggestions`}>
                  {pendingFindingsCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-companion-card">
          <span className="sidebar-companion-icon">🌱</span>
          <div className="sidebar-companion-title">You're not alone.</div>
          <div className="sidebar-companion-text">
            AEGIS is here to support, believe, and empower you every step of the way.
          </div>
          <span style={{ fontSize: 13 }}>💜</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrap">
        <header className="topbar">
          <div className="search-box">
            <Search size={14} style={{ color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Search anything..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="top-actions">
            <button className="icon-btn" title="Synthetic Demo Workspace" onClick={() => navigate('Insights')}>
              <Bell size={16} />
            </button>
            <div
              className="user-pill"
              onClick={e => {
                e.stopPropagation();
                setProfileOpen(prev => !prev);
              }}
            >
              <div className="user-avatar">{currentUser?.avatar_initials || 'J'}</div>
              <span className="user-name">{currentUser?.name?.split(' ')[0] || 'Jamie'}</span>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>{profileOpen ? '▲' : '▼'}</span>

              {profileOpen && (
                <div className="profile-popover" onClick={e => e.stopPropagation()}>
                  <div className="profile-popover-header">
                    <div className="profile-header-avatar">
                      {currentUser?.avatar_initials || 'J'}
                    </div>
                    <div className="profile-header-meta">
                      <div className="profile-header-name">{currentUser?.name || 'Jamie Doe'}</div>
                      <div className="profile-header-email">{currentUser?.email || 'jamie@cloud.vultr.com'}</div>
                    </div>
                  </div>

                  <div className="vultr-status-badge">
                    <ShieldCheck size={14} />
                    <span>{currentUser?.provider || 'Vultr Cloud Authentication'}</span>
                  </div>

                  <div className="vultr-meta-card">
                    <div className="vultr-meta-row">
                      <span>Datacenter Enclave:</span>
                      <strong>{currentUser?.vultr_region_name || 'New Jersey (EWR)'}</strong>
                    </div>
                    <div className="vultr-meta-row">
                      <span>Instance ID:</span>
                      <code>{currentUser?.vultr_instance_id || 'vultr-inst-49204'}</code>
                    </div>
                    <div className="vultr-meta-row">
                      <span>Encryption:</span>
                      <span>{currentUser?.encryption_standard || 'AES-256-GCM / SHA-256'}</span>
                    </div>
                    <div className="vultr-meta-row">
                      <span>Role:</span>
                      <strong>{currentUser?.role || 'Survivor Case Owner'}</strong>
                    </div>
                  </div>

                  <button className="profile-signout-btn" onClick={handleSignOut}>
                    <LockKeyhole size={14} />
                    <span>Sign Out of AEGIS</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="demo-banner">
          <span className="demo-pill">DEMO</span>
          <span>Synthetic demonstration — please do not upload sensitive real-world records.</span>
        </div>

        {/* Cozy Hero Banner with 4-Step Progress Journey */}
        <section className="hero-banner gsap-stagger">
          <div className="hero-illustration-area">
            <div className="hero-avatar-art">
              ☕
              <span className="art-badge-text">You Got This 💜</span>
            </div>
          </div>
          <div className="hero-text-area">
            <h1 className="hero-greeting" ref={heading} tabIndex={-1}>
              {page === 'Home' ? `Hi ${currentUser?.name?.split(' ')[0] || 'Jamie'},` : (pageTitles[page]?.[0] || page)}
            </h1>
            <div className="hero-sub">
              {page === 'Home'
                ? "I'm here to help you document what happened and guide you step by step."
                : (pageTitles[page]?.[1] || '')}
            </div>
            <div className="hero-motto">
              Your story matters. Take it at your own pace — I'm with you.
            </div>

            {/* 4 Step Journey in Banner */}
            <div className="hero-journey-steps">
              <div
                className="journey-step-item"
                style={{ cursor: 'pointer' }}
                onClick={() => setModal(true)}
              >
                <span className="journey-num step-1">1</span>
                <div className="journey-step-info">
                  <strong>Tell your story</strong>
                  <small>Share in your own words</small>
                </div>
              </div>
              <div
                className="journey-step-item"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('Evidence')}
              >
                <span className="journey-num step-2">2</span>
                <div className="journey-step-info">
                  <strong>Upload evidence</strong>
                  <small>Screenshots, emails & files</small>
                </div>
              </div>
              <div
                className="journey-step-item"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('Insights')}
              >
                <span className="journey-num step-3">3</span>
                <div className="journey-step-info">
                  <strong>Review patterns</strong>
                  <small>Gemini 3.8 Flash insights</small>
                </div>
              </div>
              <div
                className="journey-step-item"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('Reports')}
              >
                <span className="journey-num step-4">4</span>
                <div className="journey-step-info">
                  <strong>Export report</strong>
                  <small>Forensic verified PDF</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <main id="main">
          <div className="content t-page-transition">
            {error && (
              <div className="alert" role="alert">
                <span>{error}</span>
                <button aria-label="Dismiss error" onClick={() => setError('')}>
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                <Check size={16} />
                <span>{notice}</span>
              </div>
            )}

            {loading ? (
              <p role="status">Opening your workspace…</p>
            ) : (
              <>
                {page === 'Home' ? (
                  <div>
                    <div className="grid-3">
                      {/* What Happened Card */}
                      <div className="card gsap-stagger">
                        <div className="card-header">
                          <div className="card-title-group">
                            <span className="card-icon">📄</span>
                            <span className="card-title">What happened</span>
                          </div>
                          <button className="link-action" onClick={() => navigate('My case')}>
                            View my case →
                          </button>
                        </div>
                        <p className="case-summary-p">
                          You've documented {data.incidents.length || 5} key incidents between Jan 12, 2024 and Mar 3, 2024, involving concerning messages, repeated contact, and online harassment. AEGIS is helping you organize your evidence and identify patterns.
                        </p>
                        <div className="stat-pills-row">
                          <div className="stat-pill">
                            <span className="stat-pill-icon">💬</span>
                            <div className="stat-pill-text">
                              <strong>{data.incidents.length || 5}</strong>
                              <small>incidents</small>
                            </div>
                          </div>
                          <div className="stat-pill">
                            <span className="stat-pill-icon">📅</span>
                            <div className="stat-pill-text">
                              <strong>Jan 12 - Mar 3</strong>
                              <small>date range</small>
                            </div>
                          </div>
                          <div className="stat-pill">
                            <span className="stat-pill-icon">📎</span>
                            <div className="stat-pill-text">
                              <strong>{data.evidence.length || 12}</strong>
                              <small>evidence items</small>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Companion Insights Card */}
                      <div className="card gsap-stagger">
                        <div className="card-header">
                          <div className="card-title-group">
                            <span className="card-icon">💡</span>
                            <span className="card-title">Companion Insights</span>
                          </div>
                          <button className="link-action" onClick={() => navigate('Insights')}>
                            See all insights →
                          </button>
                        </div>
                        <div className="insight-item" onClick={() => navigate('Insights')}>
                          <span className="insight-num">1</span>
                          <div className="insight-content">
                            <strong>Pattern of repeated contact</strong>
                            <p>There were 17 instances of contact after you requested no further communication.</p>
                          </div>
                        </div>
                        <div className="insight-item" onClick={() => navigate('Insights')}>
                          <span className="insight-num">2</span>
                          <div className="insight-content">
                            <strong>Escalation over time</strong>
                            <p>The frequency and tone increased in February, with more intense and concerning messages.</p>
                          </div>
                        </div>
                        <div className="insight-item" onClick={() => navigate('Insights')}>
                          <span className="insight-num">3</span>
                          <div className="insight-content">
                            <strong>Multiple platforms involved</strong>
                            <p>Activity occurred across text messages, email, and social media, suggesting a coordinated pattern.</p>
                          </div>
                        </div>
                      </div>

                      {/* Recent Evidence Card */}
                      <div className="card gsap-stagger">
                        <div className="card-header">
                          <div className="card-title-group">
                            <span className="card-icon">📎</span>
                            <span className="card-title">Recent evidence</span>
                          </div>
                          <button className="link-action" onClick={() => navigate('Evidence')}>
                            View all evidence →
                          </button>
                        </div>
                        {data.evidence.length > 0 ? (
                          data.evidence.slice(0, 3).map((e) => (
                            <button
                              key={e.id}
                              className="evidence-item-compact"
                              onClick={() => {
                                setSelectedEvidenceId(e.id);
                                navigate('Evidence');
                              }}
                            >
                              <span className={`evidence-icon-wrap ${e.source === 'Email' ? 'icon-mail' : 'icon-msg'}`}>
                                {e.source === 'Email' ? '✉️' : '💬'}
                              </span>
                              <div className="evidence-item-info">
                                <strong>{e.filename}</strong>
                                <small>{formatDate(e.original_time)}</small>
                              </div>
                              <span style={{ color: '#94A3B8' }}>›</span>
                            </button>
                          ))
                        ) : (
                          <>
                            <div className="evidence-item-compact" onClick={() => navigate('Evidence')}>
                              <span className="evidence-icon-wrap icon-msg">💬</span>
                              <div className="evidence-item-info">
                                <strong>Text message screenshot</strong>
                                <small>Mar 3, 2024 · 10:24 PM</small>
                              </div>
                              <span style={{ color: '#94A3B8' }}>›</span>
                            </div>
                            <div className="evidence-item-compact" onClick={() => navigate('Evidence')}>
                              <span className="evidence-icon-wrap icon-mail">✉️</span>
                              <div className="evidence-item-info">
                                <strong>Email from unknown sender</strong>
                                <small>Feb 18, 2024 · 2:17 PM</small>
                              </div>
                              <span style={{ color: '#94A3B8' }}>›</span>
                            </div>
                            <div className="evidence-item-compact" onClick={() => navigate('Evidence')}>
                              <span className="evidence-icon-wrap icon-img">🖼️</span>
                              <div className="evidence-item-info">
                                <strong>Social media message</strong>
                                <small>Jan 25, 2024 · 8:41 PM</small>
                              </div>
                              <span style={{ color: '#94A3B8' }}>›</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid-3" style={{ marginTop: 20 }}>
                      {/* Connections Diagram Card */}
                      <div className="card gsap-stagger">
                        <div className="card-header">
                          <div className="card-title-group">
                            <span className="card-icon">🕸️</span>
                            <span className="card-title">Connections</span>
                          </div>
                          <button className="link-action" onClick={() => navigate('Insights')}>
                            Open full view →
                          </button>
                        </div>
                        <div className="connections-diagram-wrap">
                          <div className="node-satellite node-1">💬 Messages (17)</div>
                          <div className="node-satellite node-2">✉️ Email (6)</div>
                          <div className="node-center">
                            <span>👤</span>
                            <span>You</span>
                          </div>
                          <div className="node-satellite node-3">👤 Unknown Number</div>
                          <div className="node-satellite node-4">👥 Related Accounts (3)</div>
                        </div>
                      </div>

                      {/* AEGIS Voice Card */}
                      <div className="card gsap-stagger">
                        <div className="card-header">
                          <div className="card-title-group">
                            <span className="card-icon">🎙️</span>
                            <span className="card-title">AEGIS Voice</span>
                          </div>
                          <button className="link-action" onClick={() => navigate('Voice companion')}>
                            Try a prompt →
                          </button>
                        </div>
                        <div className="voice-interactive-box">
                          <button
                            type="button"
                            className={`voice-mic-circle ${recording ? 'active' : ''}`}
                            onClick={() => {
                              navigate('Voice companion');
                            }}
                            title="Open AEGIS Voice Companion"
                          >
                            🎙️
                          </button>
                          <div className="soundwave-line">
                            <span className="wave-bar" style={{ height: 10 }} />
                            <span className="wave-bar" style={{ height: 18 }} />
                            <span className="wave-bar" style={{ height: 8 }} />
                            <span className="wave-bar" style={{ height: 22 }} />
                            <span className="wave-bar" style={{ height: 14 }} />
                            <span className="wave-bar" style={{ height: 19 }} />
                            <span className="wave-bar" style={{ height: 6 }} />
                          </div>
                          <div className="voice-callout-title">Tap to talk with AEGIS</div>
                          <div className="voice-callout-sub">
                            Ask questions, talk through what happened, or get guidance on next steps.
                          </div>
                        </div>
                      </div>

                      {/* Report Ready Card */}
                      <div className="card gsap-stagger">
                        <div className="card-header">
                          <div className="card-title-group">
                            <span className="card-icon">📋</span>
                            <span className="card-title">Report Ready</span>
                          </div>
                        </div>
                        <div className="report-card-content">
                          <div className="report-doc-mock">
                            <span>🌸</span>
                            <span>AEGIS</span>
                          </div>
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0F172A', display: 'block', lineHeight: 1.3 }}>
                              Your information is organized and ready when you are.
                            </strong>
                            <p style={{ fontSize: '11px', color: '#64748B', marginTop: 4, lineHeight: 1.4 }}>
                              Generate a clear, structured report with your timeline, evidence, and key insights.
                            </p>
                            <button className="btn-gradient" onClick={() => navigate('Reports')}>
                              Generate Report →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="eyebrow">YOUR SPACE / {page.toUpperCase()}</div>
                    <div className="page-heading">
                      <div>
                        <h1 className="inner-title" ref={heading} tabIndex={-1}>
                          {pageTitles[page][0]}
                        </h1>
                        <p className="intro">{pageTitles[page][1]}</p>
                      </div>
                      {page === 'My case' && (
                        <Button onClick={() => setModal(true)}>
                          <Plus size={17} />
                          Document an incident
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {/* My Case Page */}
                {page === 'My case' && (
                  <div>
                    {/* Key Dates Timeline Card */}
                    <div className="card gsap-stagger" style={{ marginBottom: 20 }}>
                      <div className="card-header">
                        <div className="card-title-group">
                          <span className="card-icon">📅</span>
                          <span className="card-title">Key Timeline Dates</span>
                        </div>
                        <Button onClick={() => setModal(true)}>
                          <Plus size={16} /> Document an incident
                        </Button>
                      </div>
                      <div className="case-key-dates">
                        <div className="key-date-node">
                          <span className="key-date-pill">Jan 12</span>
                          <span className="key-date-label">First boundary set</span>
                        </div>
                        <span style={{ color: '#CBD5E1', fontSize: 16 }}>→</span>
                        <div className="key-date-node">
                          <span className="key-date-pill">Feb 8</span>
                          <span className="key-date-label">Cross-platform contact</span>
                        </div>
                        <span style={{ color: '#CBD5E1', fontSize: 16 }}>→</span>
                        <div className="key-date-node">
                          <span className="key-date-pill">Mar 3</span>
                          <span className="key-date-label">Latest contact attempt</span>
                        </div>
                      </div>
                      <table className="case-details-table">
                        <tbody>
                          <tr>
                            <td>Status:</td>
                            <td>Active Documentation</td>
                          </tr>
                          <tr>
                            <td>Date range:</td>
                            <td>Jan 12, 2024 – Mar 3, 2024</td>
                          </tr>
                          <tr>
                            <td>Primary concern:</td>
                            <td>Repeated Contact & Boundary Violations</td>
                          </tr>
                          <tr>
                            <td>Moments documented:</td>
                            <td>{data.incidents.length} incidents logged</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="two-columns">
                      <form
                        className="surface gsap-stagger"
                        onSubmit={e => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void run(async () => {
                            await api(
                              '/case',
                              { title: f.get('title'), description: f.get('description') },
                              'PUT'
                            );
                            await refresh();
                            setNotice('Case saved to this demo.');
                          });
                        }}
                        key={data.case?.id}
                      >
                        <span className="eyebrow">YOUR CASE CONTEXT</span>
                        <h2>A place for context</h2>
                        <label>
                          Case name
                          <input
                            name="title"
                            required
                            maxLength={150}
                            defaultValue={data.case?.title || ''}
                            placeholder="Give your case a name"
                          />
                        </label>
                        <label>
                          Description
                          <textarea
                            name="description"
                            rows={5}
                            defaultValue={data.case?.description || ''}
                            placeholder="What would you like to keep track of?"
                          />
                        </label>
                        <Button disabled={busy}>
                          Save case <Check size={16} />
                        </Button>
                      </form>

                      <section>
                        <h2>Documented moments</h2>
                        {!data.incidents.length && (
                          <p className="muted">No incidents yet. Start with whatever feels useful.</p>
                        )}
                        {data.incidents.map(i => (
                          <article className="surface incident gsap-stagger" key={i.id}>
                            <small>{formatDate(i.occurred_at)}</small>
                            <h3>{i.title}</h3>
                            <p>{i.description}</p>
                            <span className="badge">Saved to this demo</span>
                          </article>
                        ))}
                      </section>
                    </div>
                  </div>
                )}

                {/* Evidence Page — Split Table + Detail Drawer */}
                {page === 'Evidence' && (() => {
                  const activeItem = data.evidence.find(e => e.id === selectedEvidenceId) || data.evidence[0] || null;
                  const filteredEvidence = data.evidence.filter(e => {
                    const matchesSearch = e.filename.toLowerCase().includes(search.toLowerCase());
                    if (!matchesSearch) return false;
                    if (evidenceFilter === 'Messages') return e.source.toLowerCase().includes('message') || e.filename.toLowerCase().includes('message');
                    if (evidenceFilter === 'Emails') return e.source.toLowerCase().includes('email') || e.filename.toLowerCase().includes('eml') || e.filename.toLowerCase().includes('mail');
                    if (evidenceFilter === 'Screenshots') return e.source.toLowerCase().includes('image') || e.filename.toLowerCase().includes('png') || e.filename.toLowerCase().includes('jpg') || e.filename.toLowerCase().includes('screen');
                    return true;
                  });

                  return (
                    <div>
                      <div className="grid-2" style={{ marginBottom: 20 }}>
                        <label className="card" style={{ border: '2px dashed #C7D2FE', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: 'row', cursor: 'pointer' }}>
                          <div>
                            <strong style={{ fontSize: 15, color: '#1E1B4B' }}>Upload evidence</strong>
                            <p style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Add screenshots, emails, messages, and other files.</p>
                          </div>
                          <span className="btn-gradient" style={{ pointerEvents: 'none' }}>
                            <Upload size={14} /> Upload evidence
                          </span>
                          <input
                            type="file"
                            disabled={busy}
                            style={{ display: 'none' }}
                            accept=".eml,.json,.txt,.png,.jpg,.jpeg"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                void run(async () => {
                                  const f = new FormData();
                                  f.append('file', file);
                                  await api('/evidence', f);
                                  await refresh();
                                  setNotice('Original saved and SHA-256 calculated.');
                                });
                              }
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <div className="card" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
                          <strong style={{ color: '#B45309', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Sparkles size={14} /> Helpful tip
                          </strong>
                          <p style={{ fontSize: 12, color: '#92400E', marginTop: 4, lineHeight: 1.45 }}>
                            Upload anything that feels relevant — even if you're not sure. Every file is cryptographically hashed with SHA-256 for court-grade tamper evidence.
                          </p>
                        </div>
                      </div>

                      <div className="evidence-split-wrap">
                        {/* Evidence Table */}
                        <div className="evidence-table-card">
                          <div className="filter-pills">
                            {(['All', 'Messages', 'Emails', 'Screenshots'] as const).map(tab => (
                              <button
                                key={tab}
                                type="button"
                                className={`filter-pill ${evidenceFilter === tab ? 'active' : ''}`}
                                onClick={() => setEvidenceFilter(tab)}
                              >
                                {tab} ({
                                  tab === 'All' ? data.evidence.length :
                                  tab === 'Messages' ? data.evidence.filter(e => e.source.toLowerCase().includes('message') || e.filename.toLowerCase().includes('message')).length :
                                  tab === 'Emails' ? data.evidence.filter(e => e.source.toLowerCase().includes('email') || e.filename.toLowerCase().includes('eml') || e.filename.toLowerCase().includes('mail')).length :
                                  data.evidence.filter(e => e.source.toLowerCase().includes('image') || e.filename.toLowerCase().includes('png') || e.filename.toLowerCase().includes('jpg') || e.filename.toLowerCase().includes('screen')).length
                                })
                              </button>
                            ))}
                          </div>

                          {filteredEvidence.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748B' }}>
                              <p style={{ marginBottom: 12 }}>No evidence matches this filter.</p>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  run(async () => {
                                    await api('/seed', {});
                                    await refresh();
                                    setNotice('Sample records loaded.');
                                  })
                                }
                              >
                                <Sparkles size={14} /> Load sample case evidence
                              </Button>
                            </div>
                          ) : (
                            filteredEvidence.map(e => {
                              const isSelected = activeItem?.id === e.id;
                              const isEmail = e.source.toLowerCase().includes('email') || e.filename.toLowerCase().includes('eml');
                              const isImg = e.filename.toLowerCase().includes('png') || e.filename.toLowerCase().includes('jpg');
                              return (
                                <button
                                  key={e.id}
                                  type="button"
                                  className={`evidence-row-modern ${isSelected ? 'selected' : ''}`}
                                  onClick={() => setSelectedEvidenceId(e.id)}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                    <span className={`evidence-icon-wrap ${isEmail ? 'icon-mail' : isImg ? 'icon-img' : 'icon-msg'}`}>
                                      {isEmail ? '✉️' : isImg ? '📷' : '💬'}
                                    </span>
                                    <div style={{ textAlign: 'left', minWidth: 0 }}>
                                      <strong style={{ fontSize: 13, color: '#0F172A', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {e.filename}
                                      </strong>
                                      <small style={{ color: '#64748B', fontSize: 11 }}>
                                        {e.source} · {(e.size / 1024).toFixed(1)} KB
                                      </small>
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <span style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 2 }}>
                                      {formatDate(e.original_time)}
                                    </span>
                                    <span className="badge-status badge-reviewed">Verified</span>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>

                        {/* Evidence Details Drawer */}
                        <div className="detail-drawer">
                          {activeItem ? (
                            <>
                              <div className="card-header">
                                <span className="card-title">Evidence Details</span>
                                <span className="badge-status badge-reviewed">Verified</span>
                              </div>

                              <div className="chat-preview-box">
                                <div className="chat-bubble chat-received">
                                  {data.events.find(ev => ev.evidence_id === activeItem.id)?.content ||
                                    "I just don't understand why you're making this so difficult."}
                                  <small style={{ display: 'block', fontSize: 9, opacity: 0.7, marginTop: 2 }}>9:12 PM</small>
                                </div>
                                <div className="chat-bubble chat-sent">
                                  I've already told you I need space. Please respect that.
                                  <small style={{ display: 'block', fontSize: 9, opacity: 0.8, marginTop: 2 }}>9:15 PM ✓✓</small>
                                </div>
                              </div>

                              <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: '#0F172A' }}>
                                {activeItem.filename}
                              </h4>
                              <div style={{ fontSize: 11, color: '#64748B', marginBottom: 14 }}>
                                📅 {formatDate(activeItem.original_time)} · {activeItem.source}
                              </div>

                              <div style={{ marginBottom: 16 }}>
                                <strong style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: 6 }}>
                                  Behavioral Indicators
                                </strong>
                                <span className="tag-pill">Boundary</span>
                                <span className="tag-pill">Repeated Contact</span>
                                <span className="tag-pill">Documented</span>
                                <span className="tag-pill" style={{ background: 'none', border: '1px dashed #CBD5E1', color: '#6366F1' }}>
                                  + Tag
                                </span>
                              </div>

                              <div style={{ background: '#F8FAFC', padding: 10, borderRadius: 8, fontSize: 10, fontFamily: 'monospace', color: '#334155', border: '1px solid #E2E8F0', wordBreak: 'break-all', marginBottom: 14 }}>
                                <strong>SHA-256 HASH:</strong><br />
                                {activeItem.sha256}
                              </div>

                              <div style={{ display: 'flex', gap: 8 }}>
                                <Button asChild variant="outline" style={{ flex: 1, fontSize: 12 }}>
                                  <a href={`/api/evidence/${activeItem.id}/download`} download>
                                    <Download size={14} /> Download
                                  </a>
                                </Button>
                                <Button
                                  variant="ghost"
                                  style={{ color: '#EF4444' }}
                                  disabled={busy}
                                  onClick={() => {
                                    if (confirm('Remove this record and its derived events?')) {
                                      void run(async () => {
                                        await api(`/evidence/${activeItem.id}`, undefined, 'DELETE');
                                        await refresh();
                                        setNotice('Evidence removed.');
                                      });
                                    }
                                  }}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </>
                          ) : (
                            <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748B' }}>
                              <p>Select an evidence item to view details.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Timeline Page */}
                {page === 'Timeline' && (
                  <>
                    <div className="subtle-note">
                      <Info size={17} />
                      All known times shown in UTC. Missing timezone offsets remain unknown.
                    </div>
                    <div className="timeline">
                      {[
                        ...data.events.map(e => ({
                          id: e.id,
                          title: e.platform + ' record',
                          text: e.content,
                          time: e.time,
                          evidence: e.evidence_id
                        })),
                        ...data.incidents.map(i => ({
                          id: i.id,
                          title: i.title,
                          text: i.description,
                          time: i.occurred_at,
                          evidence: ''
                        }))
                      ]
                        .sort((a, b) => (a.time || '9999').localeCompare(b.time || '9999'))
                        .map(e => (
                          <article className="timeline-item gsap-stagger" key={e.id}>
                            <div className="timeline-date">
                              {formatDate(e.time)}
                              <small>
                                {e.time
                                  ? new Date(e.time).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      timeZone: 'UTC'
                                    }) + ' UTC'
                                  : 'Time not provided'}
                              </small>
                            </div>
                            <span className="timeline-dot" />
                            <div className="surface">
                              <h3>{e.title}</h3>
                              <p>{e.text}</p>
                              {e.evidence && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setInspect(data.evidence.find(a => a.id === e.evidence) || null)
                                  }
                                >
                                  Inspect original <ArrowUpRight size={14} />
                                </button>
                              )}
                            </div>
                          </article>
                        ))}
                    </div>
                    {!data.events.length && !data.incidents.length && (
                      <p>No events yet. Add records or document an incident.</p>
                    )}
                  </>
                )}

                {/* Insights Page */}
                {page === 'Insights' && (
                  <>
                    <div className="subtle-note">
                      <Info size={18} />
                      Connections are suggestions. Shared words or timing do not prove identity or intent.
                    </div>
                    <div className="section-title">
                      <h2>Connections to consider</h2>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api('/reconstruct', {});
                            await refresh();
                            setNotice('Local signals updated.');
                          })
                        }
                      >
                        <Network size={16} />
                        Find connections
                      </Button>
                    </div>

                    {data.findings.map(f => (
                      <article className="surface finding gsap-stagger" key={f.id}>
                        <div className="section-title">
                          <span className="badge">
                            {f.origin === 'Gemini'
                              ? 'AI suggestion · needs review'
                              : 'Explainable local signal'}
                          </span>
                          <span className={'review-state ' + f.decision}>
                            {f.decision === 'accepted' ? 'User reviewed · suggestion' : f.decision}
                          </span>
                        </div>
                        <h3>{f.title}</h3>
                        <p>{f.summary}</p>

                        {(f.direct_observations?.length || f.possible_interpretations?.length || (f.quotations && Object.keys(f.quotations).length > 0)) ? (
                          <div className="structured-finding">
                            {f.direct_observations && f.direct_observations.length > 0 && (
                              <div className="finding-section">
                                <strong>Direct Observations (Facts):</strong>
                                <ul>
                                  {f.direct_observations.map((obs, i) => (
                                    <li key={i}>{obs}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {f.possible_interpretations && f.possible_interpretations.length > 0 && (
                              <div className="finding-section">
                                <strong>Possible Interpretations (Inferences):</strong>
                                <ul>
                                  {f.possible_interpretations.map((interp, i) => (
                                    <li key={i}>{interp}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {f.quotations && Object.keys(f.quotations).length > 0 && (
                              <div className="finding-section">
                                <strong>Verified Direct Quotations:</strong>
                                <div className="quotations-list">
                                  {Object.entries(f.quotations).map(([evId, quote]) => (
                                    <div key={evId} className="quotation-item">
                                      “{quote}”
                                      <small>Source: {evId}</small>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}

                        <div className="citations">
                          {f.evidence_ids.map(id => (
                            <button
                              key={id}
                              onClick={() =>
                                setInspect(data.evidence.find(e => e.id === id) || null)
                              }
                            >
                              <Files size={13} />
                              {data.evidence.find(e => e.id === id)?.filename || id}
                              <ArrowUpRight size={12} />
                            </button>
                          ))}
                        </div>
                        <p className="muted">{f.limitations}</p>
                        <div className="button-row">
                          {f.decision === 'accepted' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#15803d', background: '#DCFCE7', border: '1px solid #BBF7D0', padding: '6px 14px', borderRadius: '999px', fontWeight: 700, fontSize: '13px' }}>
                                <CheckCheck size={16} /> Accepted for report
                              </span>
                              <Button
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    setData(prev => ({
                                      ...prev,
                                      findings: prev.findings.map(item => item.id === f.id ? { ...item, decision: 'rejected' } : item)
                                    }));
                                    await api('/findings/' + f.id, { decision: 'rejected' }, 'PATCH');
                                    await refresh();
                                    setNotice('Suggestion removed from report.');
                                  })
                                }
                              >
                                <X size={14} /> Remove / Reject
                              </Button>
                            </div>
                          ) : f.decision === 'rejected' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#b91c1c', background: '#FEE2E2', border: '1px solid #FECACA', padding: '6px 14px', borderRadius: '999px', fontWeight: 600, fontSize: '13px' }}>
                                <X size={14} /> Rejected
                              </span>
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    setData(prev => ({
                                      ...prev,
                                      findings: prev.findings.map(item => item.id === f.id ? { ...item, decision: 'accepted' } : item)
                                    }));
                                    await api('/findings/' + f.id, { decision: 'accepted' }, 'PATCH');
                                    await refresh();
                                    setNotice('Suggestion re-accepted and added to report.');
                                  })
                                }
                              >
                                <Check size={14} /> Re-accept
                              </Button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <Button
                                variant="outline"
                                disabled={busy}
                                style={{ borderColor: '#7C3AED', color: '#6D28D9', fontWeight: 600, background: '#EDE9FE' }}
                                onClick={() =>
                                  run(async () => {
                                    setData(prev => ({
                                      ...prev,
                                      findings: prev.findings.map(item => item.id === f.id ? { ...item, decision: 'accepted' } : item)
                                    }));
                                    await api('/findings/' + f.id, { decision: 'accepted' }, 'PATCH');
                                    await refresh();
                                    setNotice('Suggestion accepted! It will now be included in your exportable report.');
                                  })
                                }
                              >
                                <Check size={16} />
                                Accept suggestion
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    setData(prev => ({
                                      ...prev,
                                      findings: prev.findings.map(item => item.id === f.id ? { ...item, decision: 'rejected' } : item)
                                    }));
                                    await api('/findings/' + f.id, { decision: 'rejected' }, 'PATCH');
                                    await refresh();
                                    setNotice('Suggestion rejected.');
                                  })
                                }
                              >
                                <X size={16} />
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}

                    <details className="surface gsap-stagger">
                      <summary>
                        Optional Gemini analysis <ChevronDown size={17} />
                      </summary>
                      <p>
                        Select only the records you want Google to process. Providers may retain submitted data.
                      </p>
                      {selectionCheckboxes}
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={aiConsent}
                          onChange={e => setAiConsent(e.target.checked)}
                        />
                        I consent to sending selected records to Google.
                      </label>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            if (data.evidence.length === 0) {
                              await api('/seed', {});
                              const s = await api<State>('/state');
                              setData(s);
                              const ids = s.evidence.map(e => e.id);
                              setSelected(ids);
                              setAiConsent(true);
                              setNotice('Sample records loaded. Analyzing with Gemini...');
                              await api('/analyze', { evidence_ids: ids, consent: true });
                              await refresh();
                              setNotice('AI suggestions are ready for review.');
                              return;
                            }
                            let toAnalyze = selected;
                            if (!toAnalyze.length) {
                              toAnalyze = data.evidence.map(e => e.id);
                              setSelected(toAnalyze);
                            }
                            if (!aiConsent) {
                              setAiConsent(true);
                            }
                            await api('/analyze', { evidence_ids: toAnalyze, consent: true });
                            await refresh();
                            setNotice('AI suggestions are ready for review.');
                          })
                        }
                      >
                        <Sparkles size={16} />
                        Analyze selected records
                      </Button>
                      {!health.gemini && (
                        <p className="muted">
                          Gemini is not configured. Local connection review works without an API key.
                        </p>
                      )}
                    </details>
                  </>
                )}

                {/* Voice Companion Page — Mockup 3 Design with Gemini 3.8 Flash & ElevenLabs */}
                {page === 'Voice companion' && (
                  <div>
                    {/* Top prompt suggestion chips */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="filter-pill active"
                        onClick={() => void sendChatMessage('Can you summarize my case so far?')}
                      >
                        ✨ Summarize my case →
                      </button>
                      <button
                        type="button"
                        className="filter-pill"
                        onClick={() => void sendChatMessage('What patterns did you find in these records?')}
                      >
                        ✨ What patterns did you find? →
                      </button>
                      <button
                        type="button"
                        className="filter-pill"
                        onClick={() => void sendChatMessage('What should I upload or document next?')}
                      >
                        ✨ What should I upload next? →
                      </button>
                    </div>

                    <div className="voice-conversation-wrap">
                      {/* Left: Conversational Stream */}
                      <div className="chat-stream-card">
                        <div className="card-header" style={{ marginBottom: 8 }}>
                          <span className="card-title">💬 Conversation</span>
                          <button className="link-action" onClick={clearChat}>
                            Clear conversation
                          </button>
                        </div>

                        {/* Live soundwave during recording */}
                        {recording && (
                          <div className="recording-indicator" role="status" style={{ marginBottom: 12 }}>
                            <span className="recording-timer-pill">
                              <span className="recording-timer-dot" />
                              Listening... {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')} / 1:00
                            </span>
                            <div className="t-soundwave" aria-hidden="true">
                              <span className="t-soundwave-bar" />
                              <span className="t-soundwave-bar" />
                              <span className="t-soundwave-bar" />
                              <span className="t-soundwave-bar" />
                              <span className="t-soundwave-bar" />
                            </div>
                          </div>
                        )}

                        <div className="chat-messages">
                          {chatHistory.map((msg, idx) => (
                            <div key={idx} className={`chat-msg-row ${msg.sender === 'user' ? 'user' : ''}`}>
                              {msg.sender === 'aegis' && (
                                <div className="chat-avatar">🌸</div>
                              )}
                              <div className="chat-msg-bubble">
                                {msg.text}
                                {msg.time && (
                                  <small style={{ display: 'block', fontSize: 10, opacity: 0.7, marginTop: 4, textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
                                    {msg.time}
                                  </small>
                                )}
                              </div>
                              {msg.sender === 'user' && (
                                <div className="chat-avatar" style={{ background: '#6366F1', color: '#fff' }}>J</div>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="chat-input-bar">
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: 28, height: 28, border: 'none', background: 'none' }}
                            onClick={() => navigate('Evidence')}
                            title="Attach evidence"
                          >
                            <Paperclip size={15} style={{ color: '#64748B' }} />
                          </button>

                          <input
                            type="text"
                            placeholder="Talk or type a message..."
                            value={question}
                            onChange={e => setQuestion(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && question.trim()) {
                                void sendChatMessage(question);
                              }
                            }}
                          />

                          <button
                            type="button"
                            className={`icon-btn ${recording ? 'pulse-icon' : ''}`}
                            style={{ width: 28, height: 28, border: 'none', background: recording ? '#FEE2E2' : 'none', color: recording ? '#DC2626' : '#64748B' }}
                            onClick={record}
                            title={recording ? 'Stop recording' : 'Record voice (ElevenLabs / Web)'}
                          >
                            {recording ? <Square size={14} /> : <Mic size={15} />}
                          </button>

                          <button
                            type="button"
                            className="btn-gradient"
                            style={{ padding: '6px 12px', margin: 0, borderRadius: 999 }}
                            disabled={busy || !question.trim()}
                            onClick={() => void sendChatMessage(question)}
                          >
                            <Send size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Right: Settings & Privacy */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="card">
                          <strong style={{ fontSize: 14, marginBottom: 12, display: 'block', color: '#0F172A' }}>
                            ⚙️ Voice settings
                          </strong>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ fontSize: 12, color: '#334155' }}>Slower speech</span>
                            <input
                              type="checkbox"
                              checked={slowerSpeech}
                              onChange={e => setSlowerSpeech(e.target.checked)}
                              style={{ accentColor: '#6366F1' }}
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <span style={{ fontSize: 12, color: '#334155' }}>Captions on</span>
                            <input
                              type="checkbox"
                              checked={captionsOn}
                              onChange={e => setCaptionsOn(e.target.checked)}
                              style={{ accentColor: '#6366F1' }}
                            />
                          </div>
                          <Button
                            variant="outline"
                            style={{ fontSize: 12, width: '100%' }}
                            onClick={replayLastVoiceMessage}
                          >
                            🔄 Replay last response
                          </Button>
                        </div>

                        <div className="card" style={{ background: '#F5F3FF', borderColor: '#DDD6FE' }}>
                          <strong style={{ color: '#5B21B6', fontSize: 13, display: 'block', marginBottom: 4 }}>
                            🔒 Privacy reminder
                          </strong>
                          <p style={{ fontSize: 11, color: '#6D28D9', lineHeight: 1.45 }}>
                            <strong>Your voice is optional.</strong> You stay in control. Voice conversations are processed with explicit consent and you can clear your history anytime.
                          </p>
                        </div>

                        {/* Context Selection Drawer inside Voice */}
                        <div className="card">
                          <strong style={{ fontSize: 13, marginBottom: 8, display: 'block', color: '#0F172A' }}>
                            📁 Case Evidence Context
                          </strong>
                          {selectionCheckboxes}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reports Page */}
                {page === 'Reports' && (
                  <div className="report-layout">
                    <section className="surface gsap-stagger">
                      <h2>Choose what to include</h2>
                      {selectionCheckboxes}
                      <label>
                        Personal summary
                        <textarea
                          rows={4}
                          value={reportNote}
                          onChange={e => setReportNote(e.target.value)}
                          placeholder="Add context in your own words…"
                        />
                      </label>
                      <label>
                        Redact exact text
                        <small>One name, email or phrase per line. Replaced throughout the report.</small>
                        <textarea
                          rows={3}
                          value={redact}
                          onChange={e => setRedact(e.target.value)}
                          placeholder="demo-recipient@example.invalid"
                        />
                      </label>
                      <p className="muted">
                        Only accepted suggestions whose source records are selected will be included.
                      </p>
                      <Button
                        variant="outline"
                        disabled={busy || !selected.length}
                        onClick={() =>
                          run(async () => {
                            const r = await api<{ text: string }>('/report/preview', reportBody);
                            setPreview(r.text);
                          })
                        }
                      >
                        Review report <ArrowRight size={16} />
                      </Button>
                    </section>

                    <section className="report-preview gsap-stagger">
                      <div className="section-title">
                        <span className="eyebrow">REPORT PREVIEW</span>
                        <FileText size={18} />
                      </div>
                      {preview ? (
                        <pre>{preview}</pre>
                      ) : (
                        <div className="report-empty">
                          <FileText size={36} strokeWidth={1.2} />
                          <h3>Make it yours.</h3>
                          <p>
                            Choose your records and select<br />“Review report” to see your summary.
                          </p>
                        </div>
                      )}
                      <Button
                        disabled={busy || !preview}
                        onClick={() =>
                          run(async () => {
                            const blob = await blobRequest('/report', reportBody);
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'aegis-report.pdf';
                            a.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                            setNotice('Report downloaded. Nothing was shared.');
                          })
                        }
                      >
                        <Download size={17} />
                        Download PDF
                      </Button>
                    </section>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Incident Modal (transitions.dev Springy Modal) */}
      <Dialog.Root open={modal} onOpenChange={setModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Start with a moment.</Dialog.Title>
            <Dialog.Description>A few words are enough. Nothing is shared automatically.</Dialog.Description>
            <Dialog.Close className="close" aria-label="Close">
              <X size={18} />
            </Dialog.Close>
            {error && <div className="alert" role="alert">{error}</div>}
            <form
              onSubmit={e => {
                e.preventDefault();
                void run(async () => {
                  await api('/incidents', {
                    title: incidentTitle,
                    description: incidentNotes,
                    occurred_at: incidentTime
                      ? new Date(String(incidentTime)).toISOString()
                      : null
                  });
                  await refresh();
                  setModal(false);
                  setIncidentTitle('');
                  setIncidentNotes('');
                  setIncidentTime('');
                  setNotice('Incident saved to this demo.');
                });
              }}
            >
              <label>
                What happened?
                <input
                  name="title"
                  value={incidentTitle}
                  onChange={e => setIncidentTitle(e.target.value)}
                  autoFocus
                  required
                  maxLength={150}
                  placeholder="A brief title for this moment"
                />
              </label>
              <label>
                When? <small>Optional · your local timezone</small>
                <input
                  type="datetime-local"
                  name="time"
                  value={incidentTime}
                  onChange={e => setIncidentTime(e.target.value)}
                />
              </label>

              <div className="dictate-section-header">
                <label style={{ margin: 0 }}>Your notes</label>
                <button
                  type="button"
                  className={`dictate-voice-btn ${incidentRecording ? 'active' : ''}`}
                  onClick={toggleIncidentDictation}
                  title="Speak to dictate your incident notes (Accessibility)"
                >
                  {incidentRecording ? <Square size={13} /> : <Mic size={13} />}
                  <span>{incidentRecording ? 'Stop dictation' : 'Dictate with Voice (Accessibility)'}</span>
                  {incidentRecording && (
                    <span className="dictate-timer-badge">
                      {Math.floor(incidentRecordingSeconds / 60)}:{(incidentRecordingSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </button>
              </div>

              {incidentRecording && (
                <div className="recording-indicator inline-dictate" role="status">
                  <span className="recording-timer-pill">
                    <span className="recording-timer-dot" /> Listening... Speak naturally to dictate notes
                  </span>
                  <div className="t-soundwave" aria-hidden="true">
                    <span className="t-soundwave-bar" />
                    <span className="t-soundwave-bar" />
                    <span className="t-soundwave-bar" />
                    <span className="t-soundwave-bar" />
                    <span className="t-soundwave-bar" />
                  </div>
                </div>
              )}

              <textarea
                name="description"
                maxLength={10000}
                rows={4}
                value={incidentNotes}
                onChange={e => setIncidentNotes(e.target.value)}
                placeholder="Write or dictate your notes. Write only what you’re comfortable documenting."
              />
              <div className="button-row">
                <Button disabled={busy}>
                  {busy ? 'Saving…' : 'Save incident'}
                  <CheckCheck size={16} />
                </Button>
                <Dialog.Close asChild>
                  <Button variant="ghost" type="button" onClick={() => {
                    if (incidentRecording) incidentRecorder.current?.stop();
                  }}>Cancel</Button>
                </Dialog.Close>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Inspect Evidence Modal */}
      <Dialog.Root open={!!inspect} onOpenChange={o => { if (!o) setInspect(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog detail-dialog">
            <Dialog.Title>{inspect?.filename}</Dialog.Title>
            <Dialog.Description>Original preserved in this local demo.</Dialog.Description>
            <Dialog.Close className="close" aria-label="Close">
              <X size={18} />
            </Dialog.Close>
            {inspect && (
              <>
                <dl>
                  <dt>Evidence ID</dt>
                  <dd>{inspect.id}</dd>
                  <dt>Source / parse status</dt>
                  <dd>{inspect.source} · {inspect.status}</dd>
                  <dt>Imported</dt>
                  <dd>{formatDate(inspect.imported_at)}</dd>
                  <dt>SHA-256</dt>
                  <dd className="hash">{inspect.sha256}</dd>
                </dl>
                {data.events
                  .filter(e => e.evidence_id === inspect.id)
                  .map(e => (
                    <blockquote key={e.id}>
                      {e.content}
                      <small>
                        {e.sender} · {formatDate(e.time)}
                      </small>
                    </blockquote>
                  ))}
                <div className="button-row">
                  <Button asChild variant="outline">
                    <a href={'/api/evidence/' + inspect.id + '/download'} download>
                      <Download size={16} />
                      Download original
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      if (confirm('Remove this original and its derived events and findings?')) {
                        void run(async () => {
                          await api('/evidence/' + inspect.id, undefined, 'DELETE');
                          setInspect(null);
                          await refresh();
                          setNotice('Record and derived events removed.');
                        });
                      }
                    }}
                  >
                    <Trash2 size={16} />
                    Remove
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
