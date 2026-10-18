export type Evidence={id:string;filename:string;sha256:string;size:number;imported_at:string;status:string;source:string;original_time:string|null};
export type Event={id:string;evidence_id:string;content:string;sender:string;time:string|null;platform:string;timezone_basis:string};
export type Finding={id:string;title:string;summary:string;evidence_ids:string[];origin:string;decision:string;limitations:string;direct_observations?:string[];quotations?:Record<string,string>;possible_interpretations?:string[]};
export type AuthUser={id:string;name:string;email:string;provider:string;provider_id:string;avatar_initials:string;role:string;vultr_region:string;vultr_region_name:string;vultr_instance_id:string;vultr_datacenter:string;encryption_standard:string;authenticated_at:string};
export type State={case:{id:string;title:string;description:string}|null;evidence:Evidence[];events:Event[];incidents:{id:string;title:string;description:string;occurred_at:string|null;created_at:string}[];findings:Finding[]};
function authHeaders(body?: unknown): HeadersInit {
  const headers: Record<string, string> = {};
  if (!(body instanceof FormData) && body) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('aegis_auth_token') : null;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}
  return headers;
}

export async function api<T>(path:string,body?:unknown,method?:string):Promise<T>{
  const headers = authHeaders(body);
  const r = await fetch('/api'+path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: Object.keys(headers).length ? headers : undefined,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
  });
  if(!r.ok){
    let err;
    try { err = await r.json() } catch { throw Error('Server unavailable. Start the AEGIS backend.') }
    throw Error(typeof err.detail === 'string' ? err.detail : 'Check the form values and try again.')
  }
  return r.json()
}

export async function blobRequest(path:string,body:unknown){
  const headers = authHeaders(body);
  const r = await fetch('/api'+path, {
    method: 'POST',
    headers: Object.keys(headers).length ? headers : undefined,
    body: JSON.stringify(body)
  });
  if(!r.ok){
    const e = await r.json();
    throw Error(e.detail || 'Request failed')
  }
  return r.blob()
}
