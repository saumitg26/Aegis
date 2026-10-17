import hashlib, importlib, io
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def env(tmp_path,monkeypatch):
    monkeypatch.setenv('DATABASE_URL','sqlite:///'+str(tmp_path/'test.db'))
    monkeypatch.setenv('ARTIFACT_DIR',str(tmp_path/'artifacts'))
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    monkeypatch.delenv('ELEVENLABS_API_KEY',raising=False)
    import backend.app.main as m
    m=importlib.reload(m)
    return TestClient(m.app),m

def test_journey_and_hash(env):
    c,m=env
    assert c.post('/api/seed').status_code==200
    state=c.get('/api/state').json()
    assert len(state['evidence'])==3 and len(state['events'])==4
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
    # Test Vultr SSO
    res = c.post('/api/auth/sso', json={'provider': 'vultr'})
    assert res.status_code == 200
    data = res.json()
    assert 'token' in data
    assert data['user']['email'] == 'jamie@cloud.vultr.com'
    assert data['user']['vultr_region'] == 'ewr'
    assert 'Vultr' in data['user']['provider']

    # Test Google SSO
    res_goog = c.post('/api/auth/sso', json={'provider': 'google'})
    assert res_goog.status_code == 200
    assert 'Google' in res_goog.json()['user']['provider']

    # Test /api/auth/me
    res_me = c.get('/api/auth/me')
    assert res_me.status_code == 200
    assert res_me.json()['authenticated'] is True

    # Test logout
    res_logout = c.post('/api/auth/logout')
    assert res_logout.status_code == 200
    assert res_logout.json()['ok'] is True

def test_fallback_ai_analysis_and_accept_suggestion(env, monkeypatch):
    c, m = env
    c.post('/api/seed')
    state = c.get('/api/state').json()
    # Check that companion findings are seeded
    companion = [f for f in state['findings'] if f.get('origin') in ('AI Companion', 'Gemini')]
    assert len(companion) >= 3
    finding_id = companion[0]['id']

    # Accept suggestion and check that it persists in state
    res_patch = c.patch(f'/api/findings/{finding_id}', json={'decision': 'accepted'})
    assert res_patch.status_code == 200
    assert res_patch.json()['decision'] == 'accepted'

    state_after = c.get('/api/state').json()
    accepted_f = next(f for f in state_after['findings'] if f['id'] == finding_id)
    assert accepted_f['decision'] == 'accepted'

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


