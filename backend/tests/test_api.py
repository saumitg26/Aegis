import hashlib, importlib, io
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def env(tmp_path,monkeypatch):
    monkeypatch.setenv('DATABASE_URL','sqlite:///'+str(tmp_path/'test.db'))
    monkeypatch.setenv('ARTIFACT_DIR',str(tmp_path/'artifacts'))
    monkeypatch.setenv('PUBLIC_DEMO','false')
    monkeypatch.setenv('GEMINI_API_KEY','')
    monkeypatch.setenv('ELEVENLABS_API_KEY','')
    import backend.app.main as m
    m=importlib.reload(m)
    return TestClient(m.app),m

def test_journey_and_hash(env):
    c,m=env
    assert c.post('/api/seed').status_code==200
    state=c.get('/api/state').json()
    assert len(state['evidence']) >= 3 and len(state['events']) == 4
    assert state['events'][0]['time']=='2026-10-15T14:30:00+00:00'
    for a in state['evidence']:
        raw=c.get('/api/evidence/'+a['id']+'/download').content
        assert hashlib.sha256(raw).hexdigest()==a['sha256']
    assert any('Timing alone' in f['summary'] for f in state['findings'])
    assert c.post('/api/incidents',json={'title':'A moment','description':'Synthetic note'}).status_code==200
    f=state['findings'][0]
    c.patch('/api/findings/'+f['id'],json={'decision':'accepted'})
    body={'evidence_ids':[a['id'] for a in state['evidence']],'redact':['demo-recipient'],'note':'demo-recipient made this report'}
    preview=c.post('/api/report/preview',json=body).json()['text']
    assert 'demo-recipient' not in preview and '[REDACTED]' in preview
    assert f['summary'] in preview
    assert c.post('/api/report',json=body).content.startswith(b'%PDF')
    c.patch('/api/findings/'+f['id'],json={'decision':'rejected'})
    assert f['summary'] not in c.post('/api/report/preview',json=body).json()['text']
    aid=state['evidence'][0]['id']
    assert c.delete('/api/evidence/'+aid).status_code==200
    state=c.get('/api/state').json()
    assert all(e['evidence_id']!=aid for e in state['events'])
    assert all(aid not in f['evidence_ids'] for f in state['findings'])
    assert not (m.ARTIFACT_DIR/aid).exists()

def test_import_validation_and_unknown_time(env):
    c,m=env
    assert c.post('/api/evidence',files={'file':('bad.json',b'{oops')}).status_code==422
    assert c.post('/api/evidence',files={'file':('bad.exe',b'abc')}).status_code==415
    assert c.post('/api/evidence',files={'file':('empty.txt',b'')}).status_code==413
    assert c.post('/api/evidence',files={'file':('bad.png',b'not an image')}).status_code==422
    r=c.post('/api/evidence',files={'file':('../../note.txt',b'<script>alert(1)</script>')})
    assert r.status_code==200 and r.json()['filename']=='note.txt'
    e=c.get('/api/state').json()['events'][0]
    assert e['time'] is None and e['content']=='<script>alert(1)</script>'
    assert m.timestamp('2026-10-01T10:00:00') is None

def test_provider_consent_and_missing_keys(env):
    c,m=env
    assert c.post('/api/analyze',json={'evidence_ids':[]}).status_code==400
    assert c.post('/api/analyze',json={'evidence_ids':[],'consent':True}).status_code==503
    assert c.post('/api/voice/transcribe',files={'file':('voice.webm',b'test')}).status_code==400
    assert c.post('/api/voice/transcribe',files={'file':('voice.webm',b'test')},data={'consent':'true'}).status_code==503
    assert c.post('/api/voice/speak',json={'text':'hello','consent':True}).status_code==503

