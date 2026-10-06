const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Set VITE_API_URL when the frontend and API are hosted on different domains.

// Số phiên bản dữ liệu cửa hàng trên server. Lấy từ GET /api/data, gửi kèm khi PUT /api/data
// để server phát hiện có người khác vừa sửa (lỗi 409) thay vì ghi đè dữ liệu của họ.
let dataRevision = null;

// Các lần lưu được xếp hàng tuần tự để lần sau luôn dùng số phiên bản mới nhất của lần trước.
let saveQueue = Promise.resolve();

async function request(url, method, body) {
  const isData = url === '/api/data';
  const payload = isData && method === 'PUT' && body && dataRevision !== null
    ? { ...body, revision: dataRevision }
    : body;

  const r = await fetch(`${API_BASE}${url}`, {
    method,
    credentials: API_BASE ? 'include' : 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error || 'Lỗi máy chủ');
    e.status = r.status;
    throw e;
  }
  if (isData && Number.isInteger(j.revision)) dataRevision = j.revision;
  return j;
}

export function api(url, method = 'GET', body) {
  if (url === '/api/data' && method === 'PUT') {
    const run = saveQueue.then(() => request(url, method, body));
    saveQueue = run.catch(() => {});
    return run;
  }
  return request(url, method, body);
}