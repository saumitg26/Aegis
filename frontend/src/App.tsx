import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Shield, House, FolderHeart, Files, Route, Network, AudioLines, FileText,
  ArrowUpRight, ArrowRight, Plus, ChevronRight, Check, Upload, Search, X,
  Download, Mail, MessageSquare, LockKeyhole, Leaf, Info, Mic, Square, Play,
  CheckCheck, Trash2, NotebookPen, ChevronDown, Volume2, VolumeX, Sparkles,
  Compass, ArrowDown, Clock, ShieldCheck, HelpCircle, Paperclip, Send, Bell, Pause
} from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { api, blobRequest, type State, type Evidence, type AuthUser } from './api';
import { Button } from './components/ui/button';
import { VoiceCapture } from './components/VoiceCapture';

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

function getRecordChipMeta(ev?: Evidence | null, fallbackId?: string) {
  if (!ev) {
    return { icon: '📋', label: fallbackId || 'Record' };
  }
  const name = (ev.filename || '').toLowerCase();
  const src = (ev.source || '').toLowerCase();
  if (name.includes('email') || name.endsWith('.eml') || name.endsWith('.msg') || src.includes('email')) {
    return { icon: '✉️', label: 'Email record' };
  }
  if (name.includes('chat') || name.includes('slack') || name.includes('sms') || name.includes('discord') || name.includes('signal') || name.includes('imessage') || src.includes('chat')) {
    return { icon: '💬', label: 'Chat record' };
  }
  if (name.includes('audio') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.m4a') || name.endsWith('.webm') || src.includes('audio')) {
    return { icon: '🎙️', label: 'Voice / Audio record' };
  }
  if (name.includes('screenshot') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || src.includes('screenshot')) {
    return { icon: '🖼️', label: 'Screenshot record' };
  }
  if (name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.txt')) {
    return { icon: '📄', label: 'Document record' };
  }
  return { icon: '📋', label: ev.filename || fallbackId || 'Record' };
}

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
  const [audioUrl, setAudioUrl] = useState('');
  const [userRecordedUrl, setUserRecordedUrl] = useState('');
  const [isSpeakingBrowser, setIsSpeakingBrowser] = useState(false);

  // Incident modal voice dictation state (Accessibility)
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentTime, setIncidentTime] = useState('');
  const [incidentNotes, setIncidentNotes] = useState('');

  // Modern Companion UI State
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
  const [evidenceFilter, setEvidenceFilter] = useState<'All' | 'Messages' | 'Emails' | 'Screenshots'>('All');
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'aegis'; text: string; time?: string }>>([]);
  const [slowerSpeech, setSlowerSpeech] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);

  // Voice Documentation Companion: 3 Modes ('story' | 'recordings' | 'explore')
  const [voiceMode, setVoiceMode] = useState<'story' | 'recordings' | 'explore'>('story');

  // Mode 1: Tell My Story State
  const [storyStep, setStoryStep] = useState(0);
  const [storyTypedInput, setStoryTypedInput] = useState('');
  const [storySpeechTranscript, setStorySpeechTranscript] = useState('');
  const [storyExtracting, setStoryExtracting] = useState(false);
  const [storyIncidentDraft, setStoryIncidentDraft] = useState<{
    suggested_title: string;
    incident_date: string;
    platform: string;
    what_happened: string;
    missing_information: string;
    associated_evidence: string[];
    user_reported_disclaimer: string;
  } | null>(null);

  // Mode 2: Audio Evidence Review State
  const [audioAnalysis, setAudioAnalysis] = useState<{
    filename: string;
    sha256: string;
    duration_seconds: number;
    speakers: string[];
    turns: { speaker: string; start: number; end: number; text: string }[];
    words: { text: string; start: number; end: number; speaker: string }[];
    text: string;
    limitations: string;
  } | null>(null);
  const [audioFile,setAudioFile]=useState<File|null>(null);
  const [evidenceAudioUrl,setEvidenceAudioUrl]=useState('');
  const evidencePlayer=useRef<HTMLAudioElement|null>(null);
  const [storyTime,setStoryTime]=useState('');
  useEffect(()=>{if(!audioFile)return;const url=URL.createObjectURL(audioFile);setEvidenceAudioUrl(url);return()=>URL.revokeObjectURL(url)},[audioFile]);
  const [audioAnalyzing, setAudioAnalyzing] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioPlaybackTime, setAudioPlaybackTime] = useState(0);
  const [momentSavedToast, setMomentSavedToast] = useState('');

  // User Authentication & Vultr SSO state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
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
      const res = await api<{ token: string | null; user: AuthUser }>('/auth/sso', { provider });
      if (res.token) {
        localStorage.setItem('aegis_auth_token', res.token);
      } else {
        localStorage.removeItem('aegis_auth_token');
      }
      localStorage.setItem('aegis_user', JSON.stringify(res.user));
      setCurrentUser(res.user);
      await refresh();
      if (provider === 'vultr') {
        setNotice('Signed in with Vultr Cloud SSO (EWR Enclave). Your session is cryptographically isolated.');
      } else {
        setNotice('Demo workspace ready. Your changes stay in this temporary browser session.');
      }
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);


  async function refresh() {
    const state = await api<State>('/state');
    setData(state);
    setSelected(old => old.filter(id => state.evidence.some(e => e.id === id)));
  }

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('vultr') === 'success') {
      setNotice('Signed in with Vultr Cloud SSO (EWR Enclave). Your session is cryptographically isolated.');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('sso') === 'vultr-sandbox') {
      handleSSOLogin('vultr');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('error') === 'vultr_oauth_failed') {
      setError('Vultr OAuth authentication failed or was cancelled.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    Promise.all([api<State>('/state'), api<typeof health>('/health'), api<{session_active:boolean;user:AuthUser|null}>('/auth/me')])
      .then(([state, h, session]) => {
        if(session.session_active && session.user) setCurrentUser(session.user);
        setData(state);
        setHealth(h);
        setSelected(state.evidence.map(e => e.id));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    return () => {
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
    audioRef.current?.pause();
    evidencePlayer.current?.pause();
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

  // Handle TTS or Browser Speech Synthesis
  function handleSpeakResponse() {
    if (!consent) { setError('Choose explicit ElevenLabs consent before requesting speech.'); return; }
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
        consent: aiConsent
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
    const textToSpeak = lastAegis ? lastAegis.text : answer || 'No response is available to play.';
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

  const guidedQuestions = [
    {
      eyebrow: "Step 1 of 4 · The Beginning",
      question: "Can you tell me when this started and what happened first?",
      hint: "E.g., dates, times, or the earliest message or encounter you remember."
    },
    {
      eyebrow: "Step 2 of 4 · Platform & Channels",
      question: "Where did this take place? (e.g. Discord, work email, SMS, phone call)",
      hint: "Mention specific channels, apps, or usernames if you recall."
    },
    {
      eyebrow: "Step 3 of 4 · Words & Actions",
      question: "Who was involved or what specific words or actions caused concern?",
      hint: "Direct quotations, threats, unwanted persistent contact, or demands."
    },
    {
      eyebrow: "Step 4 of 4 · Additional Context",
      question: "Is there any other context, dates, or records you'd like to include?",
      hint: "Previous warnings, cease requests, or associated screenshots/files."
    }
  ];

  async function handleProcessStory(customText?: string) {
    const rawText = customText || storyTypedInput || storySpeechTranscript;
    if (!rawText.trim()) return;
    setStoryExtracting(true);
    try {
      const res = await api<{ draft: any }>('/voice/story-extract', {
        story_text: rawText,
        evidence_ids: selected, consent: aiConsent
      });
      if (res.draft) {
        setStoryIncidentDraft(res.draft);
        setNotice('Story organized into a structured incident draft! Review below before saving.');
      }
    } catch (e: any) {
      setError(e.message || 'Story extraction failed.');
    } finally {
      setStoryExtracting(false);
    }
  }

  async function handleSaveStoryIncident() {
    if (!storyIncidentDraft) return;
    await run(async () => {
      await api('/incidents', {
        title: storyIncidentDraft.suggested_title,
        description: `${storyIncidentDraft.what_happened}\n\nPlatform: ${storyIncidentDraft.platform}\nReported date: ${storyIncidentDraft.incident_date}\n\nNote: ${storyIncidentDraft.missing_information}`,
        occurred_at: storyTime ? new Date(storyTime).toISOString() : null
      }, 'POST');
      await refresh();
      setNotice('Incident saved directly to your case timeline and narrative!');
      setStoryIncidentDraft(null);
      setStoryTypedInput('');
      setStorySpeechTranscript('');
      setStoryStep(0);
    });
  }

  async function handleAnalyzeAudio(artifactId?: string, fileObj?: File) {
    if (!consent) {setError('Consent to ElevenLabs processing before analyzing audio.');return;}
    const chosenFile=fileObj||audioFile;
    setAudioAnalysis(null);
    setAudioAnalyzing(true);
    try {
      const fd = new FormData();
      if (chosenFile) {
        fd.append('file', chosenFile, chosenFile.name);
      } else if (artifactId) {
        fd.append('artifact_id', artifactId);
        setEvidenceAudioUrl('/api/evidence/'+artifactId+'/download');
      } else {setEvidenceAudioUrl('/api/demo/audio');}
      fd.append('consent', 'true');
      const res = await api<any>('/voice/analyze-audio', fd);
      setAudioAnalysis(res);
      setAudioPlaybackTime(0);
      setAudioPlaying(false);
      setNotice('Audio transcribed with ElevenLabs Scribe speaker diarization!');
    } catch (e: any) {
      setError(e.message || 'Audio analysis failed.');
    } finally {
      setAudioAnalyzing(false);
    }
  }

  function handleSaveMoment(turn: { speaker: string; start: number; end: number; text: string }) {
    const mins = Math.floor(turn.start / 60);
    const secs = Math.floor(turn.start % 60);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const excerpt = `${turn.speaker} [${timeStr}]: "${turn.text}"`;
    setMomentSavedToast(excerpt);
    setNotice(`Moment from ${turn.speaker} (${timeStr}) captured! Ready to link to incident.`);
    setTimeout(() => setMomentSavedToast(''), 4500);
  }

  const pendingFindingsCount = data.findings.filter(f => f.decision === 'pending' || f.decision === 'review_later').length;

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
              Turn scattered records into a clear, source-linked account. Try the full workflow with fictional evidence.
            </div>
          </div>

          {error && <div className="banner error" style={{ width: '100%', marginBottom: 16 }}>{error}</div>}
          {notice && <div className="banner success" style={{ width: '100%', marginBottom: 16 }}>{notice}</div>}

          <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            Your demo workspace supports uploads, voice, analysis and PDF reports. Isolated in temporary guest storage. Use fictional data only.
          </p>

          <div className="sso-buttons-stack" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              className="sso-vultr-btn"
              onClick={() => handleSSOLogin('vultr')}
              disabled={ssoLoading}
            >
              <ShieldCheck size={18} />
              <span>{ssoLoading ? 'Authenticating with Vultr…' : 'Continue with Vultr SSO'}</span>
            </button>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: -4, marginBottom: 4, textAlign: 'center' }}>
              Isolated High-Frequency compute & cryptographic enclave (EWR)
            </div>

            <button
              className="sso-demo-btn"
              onClick={() => handleSSOLogin('demo')}
              disabled={ssoLoading}
            >
              <span>Try Interactive Guest Demo</span>
            </button>
          </div>

          <details style={{ width: '100%', marginTop: 20, fontSize: 12, color: '#64748B', textAlign: 'left', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 12px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
              ⚙️ Vultr OAuth Application Setup (Optional)
            </summary>
            <div style={{ marginTop: 8, lineHeight: 1.5 }}>
              <p style={{ margin: '4px 0' }}>
                To connect a live organization application from the <strong>Vultr Customer Portal</strong>:
              </p>
              <ol style={{ paddingLeft: 18, margin: '4px 0' }}>
                <li>Register an OAuth app under <strong>Account &gt; API / OAuth</strong>.</li>
                <li>Set Callback URL to: <code style={{ background: '#F1F5F9', padding: '2px 4px', borderRadius: 4 }}>{window.location.origin}/api/auth/vultr/callback</code></li>
                <li>Configure <code style={{ background: '#F1F5F9', padding: '2px 4px', borderRadius: 4 }}>VULTR_CLIENT_ID</code> and <code style={{ background: '#F1F5F9', padding: '2px 4px', borderRadius: 4 }}>VULTR_CLIENT_SECRET</code> in environment.</li>
              </ol>
              <p style={{ margin: '4px 0', color: '#059669', fontWeight: 500 }}>
                ✓ Without live credentials, "Continue with Vultr SSO" runs in Vultr Cloud Sandbox Enclave mode with full access to all features.
              </p>
            </div>
          </details>

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
          <span className="sidebar-companion-icon">🛡️</span>
          <div className="sidebar-companion-title">Your demo workspace</div>
          <div className="sidebar-companion-text">
            Organize your records calmly and at your own pace. You decide what to document, review, and export.
          </div>
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
            <button className="icon-btn" title="Interactive Demo Workspace" onClick={() => navigate('Insights')}>
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
              <span className="user-name">{currentUser?.provider_id === 'vultr' ? 'Jamie (Vultr)' : (currentUser?.name?.split(' ')[0] || 'Demo')}</span>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>{profileOpen ? '▲' : '▼'}</span>

              {profileOpen && (
                <div className="profile-popover" onClick={e => e.stopPropagation()}>
                  <div className="profile-popover-header">
                    <div className="profile-header-avatar">
                      {currentUser?.avatar_initials || 'J'}
                    </div>
                    <div className="profile-header-meta">
                      <div className="profile-header-name">{currentUser?.name || 'Demo visitor'}</div>
                      <div className="profile-header-email">{currentUser?.email || 'No account'}</div>
                    </div>
                  </div>

                  <div className="vultr-status-badge">
                    <ShieldCheck size={14} />
                    <span>{currentUser?.provider || 'Synthetic preview — no authentication'}</span>
                  </div>

                  {currentUser?.provider_id === 'vultr' && (
                    <div className="vultr-meta-card">
                      <div className="vultr-meta-row">
                        <span>Datacenter Enclave</span>
                        <strong>{currentUser.vultr_region_name || 'New Jersey (EWR)'}</strong>
                      </div>
                      <div className="vultr-meta-row">
                        <span>Instance ID</span>
                        <strong>{currentUser.vultr_instance_id || 'vultr-inst-49204'}</strong>
                      </div>
                      <div className="vultr-meta-row">
                        <span>Zero-Trust Enclave</span>
                        <strong>{currentUser.vultr_datacenter || 'Vultr Core Enclave'}</strong>
                      </div>
                      <div className="vultr-meta-row">
                        <span>Hardware Security</span>
                        <strong>{currentUser.encryption_standard || 'AES-256-GCM / SHA-256'}</strong>
                      </div>
                    </div>
                  )}

                  <p className="muted">
                    {currentUser?.provider_id === 'vultr'
                      ? 'Cryptographically isolated Vultr Cloud enclave session. Use fictional data only.'
                      : 'Temporary guest workspace. Changes are isolated from other demo visitors and are not permanent storage.'}
                  </p>

                  <button className="profile-signout-btn" onClick={handleSignOut}>
                    <LockKeyhole size={14} />
                    <span>End demo session</span>
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

        <div className="demo-safety-banner" role="note">Interactive demo · Your workspace expires after two hours or a server restart. Use fictional records. External AI requires your consent.</div>
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
                  <section className="home-simple"><h1 ref={heading} tabIndex={-1}>One step at a time.</h1><p>Keep a clear record of what happened. You decide what comes next.</p><Button onClick={()=>setModal(true)}>Document an incident</Button><h2>{data.case?.title||'Your case'}</h2><p>{data.incidents.length} documented incidents · {data.evidence.length} records</p><h2>Recent records</h2>{data.evidence.length?data.evidence.slice(-3).reverse().map(e=><button className="record" key={e.id} onClick={()=>setInspect(e)}><FileText size={18}/><span>{e.filename}<small>{formatDate(e.original_time)}</small></span></button>):<p>No records yet. Add synthetic evidence to get started.</p>}</section>
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
                            <td>Dates shown in your timeline</td>
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
                            Upload anything that feels relevant — even if you're not sure. Every file is cryptographically hashed with SHA-256 for a recorded file fingerprint; this does not establish authenticity or legal admissibility.
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
                                    <span className="badge-status badge-reviewed">Fingerprint recorded</span>
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
                                <span className="badge-status badge-reviewed">Fingerprint recorded</span>
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

                    {data.findings.map(f => {
                      const isSaved = f.decision === 'saved_pattern' || f.decision === 'accepted';
                      const isNotRelevant = f.decision === 'not_relevant' || f.decision === 'rejected';
                      const isReviewLater = f.decision === 'review_later';

                      const statusClass = isSaved
                        ? 'status-saved'
                        : isNotRelevant
                        ? 'status-not-relevant'
                        : isReviewLater
                        ? 'status-review-later'
                        : 'status-pending';

                      const statusLabel = isSaved
                        ? '✓ Saved as possible pattern'
                        : isNotRelevant
                        ? 'Marked not relevant'
                        : isReviewLater
                        ? 'Saved for later review'
                        : 'Possible connection · Awaiting your review';

                      return (
                        <article className="finding-conversational-card gsap-stagger" key={f.id} id={`finding-${f.id}`}>
                          {/* Header Eyebrow & Status Badge */}
                          <div className="finding-header-row">
                            <span className="finding-eyebrow">
                              <Sparkles size={13} />
                              AEGIS noticed something
                            </span>
                            <span className={`finding-status-pill ${statusClass}`}>
                              {statusLabel}
                            </span>
                          </div>

                          {/* Human-First Title & Summary */}
                          <h3 className="finding-title">{f.title}</h3>
                          <p className="finding-summary">{f.summary}</p>

                          {/* Observations: "Here's what we noticed" */}
                          {f.direct_observations && f.direct_observations.length > 0 && (
                            <div className="what-we-noticed-section">
                              <div className="what-we-noticed-title">Here’s what we noticed</div>
                              <ul className="what-we-noticed-list">
                                {f.direct_observations.map((obs, i) => (
                                  <li key={i}>{obs}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Inferences / Interpretations (if any) */}
                          {f.possible_interpretations && f.possible_interpretations.length > 0 && (
                            <div className="what-this-might-mean-section">
                              <div className="what-this-might-mean-title">What this might mean</div>
                              <ul className="what-this-might-mean-list">
                                {f.possible_interpretations.map((interp, i) => (
                                  <li key={i}>{interp}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Supporting records chips */}
                          {f.evidence_ids && f.evidence_ids.length > 0 && (
                            <div className="supporting-records-section">
                              <span className="supporting-records-label">Supporting records:</span>
                              <div className="supporting-records-chips">
                                {f.evidence_ids.map(id => {
                                  const ev = data.evidence.find(e => e.id === id);
                                  const meta = getRecordChipMeta(ev, id);
                                  return (
                                    <button
                                      key={id}
                                      type="button"
                                      className="supporting-record-chip"
                                      title={`Click to inspect original record: ${ev?.filename || id}`}
                                      onClick={() => setInspect(ev || null)}
                                    >
                                      <span>{meta.icon}</span>
                                      <span>{meta.label}</span>
                                      <ArrowUpRight size={12} style={{ color: '#94A3B8' }} />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Interactive Review Box */}
                          <div className="finding-review-box">
                            {isSaved ? (
                              <div className="finding-decision-feedback saved">
                                <span className="decision-feedback-text">
                                  <CheckCheck size={16} />
                                  Saved as possible pattern for your records
                                </span>
                                <button
                                  type="button"
                                  className="btn-change-decision"
                                  disabled={busy}
                                  onClick={() =>
                                    run(async () => {
                                      setData(prev => ({
                                        ...prev,
                                        findings: prev.findings.map(item => item.id === f.id ? { ...item, decision: 'pending' } : item)
                                      }));
                                      await api('/findings/' + f.id, { decision: 'pending' }, 'PATCH');
                                      await refresh();
                                      setNotice('Decision reset. You can review this finding again.');
                                    })
                                  }
                                >
                                  Change decision
                                </button>
                              </div>
                            ) : isNotRelevant ? (
                              <div className="finding-decision-feedback not-relevant">
                                <span className="decision-feedback-text">
                                  <X size={15} />
                                  Marked not relevant to your experience
                                </span>
                                <button
                                  type="button"
                                  className="btn-change-decision"
                                  disabled={busy}
                                  onClick={() =>
                                    run(async () => {
                                      setData(prev => ({
                                        ...prev,
                                        findings: prev.findings.map(item => item.id === f.id ? { ...item, decision: 'pending' } : item)
                                      }));
                                      await api('/findings/' + f.id, { decision: 'pending' }, 'PATCH');
                                      await refresh();
                                      setNotice('Decision reset. You can review this finding again.');
                                    })
                                  }
                                >
                                  Change decision
                                </button>
                              </div>
                            ) : isReviewLater ? (
                              <div className="finding-decision-feedback">
                                <span className="decision-feedback-text" style={{ color: '#92400E' }}>
                                  <Clock size={15} />
                                  Saved for later review
                                </span>
                                <button
                                  type="button"
                                  className="btn-change-decision"
                                  disabled={busy}
                                  onClick={() =>
                                    run(async () => {
                                      setData(prev => ({
                                        ...prev,
                                        findings: prev.findings.map(item => item.id === f.id ? { ...item, decision: 'pending' } : item)
                                      }));
                                      await api('/findings/' + f.id, { decision: 'pending' }, 'PATCH');
                                      await refresh();
                                      setNotice('Ready to review now.');
                                    })
                                  }
                                >
                                  Review now
                                </button>
                              </div>
                            ) : (
                              <div className="finding-actions-cluster">
                                <div className="finding-review-question">
                                  Does this connection seem relevant to your experience?
                                </div>
                                <div className="finding-primary-actions">
                                  <button
                                    type="button"
                                    className="btn-save-pattern"
                                    disabled={busy}
                                    onClick={() =>
                                      run(async () => {
                                        setData(prev => ({
                                          ...prev,
                                          findings: prev.findings.map(item => item.id === f.id ? { ...item, decision: 'saved_pattern' } : item)
                                        }));
                                        await api('/findings/' + f.id, { decision: 'saved_pattern' }, 'PATCH');
                                        await refresh();
                                        setNotice('Connection saved as a possible pattern for your records.');
                                      })
                                    }
                                  >
                                    <Check size={15} />
                                    Save as possible pattern
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-not-relevant"
                                    disabled={busy}
                                    onClick={() =>
                                      run(async () => {
                                        setData(prev => ({
                                          ...prev,
                                          findings: prev.findings.map(item => item.id === f.id ? { ...item, decision: 'not_relevant' } : item)
                                        }));
                                        await api('/findings/' + f.id, { decision: 'not_relevant' }, 'PATCH');
                                        await refresh();
                                        setNotice('Connection marked as not relevant.');
                                      })
                                    }
                                  >
                                    <X size={14} />
                                    Not relevant
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  className="btn-review-later"
                                  disabled={busy}
                                  onClick={() =>
                                    run(async () => {
                                      setData(prev => ({
                                        ...prev,
                                        findings: prev.findings.map(item => item.id === f.id ? { ...item, decision: 'review_later' } : item)
                                      }));
                                      await api('/findings/' + f.id, { decision: 'review_later' }, 'PATCH');
                                      await refresh();
                                      setNotice('Saved for later. You can review this finding at any time.');
                                    })
                                  }
                                >
                                  I’m not sure yet — review later
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Expandable Disclosure: Exact quotes and technical details */}
                          <details className="finding-technical-details">
                            <summary>
                              <span>▾ View exact quotes and technical details</span>
                              <ChevronDown size={14} className="disclosure-icon" />
                            </summary>
                            <div className="technical-details-content">
                              {f.quotations && Object.keys(f.quotations).length > 0 && (
                                <div className="tech-section">
                                  <strong>Exact excerpts from your records:</strong>
                                  <div className="quotations-list">
                                    {Object.entries(f.quotations).map(([evId, quote]) => {
                                      const ev = data.evidence.find(e => e.id === evId);
                                      return (
                                        <div key={evId} className="quotation-item">
                                          “{quote}”
                                          <small>Source record: {ev?.filename || evId}</small>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              <div className="tech-section">
                                <strong>Cryptographic hashes & identifiers:</strong>
                                <div className="tech-records-grid">
                                  {f.evidence_ids.map(id => {
                                    const ev = data.evidence.find(e => e.id === id);
                                    return (
                                      <div key={id} className="tech-record-meta">
                                        <span>{ev?.filename || id}:</span>
                                        <code>SHA-256: {ev?.sha256 ? `${ev.sha256.slice(0, 16)}...` : 'N/A'}</code>
                                        <span className="muted">({ev?.imported_at ? new Date(ev.imported_at).toLocaleDateString() : 'Import time unknown'})</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="tech-section">
                                <strong>Forensic transparency & limitations:</strong>
                                <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                                  {f.limitations || 'Findings are pattern suggestions based on exact matches or temporal clusters across submitted records.'}
                                </p>
                                <p className="muted" style={{ margin: '6px 0 0 0', fontSize: 11, fontStyle: 'italic' }}>
                                  Note: Saving a pattern indicates that you find this connection relevant to organizing your personal narrative. It is not an independent technical verification of identity, authorship, or causation.
                                </p>
                              </div>
                            </div>
                          </details>
                        </article>
                      );
                    })}

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
                              if(!aiConsent)throw Error('Please consent to Google processing first.');
                              setNotice('Sample records loaded. Analyzing with Gemini...');
                              if(!aiConsent)throw Error('Please consent to Google processing first.');
                              await api('/analyze', { evidence_ids: ids, consent: aiConsent });
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
                              if(!aiConsent)throw Error('Please consent to Google processing first.');
                            }
                            if(!aiConsent)throw Error('Please consent to Google processing first.');
                            await api('/analyze', { evidence_ids: toAnalyze, consent: aiConsent });
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

                {/* Voice Companion Page — Multi-Mode Experience (ElevenLabs + Gemini) */}
                {page === 'Voice companion' && (
                  <div>
                    {/* Top Segmented Mode Tabs */}
                    <div className="voice-mode-tabs">
                      <button
                        type="button"
                        className={`voice-mode-tab ${voiceMode === 'story' ? 'active' : ''}`}
                        onClick={() => setVoiceMode('story')}
                      >
                        <Mic size={16} />
                        <span>Tell My Story</span>
                        <span className="voice-mode-badge">Guided</span>
                      </button>

                      <button
                        type="button"
                        className={`voice-mode-tab ${voiceMode === 'recordings' ? 'active' : ''}`}
                        onClick={() => {
                          setVoiceMode('recordings');
                          if (!audioAnalysis) {
                            void handleAnalyzeAudio();
                          }
                        }}
                      >
                        <AudioLines size={16} />
                        <span>Review Recordings</span>
                        <span className="voice-mode-badge" style={{ background: '#ECFDF5', color: '#047857' }}>Scribe Diarization</span>
                      </button>

                      <button
                        type="button"
                        className={`voice-mode-tab ${voiceMode === 'explore' ? 'active' : ''}`}
                        onClick={() => setVoiceMode('explore')}
                      >
                        <MessageSquare size={16} />
                        <span>Explore My Case</span>
                        <span className="voice-mode-badge" style={{ background: '#FAF5FF', color: '#7E22CE' }}>Q&A</span>
                      </button>
                    </div>

                    {/* MODE 1: TELL MY STORY (Guided Story Recording) */}
                    {voiceMode === 'story' && (
                      <div className="story-recording-container">
                        <div className="story-reassurance-header">
                          <h2 className="story-reassurance-title">Take your time. I'm listening.</h2>
                          <p className="story-reassurance-sub">
                            You can pause, skip questions, or type instead. AEGIS will turn your conversation into a timeline and show you a draft before anything is saved.
                          </p>
                          <div className="story-stepper-container">
                            {[0, 1, 2, 3].map(stepIdx => (
                              <div
                                key={stepIdx}
                                className={`story-step-dot ${storyStep === stepIdx ? 'active' : storyStep > stepIdx ? 'completed' : ''}`}
                                onClick={() => setStoryStep(stepIdx)}
                                title={`Step ${stepIdx + 1}`}
                                style={{ cursor: 'pointer' }}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Current Guided Question Card */}
                        <div className="story-prompt-card">
                          <div className="story-prompt-eyebrow">
                            {guidedQuestions[storyStep].eyebrow}
                          </div>
                          <h3 className="story-prompt-question">
                            "{guidedQuestions[storyStep].question}"
                          </h3>
                          <small style={{ color: '#64748B', display: 'block', marginTop: 6 }}>
                            💡 {guidedQuestions[storyStep].hint}
                          </small>
                        </div>

                        <VoiceCapture enabled={health.voice} onTranscript={text=>setStoryTypedInput(previous=>[previous,text].filter(Boolean).join('\n'))}/>
                        <label>Optional incident date and time (your timezone)<input type="datetime-local" value={storyTime} onChange={e=>setStoryTime(e.target.value)}/></label>
                        <label><input type="checkbox" checked={aiConsent} onChange={e=>setAiConsent(e.target.checked)}/>Send this story to Google for an AI draft. Without consent, keep a local draft of my own words.</label>
                        {/* Optional Typed Input Box */}
                        <div className="card" style={{ marginBottom: 20 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <strong style={{ fontSize: 13, color: '#0F172A' }}>Type instead or add details</strong>
                            <small style={{ color: '#64748B' }}>Typed and spoken notes are combined</small>
                          </div>
                          <textarea
                            className="draft-field-textarea"
                            rows={3}
                            placeholder="Type what happened, or add details to your spoken account..."
                            value={storyTypedInput}
                            onChange={e => setStoryTypedInput(e.target.value)}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {storyStep > 0 && (
                                <button
                                  type="button"
                                  className="btn-change-decision"
                                  onClick={() => setStoryStep(prev => prev - 1)}
                                >
                                  ← Previous question
                                </button>
                              )}
                              {storyStep < guidedQuestions.length - 1 && (
                                <button
                                  type="button"
                                  className="btn-change-decision"
                                  onClick={() => setStoryStep(prev => prev + 1)}
                                >
                                  Next question →
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              className="btn-gradient"
                              style={{ padding: '8px 18px', margin: 0, borderRadius: 8, fontSize: 13 }}
                              disabled={storyExtracting || (!storyTypedInput.trim() && !storySpeechTranscript.trim())}
                              onClick={() => void handleProcessStory()}
                            >
                              <Sparkles size={14} />
                              <span>{storyExtracting ? 'Analyzing with Gemini...' : 'Generate Incident Draft ✨'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Generated Structured Incident Draft Preview */}
                        {storyIncidentDraft && (
                          <div className="incident-draft-card gsap-stagger">
                            <div className="incident-draft-header">
                              <div>
                                <h3 style={{ margin: 0, fontSize: 18, color: '#1E1B4B' }}>
                                  Your incident draft
                                </h3>
                                <small style={{ color: '#64748B' }}>
                                  Review and confirm all details before saving to your case.
                                </small>
                              </div>
                              <span className="user-reported-badge">
                                ⚠️ User-reported · pending verification
                              </span>
                            </div>

                            <div className="draft-fields-grid">
                              <div className="draft-field-row">
                                <label className="draft-field-label">Incident Title</label>
                                <input
                                  type="text"
                                  className="draft-field-input"
                                  value={storyIncidentDraft.suggested_title}
                                  onChange={e => setStoryIncidentDraft({ ...storyIncidentDraft, suggested_title: e.target.value })}
                                />
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div className="draft-field-row">
                                  <label className="draft-field-label">Reported Date</label>
                                  <input
                                    type="text"
                                    className="draft-field-input"
                                    value={storyIncidentDraft.incident_date}
                                    onChange={e => setStoryIncidentDraft({ ...storyIncidentDraft, incident_date: e.target.value })}
                                  />
                                </div>

                                <div className="draft-field-row">
                                  <label className="draft-field-label">Platform / Channel</label>
                                  <input
                                    type="text"
                                    className="draft-field-input"
                                    value={storyIncidentDraft.platform}
                                    onChange={e => setStoryIncidentDraft({ ...storyIncidentDraft, platform: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div className="draft-field-row">
                                <label className="draft-field-label">What Happened (Summary)</label>
                                <textarea
                                  className="draft-field-textarea"
                                  rows={4}
                                  value={storyIncidentDraft.what_happened}
                                  onChange={e => setStoryIncidentDraft({ ...storyIncidentDraft, what_happened: e.target.value })}
                                />
                              </div>

                              <div className="draft-field-row">
                                <label className="draft-field-label">Missing or Uncertain Information</label>
                                <input
                                  type="text"
                                  className="draft-field-input"
                                  style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}
                                  value={storyIncidentDraft.missing_information}
                                  onChange={e => setStoryIncidentDraft({ ...storyIncidentDraft, missing_information: e.target.value })}
                                />
                              </div>

                              <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, fontSize: 12, color: '#64748B' }}>
                                🛡️ <em>{storyIncidentDraft.user_reported_disclaimer}</em>
                              </div>

                              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn-save-pattern"
                                  onClick={() => void handleSaveStoryIncident()}
                                >
                                  <Check size={16} />
                                  <span>Save Incident to Timeline & My Case</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn-not-relevant"
                                  onClick={() => setStoryIncidentDraft(null)}
                                >
                                  Discard draft
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* MODE 2: REVIEW RECORDINGS (Audio Evidence Analyzer) */}
                    {voiceMode === 'recordings' && (
                      <div><label className="check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I consent to sending selected audio to ElevenLabs. The provider may retain it.</label>
                      {evidenceAudioUrl&&<audio ref={evidencePlayer} src={evidenceAudioUrl} controls onTimeUpdate={e=>setAudioPlaybackTime(e.currentTarget.currentTime)} onPlay={()=>setAudioPlaying(true)} onPause={()=>setAudioPlaying(false)} onEnded={()=>setAudioPlaying(false)} aria-label="Original audio recording"/>}

                        {momentSavedToast && (
                          <div className="banner success" style={{ marginBottom: 16 }}>
                            📌 <strong>Moment Captured:</strong> {momentSavedToast}
                          </div>
                        )}

                        <div className="audio-evidence-player-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                            <div>
                              <h3 style={{ margin: 0, fontSize: 18, color: '#0F172A' }}>
                                Recording Review — ElevenLabs Scribe
                              </h3>
                              <small style={{ color: '#64748B' }}>
                                {audioAnalysis ? `${audioAnalysis.filename} · Duration: ${Math.floor(audioAnalysis.duration_seconds / 60)}:${Math.floor(audioAnalysis.duration_seconds % 60).toString().padStart(2, '0')} · Synthetic Demo Audio` : 'Select or upload an audio file to inspect speaker turns'}
                              </small>
                            </div>

                            <div style={{ display: 'flex', gap: 8 }}>
                              <label className="btn-change-decision" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Upload size={14} />
                                <span>Upload Audio</span>
                                <input
                                  type="file"
                                  accept="audio/*"
                                  style={{ display: 'none' }}
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (f) {setAudioFile(f);setAudioAnalysis(null);setAudioPlaying(false);}
                                  }}
                                />
                              </label>

                              <button
                                type="button"
                                className="btn-change-decision"
                                onClick={() => void handleAnalyzeAudio()}
                                disabled={audioAnalyzing}
                              >
                                {audioAnalyzing ? 'Transcribing...' : audioFile ? 'Transcribe selected audio' : 'Transcribe synthetic fixture'}
                              </button>
                            </div>
                          </div>

                          {audioAnalysis ? (
                            <>
                              <p>Playback uses the original audio. Transcript timestamps are provider estimates.</p>
                              {/* Diarized Transcript Turns */}
                              <div style={{ marginTop: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                  <strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>
                                    Transcript preview · Word timestamps & speaker turns
                                  </strong>
                                  <small style={{ color: '#64748B' }}>
                                    Click timestamps to seek audio
                                  </small>
                                </div>

                                <div className="diarized-turns-list">
                                  {audioAnalysis.turns.map((turn, idx) => {
                                    const isSpeaker1 = turn.speaker.includes('1');
                                    const mins = Math.floor(turn.start / 60);
                                    const secs = Math.floor(turn.start % 60);
                                    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                                    const isActive = audioPlaybackTime >= turn.start && audioPlaybackTime <= turn.end;

                                    return (
                                      <div
                                        key={idx}
                                        className="diarized-turn-bubble"
                                        style={{ borderLeft: isActive ? '4px solid #6366F1' : undefined }}
                                      >
                                        <div className="diarized-turn-header">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className={`speaker-pill ${isSpeaker1 ? 'speaker-1' : 'speaker-2'}`}>
                                              {turn.speaker}
                                            </span>
                                            <button
                                              type="button"
                                              className="turn-timestamp-btn"
                                              onClick={() => {
                                                if(evidencePlayer.current) evidencePlayer.current.currentTime=turn.start;
                                                void evidencePlayer.current?.play().catch(()=>setError('Playback failed. Use the audio controls.'));
                                              }}
                                              title="Jump audio to this second"
                                            >
                                              ⏱️ {timeStr}
                                            </button>
                                          </div>

                                          <button
                                            type="button"
                                            className="btn-save-moment"
                                            onClick={() => handleSaveMoment(turn)}
                                          >
                                            <span>Save this moment</span>
                                            <span>📌</span>
                                          </button>
                                        </div>

                                        <p className="turn-text">
                                          "{turn.text}"
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Forensic Hash & Disclaimers */}
                              <div style={{ marginTop: 20, padding: 14, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 11, color: '#64748B' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <LockKeyhole size={13} style={{ color: '#6366F1' }} />
                                  <strong>Cryptographic Checksum (SHA-256):</strong>
                                  <code style={{ background: '#E2E8F0', padding: '2px 6px', borderRadius: 4 }}>{audioAnalysis.sha256}</code>
                                </div>
                                <p style={{ margin: 0, lineHeight: 1.45 }}>
                                  <em>{audioAnalysis.limitations}</em>
                                </p>
                              </div>
                            </>
                          ) : (
                            <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>
                              <AudioLines size={36} style={{ color: '#818CF8', marginBottom: 12 }} />
                              <div style={{ fontSize: 15, fontWeight: 600, color: '#1E293B' }}>
                                Ready to analyze audio evidence
                              </div>
                              <p style={{ fontSize: 13, maxWidth: 460, margin: '6px auto 16px auto' }}>
                                ElevenLabs Scribe will transcribe the audio, separate speaker turns, and produce word-level timestamps.
                              </p>
                              <button
                                type="button"
                                className="btn-gradient"
                                onClick={() => void handleAnalyzeAudio()}
                                disabled={audioAnalyzing}
                              >
                                {audioAnalyzing ? 'Transcribing...' : 'Load & Transcribe Demo Audio'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* MODE 3: EXPLORE MY CASE (Conversational Evidence Explorer) */}
                    {voiceMode === 'explore' && (
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
                          <button
                            type="button"
                            className="filter-pill"
                            onClick={() => void sendChatMessage('Which messages contained similar wording or links?')}
                          >
                            ✨ Which messages share links? →
                          </button>
                        </div>

                        <div className="voice-conversation-wrap">
                          {/* Left: Conversational Stream */}
                          <div className="chat-stream-card">
                            <div className="card-header" style={{ marginBottom: 8 }}>
                              <span className="card-title">💬 Evidence Q&A</span>
                              <button className="link-action" onClick={clearChat}>
                                Clear conversation
                              </button>
                            </div>

                            <VoiceCapture enabled={health.voice} onTranscript={setQuestion}/>
                            <label><input type="checkbox" checked={aiConsent} onChange={e=>setAiConsent(e.target.checked)}/>Send my question and selected records to Google.</label>
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
                                placeholder="Ask a question about your evidence..."
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
                                className="btn-gradient"
                                style={{ padding: '6px 12px', margin: 0, borderRadius: 999 }}
                                disabled={busy || !question.trim()}
                                onClick={() => void sendChatMessage(question)}
                              >
                                <Send size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Right: Settings & Context */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="card">
                              <strong style={{ fontSize: 14, marginBottom: 12, display: 'block', color: '#0F172A' }}>
                                🔊 Voice playback & audio
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
                                🔒 ElevenLabs & Privacy
                              </strong>
                              <p style={{ fontSize: 11, color: '#6D28D9', lineHeight: 1.45 }}>
                                Voice processing is voluntary. Recordings are sent only with your explicit action. Raw audio and transcriptions are strictly segregated.
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

              </div>

              <VoiceCapture enabled={health.voice} onTranscript={text=>setIncidentNotes(previous=>[previous,text].filter(Boolean).join('\n'))}/>


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
