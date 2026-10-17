import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Shield, House, FolderHeart, Files, Route, Network, AudioLines, FileText,
  ArrowUpRight, ArrowRight, Plus, ChevronRight, Check, Upload, Search, X,
  Download, Mail, MessageSquare, LockKeyhole, Leaf, Info, Mic, Square, Play,
  CheckCheck, Trash2, NotebookPen, ChevronDown, Volume2, VolumeX, Sparkles
} from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { api, blobRequest, type State, type Evidence } from './api';
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

  const containerRef = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondsInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const speechRecognizer = useRef<any>(null);

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
      gsap.from('.gsap-stagger', {
        opacity: 0,
        y: 12,
        duration: 0.35,
        stagger: 0.04,
        ease: 'power2.out'
      });
      gsap.from('.hero-action', {
        opacity: 0,
        scale: 0.985,
        duration: 0.4,
        ease: 'power2.out'
      });
    });
    return () => mm.revert();
  }, { scope: containerRef, dependencies: [page, data] });

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

    await run(async () => {
      if (!consent) {
        throw new Error('Please consent to audio processing first.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        throw new Error('Microphone access denied. You can still type your questions directly.');
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

  // Handle TTS or Browser Speech Synthesis
  function handleSpeakResponse() {
    if (health.tts && consent) {
      void run(async () => {
        const blob = await blobRequest('/voice/speak', { text: answer, consent });
        setAudioUrl(URL.createObjectURL(blob));
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

  const pendingFindingsCount = data.findings.filter(f => f.decision === 'pending').length;

  return (
    <div className="app" ref={containerRef}>
      <a href="#main" className="skip">Skip to content</a>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('Home'); }}>
          <span className="brandmark">
            <Shield size={22} strokeWidth={1.7} />
          </span>
          <span>
            AEGIS
            <span className="brand-sub">A little clarity. A way forward.</span>
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

        <div className="sidebar-bottom">
          <div className="pace">
            <Leaf size={20} />
            <h3>At your pace.<br />On your terms.</h3>
            <p>You choose what to document and what comes next.</p>
          </div>
          <div className="demo-mark">
            <span className="dot" /> Synthetic demo workspace
            <Info size={14} />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrap">
        <header className="topbar">
          <span className="breadcrumb">
            Your workspace <ChevronRight size={13} />
            <strong>{page}</strong>
          </span>
          <span className="top-note">
            <LockKeyhole size={14} />
            Nothing is shared automatically
          </span>
        </header>

        <div className="demo-banner">
          <span className="demo-pill">DEMO</span>
          <span>Synthetic demonstration — please do not upload sensitive real-world records.</span>
        </div>

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
                  <>
                    <div className="eyebrow">
                      <span className="tiny-line" /> A SPACE TO FIND YOUR FOOTING
                    </div>
                    <h1 ref={heading} tabIndex={-1}>
                      One step at a time.<br />
                      <span>You’re in control.</span>
                    </h1>
                    <p className="intro">
                      A calm place to document what happened,<br className="desktop" />
                      bring your records together, and decide what’s next.
                    </p>

                    <section className="hero-action">
                      <div className="action-copy">
                        <span className="square-icon">
                          <NotebookPen size={24} strokeWidth={1.5} />
                        </span>
                        <h2>Start with what you know.</h2>
                        <p>
                          You don’t need the whole story. A moment, a message,<br className="desktop" />
                          or a few words is enough to begin.
                        </p>
                        <Button onClick={() => setModal(true)}>
                          <Plus size={18} />
                          Document an incident
                          <ArrowRight size={18} />
                        </Button>
                        <small>You can add more details later.</small>
                      </div>

                      <div className="paper-art" aria-hidden="true">
                        <div className="paper paper-back" />
                        <div className="paper paper-front">
                          <div className="paper-top">
                            <span />
                            <span />
                          </div>
                          <div className="paper-rule long" />
                          <div className="paper-rule" />
                          <div className="paper-rule medium" />
                          <div className="paper-note">
                            <Check size={16} />
                            <div>
                              <span />
                              <span />
                            </div>
                          </div>
                          <div className="paper-rule medium" />
                          <div className="paper-rule" />
                        </div>
                        <span className="art-check">
                          <Check size={20} />
                        </span>
                      </div>
                    </section>

                    <div className="home-grid">
                      <section>
                        <div className="section-title">
                          <h2>Where you left off</h2>
                          <button className="text-button" onClick={() => navigate('Timeline')}>
                            View timeline <ArrowUpRight size={14} />
                          </button>
                        </div>

                        <div className="activity-list">
                          {data.evidence.length === 0 ? (
                            <div className="empty-inline">
                              <Files size={24} />
                              <p>Your story starts here. Add an incident or explore the synthetic case.</p>
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    await api('/seed', {});
                                    await refresh();
                                    setNotice('Synthetic case loaded.');
                                  })
                                }
                              >
                                Explore demo case <ArrowRight size={16} />
                              </Button>
                            </div>
                          ) : (
                            data.evidence.slice(0, 3).map((e, i) => (
                              <button
                                className="activity gsap-stagger"
                                key={e.id}
                                onClick={() => setInspect(e)}
                              >
                                <span className={'activity-icon tone-' + i}>
                                  {e.source === 'Email' ? <Mail size={18} /> : <MessageSquare size={18} />}
                                </span>
                                <span>
                                  <strong>
                                    {e.source === 'Email'
                                      ? 'Email added to your records'
                                      : 'Community messages saved'}
                                  </strong>
                                  <small>
                                    {e.filename} <span>·</span> {formatDate(e.original_time)}
                                  </small>
                                </span>
                                <ChevronRight size={16} />
                              </button>
                            ))
                          )}
                        </div>
                      </section>

                      <section className="next-step">
                        <span className="eyebrow">A SMALL NEXT STEP</span>
                        <h2>Put the pieces<br /> in one place.</h2>
                        <p>Have a screenshot or a message? Add it to your records when you’re ready.</p>
                        <button className="text-button" onClick={() => navigate('Evidence')}>
                          Go to your evidence <ArrowRight size={16} />
                        </button>
                      </section>
                    </div>

                    <footer className="home-footer">
                      <Leaf size={16} />
                      <span>There’s no right pace. Just yours.</span>
                      <span className="footer-line" />
                      <span>DOCUMENT. UNDERSTAND. MOVE FORWARD.</span>
                    </footer>
                  </>
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
                      <span className="eyebrow">YOUR CASE</span>
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
                )}

                {/* Evidence Page */}
                {page === 'Evidence' && (
                  <>
                    <label className="upload-zone gsap-stagger">
                      <span className="square-icon">
                        <Upload size={22} />
                      </span>
                      <strong>{busy ? 'Importing your record…' : 'Add a record to your case'}</strong>
                      <span>Choose a file · EML, JSON, TXT, PNG or JPG · up to 10 MB</span>
                      <input
                        type="file"
                        disabled={busy}
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

                    <div className="filter-row">
                      <label className="search">
                        <Search size={16} />
                        <input
                          aria-label="Search records"
                          placeholder="Search your records…"
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Filter by source"
                        value={source}
                        onChange={e => setSource(e.target.value)}
                      >
                        {['All sources', ...new Set(data.evidence.map(e => e.source))].map(s => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <span className="muted">{data.evidence.length} records</span>
                    </div>

                    <div className="record-list">
                      {data.evidence
                        .filter(
                          e =>
                            e.filename.toLowerCase().includes(search.toLowerCase()) &&
                            (source === 'All sources' || source === e.source)
                        )
                        .map(e => (
                          <button
                            className="record gsap-stagger"
                            key={e.id}
                            onClick={() => setInspect(e)}
                          >
                            <span className="activity-icon">
                              <FileText size={20} />
                            </span>
                            <span>
                              <strong>{e.filename}</strong>
                              <small>
                                {e.source} · {formatDate(e.original_time)} · {(e.size / 1024).toFixed(1)} KB
                              </small>
                            </span>
                            <span className="badge">{e.status}</span>
                            <ChevronRight size={17} />
                          </button>
                        ))}
                    </div>
                    {!data.evidence.length && (
                      <p className="empty-inline">
                        Your originals will appear here. Import a fixture from the repository to begin.
                      </p>
                    )}
                  </>
                )}

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
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await api('/findings/' + f.id, { decision: 'accepted' }, 'PATCH');
                                await refresh();
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
                                await api('/findings/' + f.id, { decision: 'rejected' }, 'PATCH');
                                await refresh();
                              })
                            }
                          >
                            <X size={16} />
                            Reject
                          </Button>
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
                        disabled={busy || !aiConsent || !selected.length || !health.gemini}
                        onClick={() =>
                          run(async () => {
                            await api('/analyze', { evidence_ids: selected, consent: aiConsent });
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

                {/* Voice Companion Page — Impeccable + transitions.dev + Dual-Mode Audio */}
                {page === 'Voice companion' && (
                  <div className="voice-layout">
                    <section className="surface voice-main gsap-stagger">
                      <div className="voice-symbol-wrap">
                        <span className={'voice-symbol ' + (recording ? 'recording' : '')}>
                          <AudioLines size={36} strokeWidth={1.3} />
                        </span>
                      </div>

                      <h2>There’s room to talk.</h2>
                      <p>Start with a question, speak your mind, or choose a prompt below.</p>

                      {/* Live soundwave & recording timer */}
                      {recording && (
                        <div className="recording-indicator" role="status">
                          <span className="recording-timer-pill">
                            <span className="recording-timer-dot" />
                            {Math.floor(recordingSeconds / 60)}:
                            {(recordingSeconds % 60).toString().padStart(2, '0')} / 1:00
                          </span>
                          <div className="t-soundwave" aria-hidden="true">
                            <span className="t-soundwave-bar" />
                            <span className="t-soundwave-bar" />
                            <span className="t-soundwave-bar" />
                            <span className="t-soundwave-bar" />
                            <span className="t-soundwave-bar" />
                            <span className="t-soundwave-bar" />
                            <span className="t-soundwave-bar" />
                          </div>
                        </div>
                      )}

                      <div className="suggestions">
                        {[
                          'Summarize my case',
                          'What connects these records?',
                          'What should I include in my report?'
                        ].map(q => (
                          <button onClick={() => setQuestion(q)} key={q}>
                            <span>{q}</span>
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>

                      <label className="align-left">
                        Your question / editable transcript
                        <textarea
                          rows={4}
                          value={question}
                          onChange={e => setQuestion(e.target.value)}
                          placeholder="What would you like to work through? (Or click Record to speak)"
                        />
                      </label>

                      {userRecordedUrl && (
                        <div className="audio-player-wrap align-left">
                          <small>Your voice recording preview:</small>
                          <audio src={userRecordedUrl} controls />
                        </div>
                      )}

                      <div className="button-row">
                        <Button
                          disabled={busy || !question.trim() || !selected.length}
                          onClick={() =>
                            run(async () => {
                              const r = await api<{ answer: string; mode: string }>('/ask', {
                                question,
                                evidence_ids: selected,
                                consent: aiConsent
                              });
                              setAnswer(r.mode + '\n\n' + r.answer);
                            })
                          }
                        >
                          Confirm text & ask
                          <ArrowRight size={17} />
                        </Button>

                        <Button
                          variant={recording ? 'default' : 'outline'}
                          disabled={busy || !consent}
                          onClick={record}
                          title={
                            !consent
                              ? 'Check consent below to enable recording'
                              : health.voice
                              ? 'Record audio via ElevenLabs'
                              : 'Record audio in Demo mode'
                          }
                        >
                          {recording ? <Square size={16} /> : <Mic size={16} />}
                          {recording ? 'Stop recording' : 'Record'}
                        </Button>
                      </div>

                      <small>Recordings automatically stop after 60 seconds.</small>

                      {answer && (
                        <div className="answer" role="status">
                          <span className="eyebrow">YOUR RESPONSE</span>
                          <p>{answer}</p>

                          <div className="button-row">
                            <Button
                              variant="outline"
                              disabled={busy || !consent}
                              onClick={handleSpeakResponse}
                            >
                              {isSpeakingBrowser ? (
                                <>
                                  <VolumeX size={15} /> Stop browser voice
                                </>
                              ) : (
                                <>
                                  <Volume2 size={15} />
                                  {health.tts ? 'Prepare spoken response (ElevenLabs)' : 'Speak response (Browser voice)'}
                                </>
                              )}
                            </Button>
                          </div>

                          {audioUrl && (
                            <audio ref={audioRef} src={audioUrl} controls autoPlay={false} />
                          )}
                        </div>
                      )}
                    </section>

                    <aside className="surface gsap-stagger">
                      <h3>You choose the context.</h3>
                      <p className="muted">
                        Only selected records provide context. Without Gemini consent, a fixed local checklist is shown.
                      </p>
                      {selectionCheckboxes}

                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={aiConsent}
                          disabled={!health.gemini}
                          onChange={e => setAiConsent(e.target.checked)}
                        />
                        Use Gemini for this question. I consent to sending the question and selected records to Google.
                      </label>

                      <hr />

                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={e => setConsent(e.target.checked)}
                        />
                        I consent to processing microphone recordings and generating speech responses.
                      </label>

                      <p className="muted">
                        External services may retain submitted data. Nothing records or plays automatically.
                      </p>

                      <span className="badge">
                        {health.voice
                          ? 'ElevenLabs Scribe active'
                          : 'Demo voice mode · in-browser recording enabled'}
                      </span>
                    </aside>
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
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  await api('/incidents', {
                    title: f.get('title'),
                    description: f.get('description'),
                    occurred_at: f.get('time')
                      ? new Date(String(f.get('time'))).toISOString()
                      : null
                  });
                  await refresh();
                  setModal(false);
                  setNotice('Incident saved to this demo.');
                });
              }}
            >
              <label>
                What happened?
                <input
                  name="title"
                  autoFocus
                  required
                  maxLength={150}
                  placeholder="A brief title for this moment"
                />
              </label>
              <label>
                When? <small>Optional · your local timezone</small>
                <input type="datetime-local" name="time" />
              </label>
              <label>
                Your notes
                <textarea
                  name="description"
                  maxLength={10000}
                  rows={4}
                  placeholder="Write only what you’re comfortable documenting."
                />
              </label>
              <div className="button-row">
                <Button disabled={busy}>
                  {busy ? 'Saving…' : 'Save incident'}
                  <CheckCheck size={16} />
                </Button>
                <Dialog.Close asChild>
                  <Button variant="ghost" type="button">Cancel</Button>
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