def test_grounding_validator(env):
    _,m=env
    row={'evidence_id':'EV-1','content':'original exact statement'}
    f=dict(title='Test',summary='Test',evidence_ids=['EV-1'],direct_observations=[],quotations={'EV-1':'exact statement'},possible_interpretations=[],limitations='Unknown intent')
    assert m.validate_findings(m.AIResult(findings=[m.AIFinding(**f)]),[row])
    f['quotations']={'EV-1':'invented quote'}
    with pytest.raises(ValueError):m.validate_findings(m.AIResult(findings=[m.AIFinding(**f)]),[row])
    f['evidence_ids']=['EV-2']
    with pytest.raises(ValueError):m.validate_findings(m.AIResult(findings=[m.AIFinding(**f)]),[row])

def test_report_requires_all_finding_sources(env):
    c,_=env;c.post('/api/seed');state=c.get('/api/state').json();f=state['findings'][0]
    c.patch('/api/findings/'+f['id'],json={'decision':'accepted'})
    text=c.post('/api/report/preview',json={'evidence_ids':[f['evidence_ids'][0]]}).json()['text']
    assert f['summary'] not in text
    assert c.post('/api/report',json={'evidence_ids':['missing']}).status_code==422

def test_typed_fallback_and_opt_in(env):
    c,_=env;c.post('/api/seed');aid=c.get('/api/state').json()['evidence'][0]['id']
    body={'question':'Summarize this record','evidence_ids':[aid]}
    r=c.post('/api/ask',json=body)
    assert r.status_code==200 and 'Local demo' in r.json()['mode']
    assert c.post('/api/ask',json={**body,'consent':True}).status_code==503

