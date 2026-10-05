import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

const roleName = role => ({ admin: 'Admin', owner: 'Admin', manager: 'Quản lý', staff: 'Nhân viên' }[role] || role);

export default function Accounts({ role: actorRole, username: actorName }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'staff' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api('/api/accounts');
      setAccounts(result.accounts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async event => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await api('/api/accounts', 'POST', {
        username: form.username.trim().toLowerCase(),
        password: form.password,
        role: form.role
      });
      setForm({ username: '', password: '', role: 'staff' });
      setMessage('Đã tạo tài khoản.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateAccount = async (account, updates) => {
    setError('');
    setMessage('');
    setBusyId(account.id);
    try {
      await api(`/api/accounts/${encodeURIComponent(account.id)}`, 'PATCH', updates);
      setMessage(`Đã cập nhật tài khoản ${account.username}.`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const resetPasswordFor = async event => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (resetPassword !== resetConfirm) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    setResetting(true);
    try {
      await api(`/api/accounts/${encodeURIComponent(resetTarget.id)}/reset-password`, 'POST', {
        newPassword: resetPassword
      });
      setMessage(`Đã đặt lại mật khẩu cho ${resetTarget.username}.`);
      setResetTarget(null);
      setResetPassword('');
      setResetConfirm('');
    } catch (e) {
      setError(e.message);
    } finally {
      setResetting(false);
    }
  };

  const deleteAccount = async account => {
    const confirmation = window.prompt(
      `Xóa tài khoản "${account.username}"?\nDữ liệu cửa hàng sẽ được giữ nguyên.\nNhập chính xác tên đăng nhập để xác nhận:`
    );
    if (confirmation !== account.username) return;

    setError('');
    setMessage('');
    setBusyId(account.id);
    try {
      await api(`/api/accounts/${encodeURIComponent(account.id)}`, 'DELETE');
      setMessage(`Đã xóa tài khoản ${account.username}. Dữ liệu cửa hàng được giữ nguyên.`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const isAdmin = actorRole === 'admin' || actorRole === 'owner';
  const canManage = account => account.username !== actorName
    && account.role !== 'admin'
    && account.role !== 'owner'
    && (isAdmin || actorRole === 'manager');

  return <>
    <div className="card">
      <h2>Tạo tài khoản nhân viên</h2>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '0 0 10px' }}>
        Tên đăng nhập 3–30 ký tự a-z, 0–9, dấu chấm, gạch dưới hoặc gạch ngang. Mật khẩu dài 8–100 ký tự.
        {' Admin và quản lý có thể tạo tài khoản quản lý hoặc nhân viên.'}
      </p>
      <form className="form" onSubmit={create}>
        <div><label htmlFor="account-username">Tên đăng nhập</label>
          <input id="account-username" autoComplete="off" minLength="3" maxLength="30" pattern="[A-Za-z0-9._-]+" required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></div>
        <div><label htmlFor="account-password">Mật khẩu tạm thời</label>
          <input id="account-password" type="password" autoComplete="new-password" minLength="8" maxLength="100" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
        <div><label htmlFor="account-role">Vai trò</label>
          <select id="account-role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="staff">Nhân viên</option><option value="manager">Quản lý</option>
          </select></div>
        <button className="p" disabled={saving}>{saving ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
      </form>
    </div>
    <div className="card">
      <div className="sp" style={{ justifyContent: 'space-between' }}>
        <h2>Danh sách tài khoản cửa hàng</h2>
        <button onClick={load} disabled={loading}>Tải lại</button>
      </div>
      {error && <p role="alert" style={{ color: 'var(--neg)' }}>{error}</p>}
      {message && <p role="status" style={{ color: 'var(--acc)' }}>{message}</p>}
      {loading ? <div className="empty">Đang tải tài khoản…</div> : <div className="scroll">
        {accounts.length ? <table><thead><tr><th>Tên đăng nhập</th><th>Vai trò</th><th>Trạng thái</th><th>Ngày tạo</th><th /></tr></thead>
          <tbody>{accounts.map(account => {
            const manageable = canManage(account);
            const date = account.created ? new Date(account.created) : null;
            return <tr key={account.id}>
              <td>{account.username}{account.username === actorName ? ' (bạn)' : ''}</td>
              <td>{manageable
                ? <select aria-label={`Vai trò ${account.username}`} value={account.role} disabled={busyId === account.id}
                  onChange={e => updateAccount(account, { role: e.target.value })}>
                  <option value="staff">Nhân viên</option><option value="manager">Quản lý</option>
                </select>
                : roleName(account.role)}</td>
              <td><span className={`tag${account.active ? '' : ' l'}`}>{account.active ? 'Đang hoạt động' : 'Đã khóa'}</span></td>
              <td>{date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('vi-VN') : '—'}</td>
              <td>{manageable && <div className="sp">
                <button disabled={busyId === account.id} onClick={() => updateAccount(account, { active: !account.active })}>
                  {account.active ? 'Khóa' : 'Mở khóa'}
                </button>
                <button disabled={busyId === account.id} onClick={() => {
                  setError('');
                  setResetTarget(account);
                  setResetPassword('');
                  setResetConfirm('');
                }}>Đặt lại mật khẩu</button>
                <button className="x" disabled={busyId === account.id} onClick={() => deleteAccount(account)}>Xóa</button>
              </div>}</td>
            </tr>;
          })}</tbody></table> : <div className="empty">Chưa có tài khoản nào trong cửa hàng.</div>}
      </div>}
      <p style={{ color: 'var(--mute)', fontSize: 13, marginBottom: 0 }}>
        Admin và quản lý có thể quản lý tài khoản nhân viên/quản lý khác. Xóa tài khoản chỉ xóa thông tin đăng nhập, không xóa dữ liệu dùng chung của cửa hàng. Không thể đổi vai trò, khóa, đặt lại mật khẩu hoặc xóa tài khoản Admin hay tự thay đổi tài khoản của mình.
      </p>
    </div>
    {resetTarget && <div role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !resetting) setResetTarget(null);
    }} style={{ position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(0,0,0,.55)' }}>
      <section className="card" role="dialog" aria-modal="true" aria-labelledby="reset-account-title" style={{ width: '100%', maxWidth: 400 }}>
        <h2 id="reset-account-title">Đặt lại mật khẩu: {resetTarget.username}</h2>
        <form onSubmit={resetPasswordFor}>
          <label htmlFor="reset-account-password">Mật khẩu mới (8–100 ký tự)</label>
          <input id="reset-account-password" type="password" autoComplete="new-password" minLength="8" maxLength="100" required
            value={resetPassword} onChange={event => setResetPassword(event.target.value)} />
          <label htmlFor="reset-account-confirm">Nhập lại mật khẩu</label>
          <input id="reset-account-confirm" type="password" autoComplete="new-password" minLength="8" maxLength="100" required
            value={resetConfirm} onChange={event => setResetConfirm(event.target.value)} />
          {error && <p role="alert" style={{ color: 'var(--neg)' }}>{error}</p>}
          <div className="sp" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" disabled={resetting} onClick={() => setResetTarget(null)}>Hủy</button>
            <button className="p" disabled={resetting}>{resetting ? 'Đang cập nhật…' : 'Đặt mật khẩu mới'}</button>
          </div>
        </form>
      </section>
    </div>}
  </>;
}
