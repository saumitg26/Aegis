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
    for provider in ['google', 'saml']:
        assert c.post('/api/auth/sso', json={'provider': provider}).status_code == 501
    
    # Test Vultr SSO authentication default
    res_vultr = c.post('/api/auth/sso', json={'provider': 'vultr'})
    assert res_vultr.status_code == 200
    v_data = res_vultr.json()
    assert v_data['user']['provider_id'] == 'vultr'
    assert 'ewr' in v_data['user']['vultr_region']
    assert c.get('/api/auth/vultr/config').json()['configured'] is False
    res_auth = c.get('/api/auth/vultr/authorize', follow_redirects=False)
    assert res_auth.status_code == 307
    assert 'vultr-sandbox' in res_auth.headers.get('location', '')

    # Test custom name and email in Vultr SSO
    res_custom = c.post('/api/auth/sso', json={'provider': 'vultr', 'name': 'Sarah Connor', 'region': 'ord'})
    assert res_custom.status_code == 200
    custom_u = res_custom.json()['user']
    assert custom_u['name'] == 'Sarah Connor'
    assert custom_u['avatar_initials'] == 'SC'
    assert custom_u['vultr_region'] == 'ord'

    # Test custom username only (e.g. Saumit)
    res_user_only = c.post('/api/auth/sso', json={'provider': 'vultr', 'name': 'Saumit'})
    assert res_user_only.status_code == 200
    user_u = res_user_only.json()['user']
    assert user_u['name'] == 'Saumit'
    assert user_u['avatar_initials'] == 'SA'
    assert 'saumit@cloud.vultr.com' in user_u['email']

    # Test Bearer token header authorization
    vultr_token = res_user_only.json()['token']
    assert vultr_token is not None
    # Client with cleared cookies can still authenticate via Bearer header
    c.cookies.clear()
    res_bearer_me = c.get('/api/auth/me', headers={'Authorization': f'Bearer {vultr_token}'})
    assert res_bearer_me.status_code == 200
    assert res_bearer_me.json()['authenticated'] is True
    assert res_bearer_me.json()['user']['name'] == 'Saumit'

    # Test logout and demo SSO
    assert c.post('/api/auth/logout').json()['ok'] is True
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
        assert c.request(method,path).status_code==401
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


def test_guest_workspaces_are_interactive_and_isolated(env, monkeypatch):
    c,m=env
    monkeypatch.setenv('PUBLIC_DEMO','true')
    a,b=TestClient(m.app),TestClient(m.app)
    assert a.post('/api/auth/sso',json={'provider':'demo'}).status_code==200
    assert b.post('/api/auth/sso',json={'provider':'demo'}).status_code==200
    assert a.cookies.get(m.guests.COOKIE)!=b.cookies.get(m.guests.COOKIE)
    assert a.get('/api/auth/me').json()['session_active'] is True
    assert a.post('/api/incidents',json={'title':'Only visitor A'}).status_code==200
    assert b.get('/api/state').json()['incidents']==[]
    uploaded=a.post('/api/evidence',files={'file':('synthetic.txt',b'Only guest A can download these synthetic bytes')}).json()
    assert a.get('/api/evidence/'+uploaded['id']+'/download').status_code==200
    assert b.get('/api/evidence/'+uploaded['id']+'/download').status_code==404
    assert b.delete('/api/evidence/'+uploaded['id']).status_code==404
    assert a.post('/api/report',json={'evidence_ids':[uploaded['id']]}).content.startswith(b'%PDF')
    assert a.post('/api/incidents',json={'title':'cross-site'},headers={'Origin':'https://other.example'}).status_code==403
    assert a.post('/api/auth/logout').status_code==200
    assert a.post('/api/incidents',json={'title':'after logout'}).status_code==401
    assert b.post('/api/incidents',json={'title':'B still works'}).status_code==200


def test_guest_expiry_and_ai_budget(env,monkeypatch):
    c,m=env
    monkeypatch.setenv('PUBLIC_DEMO','true')
    c.post('/api/auth/sso',json={'provider':'demo'})
    space=m.guests.lookup(c.cookies.get(m.guests.COOKIE))
    space.calls=[m.guests.time.monotonic()]*10
    assert c.post('/api/analyze',json={'evidence_ids':[],'consent':True}).status_code==429
    assert c.post('/api/incidents',json={'title':'Editing still works'}).status_code==200
    space.expires=0
    assert c.post('/api/incidents',json={'title':'Expired'}).status_code==401
    assert not space.directory.exists()

