// Gọi API backend. Cookie đăng nhập (httpOnly) được trình duyệt tự gửi kèm.
export async function api(url, method = 'GET', body) {
  const r = await fetch(url, {
    method,
    credentials: 'same-origin',
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