def test_gemini_adapter_with_mock(env,monkeypatch):
    c,m=env;c.post('/api/seed');aid=c.get('/api/state').json()['evidence'][0]['id']
    monkeypatch.setenv('GEMINI_API_KEY','test-key-not-real')
    from google import genai
    from types import SimpleNamespace
    calls=[]
    def generate(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(text=m.AIResult(findings=[m.AIFinding(title='Mocked observation',summary='A synthetic message exists.',evidence_ids=[aid],direct_observations=['A record exists.'],quotations={},possible_interpretations=[],limitations='Mock API test; not a live result.')]).model_dump_json())
    monkeypatch.setattr(genai,'Client',lambda **kwargs:SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    assert c.post('/api/analyze',json={'evidence_ids':[aid],'consent':True}).status_code==200
    assert calls and 'response_schema' in calls[0]['config']
    finding=c.get('/api/state').json()['findings'][-1]
    assert finding['decision']=='pending' and finding['origin']=='Gemini'

def test_voice_adapter_with_mock(env,monkeypatch):
    c,m=env;monkeypatch.setenv('ELEVENLABS_API_KEY','test-key-not-real');monkeypatch.setenv('ELEVENLABS_VOICE_ID','demo-voice')
    calls=[]
    class FakeClient:
        def __init__(self,**kwargs):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,url,**kwargs):
            calls.append((url,kwargs))
            return m.httpx.Response(200,json={'text':'Synthetic transcript'},request=m.httpx.Request('POST',url)) if 'speech-to-text' in url else m.httpx.Response(200,content=b'audio-test-bytes',request=m.httpx.Request('POST',url))
    monkeypatch.setattr(m.httpx,'AsyncClient',FakeClient)
    r=c.post('/api/voice/transcribe',files={'file':('voice.webm',b'test','audio/webm')},data={'consent':'true'})
    assert r.json()['text']=='Synthetic transcript'
    assert c.post('/api/voice/speak',json={'text':'Approved response','consent':True}).content==b'audio-test-bytes'
    assert len(calls)==2

def test_sso_authentication(env):
    c, m = env
    for provider in ['vultr', 'google', 'saml']:
        assert c.post('/api/auth/sso', json={'provider': provider}).status_code == 501
    response = c.post('/api/auth/sso', json={'provider': 'demo'})
    assert response.status_code == 200 and response.json()['token'] is None
    assert c.get('/api/auth/me').json()['authenticated'] is False
    assert c.post('/api/auth/logout').json()['ok'] is True

def test_fallback_ai_analysis_and_accept_suggestion(env, monkeypatch):
    c, m = env
    c.post('/api/seed')
    state = c.get('/api/state').json()
    # Check that companion findings are seeded
    companion = [f for f in state['findings'] if f.get('origin') in ('AI Companion', 'Gemini')]
    assert len(companion) >= 3
    finding_id = companion[0]['id']

    # Test saved_pattern, not_relevant, review_later
    res_saved = c.patch(f'/api/findings/{finding_id}', json={'decision': 'saved_pattern'})
    assert res_saved.status_code == 200
    assert res_saved.json()['decision'] == 'saved_pattern'

    res_not_rel = c.patch(f'/api/findings/{finding_id}', json={'decision': 'not_relevant'})
    assert res_not_rel.status_code == 200
    assert res_not_rel.json()['decision'] == 'not_relevant'

    res_later = c.patch(f'/api/findings/{finding_id}', json={'decision': 'review_later'})
    assert res_later.status_code == 200
    assert res_later.json()['decision'] == 'review_later'

    # Test report preview includes saved_pattern
    c.patch(f'/api/findings/{finding_id}', json={'decision': 'saved_pattern'})
    f_obj = next(f for f in c.get('/api/state').json()['findings'] if f['id'] == finding_id)
    report_res = c.post('/api/report/preview', json={'evidence_ids': f_obj['evidence_ids']})
    assert report_res.status_code == 200
    assert 'User-reviewed patterns' in report_res.json()['text']
    assert f_obj['summary'] in report_res.json()['text']


    # Test analyze fallback when Gemini raises 503
    monkeypatch.setenv('GEMINI_API_KEY', 'test-key')
    from google import genai
    from types import SimpleNamespace
    def failing_generate(**kwargs):
        raise Exception("503 UNAVAILABLE. High demand spike")
    monkeypatch.setattr(genai, 'Client', lambda **kwargs: SimpleNamespace(models=SimpleNamespace(generate_content=failing_generate)))

    aid = state['evidence'][0]['id']
    res_an = c.post('/api/analyze', json={'evidence_ids': [aid], 'consent': True})
    assert res_an.status_code == 200
    assert res_an.json()['ok'] is True
    latest_findings = c.get('/api/state').json()['findings']
    fallback_f = latest_findings[-1]
    assert fallback_f['origin'] == 'AI Companion'
    assert fallback_f['decision'] == 'pending'

def test_audio_artifact_import_and_analysis(env):
    c, m = env
    # Test uploading a synthetic audio file
    fake_wav_bytes = b'RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00'
    res = c.post('/api/evidence', files={'file': ('voicemail.wav', fake_wav_bytes, 'audio/wav')})
    assert res.status_code == 200
    ev = res.json()
    assert ev['source'] == 'Audio Recording'
    assert 'Stored audio' in ev['status']
    assert len(ev['sha256']) == 64

    # Test analyze-audio endpoint with artifact_id
    res_analyze = c.post('/api/voice/analyze-audio', data={'artifact_id': ev['id'], 'consent': 'true'})
    assert res_analyze.status_code == 503
    assert 'turns' not in res_analyze.json()
    assert c.get('/api/evidence/'+ev['id']+'/download').content == fake_wav_bytes
    assert ev['sha256'] == hashlib.sha256(fake_wav_bytes).hexdigest()

def test_story_extract_and_incident_creation(env):
    c, m = env
    c.post('/api/seed')
    story = "On October 15th, I received repeated harassing messages on Discord with a threatening link."
    res = c.post('/api/voice/story-extract', json={'story_text': story, 'evidence_ids': ['EV-demo']})
    assert res.status_code == 200
    draft = res.json()['draft']
    assert 'Discord' in draft['platform']
    assert draft['incident_date'].startswith('Unknown')
    assert draft['what_happened'] == story
    assert 'what_happened' in draft
    assert 'user-reported' in draft['user_reported_disclaimer']

    # Test saving an incident from the voice draft
    inc_res = c.post('/api/incidents', json={
        'title': draft['suggested_title'],
        'description': f"{draft['what_happened']}\nPlatform: {draft['platform']}\nReported date: {draft['incident_date']}",
        'occurred_at': '2026-10-15T14:30:00Z'
    })
    assert inc_res.status_code == 200
    state = c.get('/api/state').json()
    assert any(i['title'] == draft['suggested_title'] for i in state['incidents'])



def test_public_preview_never_exposes_database_or_mutations(env,monkeypatch):
    c,m=env
    c.post('/api/incidents',json={'title':'Private local note'})
    monkeypatch.setenv('PUBLIC_DEMO','true')
    state=c.get('/api/state').json()
    assert state['incidents']==[] and state['case']['id']=='demo'
    assert all(e['id'].startswith('DEMO-') for e in state['evidence'])
    for method,path in [('POST','/api/evidence'),('POST','/api/voice/analyze-audio'),('POST','/api/analyze'),('PUT','/api/case'),('DELETE','/api/evidence/anything'),('GET','/api/evidence/anything/download')]:
        assert c.request(method,path).status_code==403
    assert c.get('/api/health').json()['public_demo'] is True
    assert c.get('/api/auth/me').json()['authenticated'] is False
    assert c.post('/api/auth/sso',json={'provider':'google'}).status_code==501
    result=c.post('/api/auth/sso',json={'provider':'demo'}).json()
    assert result['token'] is None

def test_audio_never_fabricates_transcript(env,monkeypatch):
    c,m=env
    assert c.post('/api/voice/analyze-audio',files={'file':('test.wav',b'RIFFdemo','audio/wav')}).status_code==400
    monkeypatch.setenv('ELEVENLABS_API_KEY','')
    r=c.post('/api/voice/analyze-audio',files={'file':('test.wav',b'RIFFdemo','audio/wav')},data={'consent':'true'})
    assert r.status_code==503 and 'turns' not in r.json()
    monkeypatch.setenv('ELEVENLABS_API_KEY','fake-test-key')
    class Fake:
        def __init__(self,**kwargs):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,url,**kwargs):return m.httpx.Response(200,json={'text':'','words':[]},request=m.httpx.Request('POST',url))
    monkeypatch.setattr(m.httpx,'AsyncClient',Fake)
    r=c.post('/api/voice/analyze-audio',files={'file':('test.wav',b'RIFFdemo','audio/wav')},data={'consent':'true'})
    assert r.status_code==502 and 'turns' not in r.json()