def test_persistent_user_account_lifecycle(env, monkeypatch):
    c, m = env
    monkeypatch.setenv('PUBLIC_DEMO', 'true')
    
    # Validation failures
    assert c.post('/api/auth/register', json={'name': 'Saumit G', 'email': 'invalid-email', 'password': 'pass'}).status_code == 422
    assert c.post('/api/auth/register', json={'name': 'Saumit G', 'email': 'saumit@test.com', 'password': 'short'}).status_code == 422

    # Successful registration
    reg = c.post('/api/auth/register', json={'name': 'Saumit G', 'email': 'saumit@test.com', 'password': 'securepassword123', 'region': 'ord'})
    assert reg.status_code == 200
    user_data = reg.json()['user']
    token = reg.json()['token']
    assert user_data['name'] == 'Saumit G'
    assert user_data['email'] == 'saumit@test.com'
    assert user_data['avatar_initials'] == 'SG'
    assert user_data['vultr_region'] == 'ord'
    assert token is not None

    # Duplicate registration rejected
    assert c.post('/api/auth/register', json={'name': 'Saumit Duplicate', 'email': 'saumit@test.com', 'password': 'password123'}).status_code == 400

    # Document an incident
    inc = c.post('/api/incidents', json={'title': 'Persistent Discord harassment', 'description': 'Must survive server restart'}).json()
    assert inc['title'] == 'Persistent Discord harassment'

    # State check
    st = c.get('/api/state').json()
    assert any(i['id'] == inc['id'] for i in st['incidents'])

    # Logout
    assert c.post('/api/auth/logout').status_code == 200
    assert c.get('/api/auth/me').json()['session_active'] is False

    # Login with bad password fails
    assert c.post('/api/auth/login', json={'email': 'saumit@test.com', 'password': 'wrongpassword'}).status_code == 401
    assert c.post('/api/auth/login', json={'email': 'nonexistent@test.com', 'password': 'password'}).status_code == 401

    # Login with correct password succeeds
    login = c.post('/api/auth/login', json={'email': 'saumit@test.com', 'password': 'securepassword123'})
    assert login.status_code == 200
    assert login.json()['user']['email'] == 'saumit@test.com'
    new_token = login.json()['token']

    # Verify incident persisted across logout and login
    st_after = c.get('/api/state').json()
    assert any(i['id'] == inc['id'] for i in st_after['incidents'])

    # Test server restart recovery: simulate process restart by clearing in-memory sessions dict
    m.guests.sessions.clear()
    # Now send request with Bearer token — backend must recover session from persistent disk!
    recovered_me = c.get('/api/auth/me', headers={'Authorization': f'Bearer {new_token}'})
    assert recovered_me.status_code == 200
    assert recovered_me.json()['session_active'] is True
    assert recovered_me.json()['user']['name'] == 'Saumit G'

    recovered_state = c.get('/api/state', headers={'Authorization': f'Bearer {new_token}'})
    assert recovered_state.status_code == 200
    assert any(i['id'] == inc['id'] for i in recovered_state.json()['incidents'])

    # Test incident deletion
    del_res = c.delete(f'/api/incidents/{inc["id"]}', headers={'Authorization': f'Bearer {new_token}'})
    assert del_res.status_code == 200
    assert del_res.json()['deleted'] == inc['id']
    st_deleted = c.get('/api/state', headers={'Authorization': f'Bearer {new_token}'}).json()
    assert not any(i['id'] == inc['id'] for i in st_deleted['incidents'])

def test_flexible_json_and_csv_import(env):
    c, m = env
    # 1. JSON list format with alias fields
    import json
    chat_list = [
        {'sender': 'Colleague', 'time': '2026-10-18T10:00:00Z', 'content': 'First warning.'},
        {'user': 'Anonymous', 'date': '2026-10-18T10:05:00Z', 'text': 'Second warning message.'}
    ]
    r_json = c.post('/api/evidence', files={'file': ('chat_export.json', json.dumps(chat_list).encode('utf-8'))})
    assert r_json.status_code == 200
    assert r_json.json()['status'] == 'Parsed'
    ev_id = r_json.json()['id']
    state = c.get('/api/state').json()
    events = [e for e in state['events'] if e['evidence_id'] == ev_id]
    assert len(events) == 2
    assert events[0]['sender'] == 'Colleague'
    assert events[1]['content'] == 'Second warning message.'

    # 2. CSV spreadsheet format
    csv_data = b'timestamp,sender,content\n2026-10-18T11:00:00Z,Manager,Workplace harassment note\n'
    r_csv = c.post('/api/evidence', files={'file': ('export.csv', csv_data)})
    assert r_csv.status_code == 200
    assert 'Parsed' in r_csv.json()['status']
    csv_id = r_csv.json()['id']
    state2 = c.get('/api/state').json()
    csv_events = [e for e in state2['events'] if e['evidence_id'] == csv_id]
    assert len(csv_events) == 1
    assert csv_events[0]['sender'] == 'Manager'

def test_report_includes_documented_incidents(env):
    c, m = env
    c.post('/api/incidents', json={'title': 'Repeated Discord stalking', 'description': 'Tracked user location and harassed friends', 'occurred_at': '2026-10-18T12:00:00Z'})
    c.post('/api/incidents', json={'title': 'Voicemail threat', 'description': 'Caller stated they were waiting outside', 'occurred_at': '2026-10-18T13:00:00Z'})
    
    # Generate report preview with 0 evidence files selected
    preview = c.post('/api/report/preview', json={'evidence_ids': [], 'redact': ['stalking'], 'note': 'Summary note'}).json()['text']
    assert 'Documented Incidents' in preview
    assert 'Repeated Discord [REDACTED]' in preview
    assert 'Voicemail threat' in preview
    assert 'waiting outside' in preview
