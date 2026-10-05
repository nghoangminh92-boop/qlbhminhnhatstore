const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Set VITE_API_URL when the frontend and API are hosted on different domains.
export async function api(url, method = 'GET', body) {
  const r = await fetch(`${API_BASE}${url}`, {
    method,
    credentials: API_BASE ? 'include' : 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error || 'Lỗi máy chủ');
    e.status = r.status;
    throw e;
  }
  return j;
}