def test_story_does_not_invent_dates_or_send_without_consent(env,monkeypatch):
    c,m=env
    monkeypatch.setenv('GEMINI_API_KEY','must-not-be-used')
    from google import genai
    def fail(**kwargs):raise AssertionError('No consent, no provider call')
    monkeypatch.setattr(genai,'Client',fail)
    r=c.post('/api/voice/story-extract',json={'story_text':'A message arrived.','evidence_ids':[]})
    assert r.status_code==200 and r.json()['draft']['incident_date'].startswith('Unknown')
    assert r.json()['draft']['what_happened']=='A message arrived.'


def test_audio_uses_only_provider_words_and_timestamps(env, monkeypatch):
    c,m=env
    monkeypatch.setenv('ELEVENLABS_API_KEY','fake-test-key')
    payload={'text':'Hello there','words':[{'text':'Hello','start':1.2,'end':1.7,'type':'word','speaker_id':'a'},{'text':'there','start':2.0,'end':2.4,'type':'word','speaker_id':'b'}]}
    class Fake:
        def __init__(self,**kwargs):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,url,**kwargs):return m.httpx.Response(200,json=payload,request=m.httpx.Request('POST',url))
    monkeypatch.setattr(m.httpx,'AsyncClient',Fake)
    def request():return c.post('/api/voice/analyze-audio',files={'file':('test.wav',b'RIFFdemo','audio/wav')},data={'consent':'true'})
    response=request()
    assert response.status_code==200
    assert [t['text'] for t in response.json()['turns']]==['Hello','there']
    assert [t['start'] for t in response.json()['turns']]==[1.2,2.0]
    del payload['words'][1]['start']
    assert request().status_code==502
