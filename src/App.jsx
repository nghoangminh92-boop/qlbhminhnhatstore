import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { ymOf, pname } from './lib';
import Dashboard from './views/Dashboard';
import Sales from './views/Sales';
import Inventory from './views/Inventory';
import Expenses from './views/Expenses';
import Reports from './views/Reports';
import Revenue from './views/Revenue';
import Accounts from './views/Accounts';

const TABS = [['dash', 'Tổng quan', Dashboard], ['sale', 'Bán hàng', Sales], ['inv', 'Kho điện thoại', Inventory], ['exp', 'Chi tiêu', Expenses], ['rev', 'Doanh thu', Revenue], ['rep', 'Báo cáo', Reports]];
const ROLE_NAMES = { admin: 'Admin', owner: 'Admin', manager: 'Quản lý', staff: 'Nhân viên' };
const TAB_ICONS = {
  dash: 'M3 10.5 12 3l9 7.5M5 9v11h14V9M9 20v-6h6v6',
  sale: 'M3 8h18l-1.5 12h-15L3 8zm4 0 2-5h6l2 5M9 12v.01M15 12v.01',
  inv: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4 14h4',
  exp: 'M3 6h18v13H3zM3 10h18m-4 5h1M7 6V4h10v2',
  rev: 'M12 2v20m5-16H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  rep: 'M4 19V5m0 14h17M8 15l4-5 4 3 5-7',
  accounts: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7-3a4 4 0 0 1 0 7m1 2h2a3 3 0 0 1 3 3v1'
};

function StoreIcon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={TAB_ICONS[name] || TAB_ICONS.dash} /></svg>;
}

function sameRecord(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameRepairRevenues(left = [], right = []) {
  const normalize = rows => rows
    .map(({ id, date, amt, materialCost, note }) => ({
      id, date, amt: Number(amt), materialCost: Number(materialCost || 0), note: note || ''
    }))
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  return sameRecord(normalize(left), normalize(right));
}

function stockDateStorageKey(username) {
  return `minh-nhat-store:stock-dates:${encodeURIComponent(username || '')}`;
}

function readCachedStockDates(username) {
  try {
    const saved = localStorage.getItem(stockDateStorageKey(username));
    if (!saved) return {};
    const dates = JSON.parse(saved);
    if (!dates || typeof dates !== 'object' || Array.isArray(dates)) {
      throw new Error('Dữ liệu ngày nhập kho lưu trên trình duyệt không hợp lệ.');
    }
    return dates;
  } catch (error) {
    console.error('Không thể đọc ngày nhập kho đã lưu trên trình duyệt:', error);
    return {};
  }
}

function cacheStockDates(username, phones) {
  try {
    const dates = Object.fromEntries(phones
      .filter(phone => phone.stockDate)
      .map(phone => [String(phone.id), phone.stockDate]));
    localStorage.setItem(stockDateStorageKey(username), JSON.stringify(dates));
    return true;
  } catch (error) {
    console.error('Không thể lưu ngày nhập kho trên trình duyệt:', error);
    return false;
  }
}

function staffCanUpdate(previous, next) {
  const previousSales = new Map(previous.sales.map(item => [item.id, item]));
  const nextSales = new Map(next.sales.map(item => [item.id, item]));
  const previousPhones = new Map(previous.phones.map(item => [item.id, item]));
  const nextPhones = new Map(next.phones.map(item => [item.id, item]));
  const soldQuantities = new Map();
  const deletedQuantities = new Map();
  const returnedQuantities = new Map();
  const previousReturns = new Map((previous.saleReturns || []).map(item => [item.id, item]));
  const nextReturns = new Map((next.saleReturns || []).map(item => [item.id, item]));
  const previousReturnTotals = new Map();
  const nextReturnTotals = new Map();
  const nextRefundTotals = new Map();

  if (next.sales.length !== nextSales.size || next.phones.length !== nextPhones.size ||
      (next.saleReturns || []).length !== nextReturns.size ||
      next.exps.length !== previous.exps.length ||
      !previous.exps.every((item, index) => sameRecord(item, next.exps[index])) ||
      !sameRecord(previous.manualRevenues || [], next.manualRevenues || []) ||
      !sameRecord(previous.repairRevenues || [], next.repairRevenues || [])) return false;

  const returnedFromExistingSales = new Set((previous.saleReturns || []).map(item => item.saleId));
  for (const [id, sale] of previousSales) {
    const updated = nextSales.get(id);
    if (!updated) {
      if (returnedFromExistingSales.has(id)) return false;
      deletedQuantities.set(sale.phoneId, (deletedQuantities.get(sale.phoneId) || 0) + sale.qty);
      continue;
    }
    const { returnedQty: previousReturnedQty = 0, returnRefund: previousRefund = 0, ...previousSale } = sale;
    const { returnedQty: updatedReturnedQty = 0, returnRefund: updatedRefund = 0, ...updatedSale } = updated;
    if (!sameRecord(previousSale, updatedSale) ||
        !Number.isFinite(Number(previousReturnedQty)) || !Number.isFinite(Number(previousRefund)) ||
        !Number.isFinite(Number(updatedReturnedQty)) || !Number.isFinite(Number(updatedRefund))) return false;
  }
  for (const sale of next.sales) {
    if (previousSales.has(sale.id)) continue;
    if (!sale.id || !Number.isInteger(Number(sale.qty)) || sale.qty < 1 ||
        !previousPhones.has(sale.phoneId)) return false;
    soldQuantities.set(sale.phoneId, (soldQuantities.get(sale.phoneId) || 0) + sale.qty);
  }

  for (const saleReturn of previous.saleReturns || []) {
    if (!sameRecord(saleReturn, nextReturns.get(saleReturn.id))) return false;
    previousReturnTotals.set(saleReturn.saleId, (previousReturnTotals.get(saleReturn.saleId) || 0) + saleReturn.qty);
  }
  for (const saleReturn of next.saleReturns || []) {
    if (previousReturns.has(saleReturn.id)) continue;
    const sale = previousSales.get(saleReturn.saleId);
    if (!saleReturn.id || !sale || !saleReturn.date || saleReturn.date < sale.date ||
        !Number.isInteger(Number(saleReturn.qty)) || saleReturn.qty < 1 ||
        !Number.isFinite(Number(saleReturn.refundAmt)) || saleReturn.refundAmt < 0 ||
        saleReturn.refundAmt > sale.price * saleReturn.qty) return false;
    returnedQuantities.set(sale.phoneId, (returnedQuantities.get(sale.phoneId) || 0) + saleReturn.qty);
    previousReturnTotals.set(sale.id, (previousReturnTotals.get(sale.id) || 0) + saleReturn.qty);
  }
  for (const [saleId, returnedQty] of previousReturnTotals) {
    const sale = previousSales.get(saleId);
    if (!sale || returnedQty > sale.qty) return false;
  }
  for (const saleReturn of next.saleReturns || []) {
    if (!previousReturns.has(saleReturn.id)) continue;
    const existingSale = previousSales.get(saleReturn.saleId);
    const existingReturn = previousReturns.get(saleReturn.id);
    if (!existingSale || !sameRecord(existingReturn, saleReturn)) return false;
  }
  for (const saleReturn of next.saleReturns || []) {
    nextReturnTotals.set(saleReturn.saleId, (nextReturnTotals.get(saleReturn.saleId) || 0) + saleReturn.qty);
    nextRefundTotals.set(saleReturn.saleId, (nextRefundTotals.get(saleReturn.saleId) || 0) + saleReturn.refundAmt);
  }
  for (const sale of next.sales) {
    if (Number(sale.returnedQty || 0) !== (nextReturnTotals.get(sale.id) || 0) ||
        Number(sale.returnRefund || 0) !== (nextRefundTotals.get(sale.id) || 0)) return false;
  }

  for (const [id, phone] of previousPhones) {
    const updated = nextPhones.get(id);
    if (!updated) return false;
    const stockChange = -(soldQuantities.get(id) || 0) + (deletedQuantities.get(id) || 0) + (returnedQuantities.get(id) || 0);
    const expectedStock = stockChange === 0 ? phone.stock : Number(phone.stock || 0) + stockChange;
    const expected = { ...phone, stock: expectedStock };
    if (expected.stock < 0 || !sameRecord(expected, updated)) return false;
  }

  return next.phones.every(phone => phone.stock >= 0);
}

function Login({ hasUsers, onDone }) {
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false), [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState('');
  const reg = !hasUsers;
  const submit = async e => {
    e.preventDefault(); setErr(''); setNotice(''); setBusy(true);
    if (recovering && newPassword !== confirmPassword) {
      setErr('Mật khẩu nhập lại không khớp.');
      setBusy(false);
      return;
    }
    try {
      if (recovering) {
        await api('/api/forgot-password/admin', 'POST', {
          username: u,
          recoveryCode,
          newPassword
        });
        setRecovering(false);
        setRecoveryCode('');
        setNewPassword('');
        setConfirmPassword('');
        setP('');
        setNotice('Đã đặt lại mật khẩu Admin. Hãy đăng nhập bằng mật khẩu mới.');
      } else {
        const j = await api(reg ? '/api/register' : '/api/login', 'POST', { username: u, password: p });
        onDone(j.user, j.role);
      }
    }
    catch (x) { setErr(x.message); setBusy(false); }
    finally { setBusy(false); }
  };
  return <div className="login mn-login">
    <style>{`
      .mn-login{--mn-red:#f01320;position:fixed;inset:0;z-index:100;display:block!important;padding:0!important;overflow:auto;background:#000;color:#fff}
      .mn-login,.mn-login *{box-sizing:border-box}
      .mn-hero{position:relative;isolation:isolate;display:grid;grid-template-rows:auto 1fr auto;width:100%;min-height:100vh;min-height:100svh;overflow:hidden;background:#000}
      .mn-media,.mn-scrim{position:absolute;inset:0;pointer-events:none}
      .mn-media{z-index:-2;overflow:hidden;background:#000}
      .mn-media video{width:100%;height:100%;object-fit:cover;object-position:center}
      .mn-scrim{z-index:-1;background:linear-gradient(to right,transparent 0%,transparent 40%,rgba(0,0,0,.4) 66%,rgba(0,0,0,.82) 100%),linear-gradient(to bottom,rgba(0,0,0,.48),transparent 25%,transparent 76%,rgba(0,0,0,.72))}
      .mn-nav{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:clamp(20px,3vw,38px) clamp(20px,5vw,84px)}
      .mn-logo{display:flex;flex-direction:column;align-items:center;gap:0;color:#fff;text-decoration:none}
      .mn-logo-symbol{width:56px;height:48px;flex:none;color:var(--mn-red)}
      .mn-logo-words{font:600 clamp(13px,1.35vw,18px)/1 "Be Vietnam Pro",sans-serif;letter-spacing:.12em}
      .mn-logo-words small{display:block;margin-top:4px;color:var(--mn-red);font:500 10px/1 "Be Vietnam Pro",sans-serif;letter-spacing:.4em;text-align:center}
      .mn-nav-note{color:rgba(255,255,255,.68);font:500 11px/1.5 "Be Vietnam Pro",sans-serif;letter-spacing:.16em;text-align:right}
      .mn-body{display:flex;align-items:center;justify-content:flex-end;min-height:0;overflow-y:auto;padding:24px clamp(20px,8vw,140px)}
      .mn-panel{width:min(35vw,480px);min-width:340px}
      .mn-chip{display:inline-block;border-left:2px solid var(--mn-red);background:rgba(255,255,255,.08);padding:10px 15px;font:500 11px/1 "Be Vietnam Pro",sans-serif;letter-spacing:.18em}
      .mn-title{margin:30px 0 0;font:300 clamp(42px,5vw,70px)/1.1 "Be Vietnam Pro",sans-serif;letter-spacing:.015em}
      .mn-tag{margin:12px 0 0;color:rgba(255,255,255,.66);font:300 12px/1.7 "Be Vietnam Pro",sans-serif;letter-spacing:.1em;text-transform:uppercase}
      .mn-form{display:grid;gap:20px;margin-top:38px}
      .mn-fields{display:grid;gap:18px}
      .mn-field label{display:block;margin-bottom:7px;color:rgba(255,255,255,.68);font:500 11px/1.5 "Be Vietnam Pro",sans-serif;letter-spacing:.07em}
      .mn-field input{width:100%;min-height:46px;padding:10px 12px;border:1px solid rgba(255,255,255,.25);border-radius:0;background:rgba(0,0,0,.18);color:#fff;font:400 15px/1.4 "Be Vietnam Pro",sans-serif}
      .mn-field input::placeholder{color:rgba(255,255,255,.48)}
      .mn-field input:focus{border-color:rgba(255,255,255,.8);outline:1px solid rgba(255,255,255,.5);outline-offset:2px}
      .mn-submit,.mn-forgot{width:100%;min-height:50px;border-radius:0;font:500 11px/1.4 "Be Vietnam Pro",sans-serif;letter-spacing:.17em;text-transform:uppercase;transition:background .2s ease,border-color .2s ease,color .2s ease}
      .mn-submit{border:1px solid var(--mn-red);background:var(--mn-red);color:#fff}
      .mn-submit:hover{border-color:#ff3340;background:#ff3340}
      .mn-submit:disabled,.mn-forgot:disabled{opacity:.65;cursor:wait}
      .mn-forgot{min-height:auto;padding:5px;border:0;background:transparent;color:rgba(255,255,255,.76)}
      .mn-forgot:hover{color:#fff;text-decoration:underline;text-underline-offset:4px}
      .mn-error,.mn-notice{margin:0;font:400 12px/1.6 "Be Vietnam Pro",sans-serif}
      .mn-error{color:#ff7b84}.mn-notice{color:#fff}
      .mn-footer{padding:20px max(20px,env(safe-area-inset-left)) max(20px,env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.16);color:rgba(255,255,255,.82);font:400 12px/1.5 "Be Vietnam Pro",sans-serif;letter-spacing:.14em;text-align:center}
      .mn-login :is(a,button,input):focus-visible{outline:1px solid rgba(255,255,255,.8);outline-offset:3px}
      @media(max-width:900px){.mn-body{justify-content:center;padding:28px clamp(20px,8vw,60px)}.mn-panel{width:min(100%,500px);min-width:0}.mn-scrim{background:linear-gradient(to bottom,rgba(0,0,0,.35),rgba(0,0,0,.18) 25%,rgba(0,0,0,.78) 100%)}}
      @media(max-width:520px){.mn-nav{padding-top:max(18px,env(safe-area-inset-top));padding-left:20px;padding-right:20px}.mn-logo-symbol{width:48px;height:42px}.mn-nav-note{max-width:130px;font-size:9px}.mn-body{align-items:center;padding:20px}.mn-title{font-size:clamp(40px,12vw,58px);margin-top:25px}.mn-form{margin-top:28px}.mn-footer{font-size:11px}}
      @media(prefers-reduced-motion:reduce){.mn-media video{display:none}.mn-media{background:#000 url('https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260806_132328_5f9029c8-218f-4489-82b6-29ff2849920e.png') center/cover no-repeat}.mn-login *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
    `}</style>
    <section className="mn-hero" aria-label="Đăng nhập Minh Nhật Store">
      <div className="mn-media" aria-hidden="true">
        <video autoPlay muted loop playsInline preload="auto" poster="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260806_132328_5f9029c8-218f-4489-82b6-29ff2849920e.png">
          <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260806_133255_956f653f-5d80-4b06-abd5-0f46c98b60fa.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="mn-scrim" aria-hidden="true" />
      <header className="mn-nav">
        <a className="mn-logo" href="#" aria-label="Minh Nhật Store">
          <svg className="mn-logo-symbol" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <path d="M50 4 59 15 50 25 41 15 50 4Z" fill="currentColor" />
            <path d="M25 29 50 54 75 29M25 29v49c0 6-4 11-10 14V44c0-8 5-11 10-5l17 18c5 5 11 5 16 0l17-18c5-6 10-3 10 5v48c-6-3-10-8-10-14V29" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="mn-logo-words">MINH NHẬT<small>STORE</small></span>
        </a>
        <span className="mn-nav-note">QUẢN LÝ CỬA HÀNG ĐIỆN THOẠI</span>
      </header>
      <main className="mn-body">
        <div className="mn-panel">
          <span className="mn-chip">[ HỆ THỐNG NỘI BỘ ]</span>
          <h1 className="mn-title">{recovering ? 'Khôi phục mật khẩu' : reg ? 'Tạo tài khoản Admin' : 'Đăng nhập'}</h1>
          <p className="mn-tag">{recovering ? 'Nhập mã khôi phục Admin để đặt mật khẩu mới.' : reg ? 'Tài khoản đầu tiên sẽ có quyền Admin.' : 'Quản lý cửa hàng Minh Nhật Store.'}</p>
          <form className="mn-form" onSubmit={submit}>
            <div className="mn-fields">
              <div className="mn-field">
                <label htmlFor="lu">Tên đăng nhập</label>
                <input id="lu" autoComplete="username" placeholder="Tên đăng nhập" required value={u} onChange={e => setU(e.target.value)} />
              </div>
              {recovering ? <>
                <div className="mn-field">
                  <label htmlFor="recovery-code">Mã khôi phục Admin</label>
                  <input id="recovery-code" type="password" autoComplete="off" placeholder="Mã khôi phục Admin" required value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} />
                </div>
                <div className="mn-field">
                  <label htmlFor="new-admin-password">Mật khẩu mới (8–100 ký tự)</label>
                  <input id="new-admin-password" type="password" autoComplete="new-password" minLength="8" maxLength="100" placeholder="Mật khẩu mới" required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
                <div className="mn-field">
                  <label htmlFor="confirm-admin-password">Nhập lại mật khẩu mới</label>
                  <input id="confirm-admin-password" type="password" autoComplete="new-password" minLength="8" maxLength="100" placeholder="Nhập lại mật khẩu mới" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
              </> : <div className="mn-field">
                <label htmlFor="lp">Mật khẩu {reg ? '(8–100 ký tự)' : ''}</label>
                <input id="lp" type="password" autoComplete={reg ? 'new-password' : 'current-password'} minLength={reg ? 8 : undefined} maxLength="100" placeholder="Mật khẩu" required value={p} onChange={e => setP(e.target.value)} />
              </div>}
            </div>
            {err && <p className="mn-error" role="alert">{err}</p>}
            {notice && <p className="mn-notice" role="status">{notice}</p>}
            <button className="mn-submit" disabled={busy}>
              {busy ? 'Đang xử lý…' : recovering ? 'Đặt lại mật khẩu' : reg ? 'Tạo tài khoản' : 'Đăng nhập'}
            </button>
            {!reg && <button className="mn-forgot" type="button" disabled={busy} onClick={() => {
              setRecovering(!recovering);
              setErr('');
              setNotice('');
              setRecoveryCode('');
              setNewPassword('');
              setConfirmPassword('');
            }}>{recovering ? 'Quay lại đăng nhập' : 'Quên mật khẩu Admin?'}</button>}
          </form>
        </div>
      </main>
      <footer className="mn-footer">@MinhNhatstore</footer>
    </section>
  </div>;
}

function StartupScreen({ failed = false }) {
  return <main className="store-startup" role={failed ? 'alert' : 'status'} aria-live={failed ? 'assertive' : 'polite'}>
    <section className="store-startup-card">
      <div className="store-startup-brand"><span className="store-startup-mark">M</span><span><strong>MINH NHẬT STORE</strong><small>HỆ THỐNG QUẢN LÝ BÁN HÀNG</small></span></div>
      <div className={`store-startup-illustration${failed ? ' failed' : ''}`}>
        {failed ? <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M19 44h27a11 11 0 0 0 1-22 16 16 0 0 0-30-2 12 12 0 0 0 2 24Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="m25 29 14 14m0-14L25 43" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
          : <span className="store-startup-spinner" />}
      </div>
      <h1>{failed ? 'Chưa kết nối được máy chủ' : 'Đang mở không gian làm việc'}</h1>
      <p>{failed ? 'Máy chủ chưa phản hồi. Kiểm tra kết nối mạng hoặc trạng thái API, sau đó thử tải lại.' : 'Đang kết nối an toàn và đồng bộ dữ liệu cửa hàng của bạn.'}</p>
      {!failed && <div className="store-startup-skeleton" aria-hidden="true"><i /><i /><i /></div>}
      {failed && <button className="store-startup-retry" onClick={() => window.location.reload()}>Thử kết nối lại</button>}
      <span className="store-startup-footnote">{failed ? 'Dữ liệu không bị thay đổi trong quá trình kết nối.' : 'Vui lòng đợi trong giây lát'}</span>
    </section>
  </main>;
}

export default function App() {
  const [phase, setPhase] = useState('boot');     // boot | login | app | down
  const [hasUsers, setHasUsers] = useState(true);
  const [user, setUser] = useState('');
  const [role, setRole] = useState('');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(() => window.location.hash.slice(1) || 'dash');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [month, setMonth] = useState(ymOf(new Date()));
  const [st, setSt] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const ref = useRef(null), timer = useRef(null);
  const saveWaiters = useRef([]), verifyRepairsOnSave = useRef(false), verifyStockDatesOnSave = useRef(false);

  const persist = (d, verifyRepairs = false, verifyStockDates = false) => new Promise(resolve => {
    setSt('Đang lưu…'); clearTimeout(timer.current);
    saveWaiters.current.push(resolve);
    verifyRepairsOnSave.current = verifyRepairsOnSave.current || verifyRepairs;
    verifyStockDatesOnSave.current = verifyStockDatesOnSave.current || verifyStockDates;
    timer.current = setTimeout(async () => {
      const waiters = saveWaiters.current.splice(0);
      const shouldVerifyRepairs = verifyRepairsOnSave.current;
      const shouldVerifyStockDates = verifyStockDatesOnSave.current;
      verifyRepairsOnSave.current = false;
      verifyStockDatesOnSave.current = false;
      try {
        await api('/api/data', 'PUT', d);
        if (shouldVerifyRepairs || shouldVerifyStockDates) {
          const saved = await api('/api/data');
          if (shouldVerifyRepairs && !sameRepairRevenues(d.repairRevenues || [], saved.repairRevenues || [])) {
            throw new Error('Máy chủ chưa lưu doanh thu sửa chữa. Cần cập nhật API /api/data của backend.');
          }
          const expectedStockDates = new Map(d.phones.map(phone => [String(phone.id), phone.stockDate || '']));
          const savedStockDates = new Map((saved.phones || []).map(phone => [String(phone.id), phone.stockDate || '']));
          if (shouldVerifyStockDates && (expectedStockDates.size !== savedStockDates.size ||
              [...expectedStockDates].some(([id, date]) => savedStockDates.get(id) !== date))) {
            if (!cacheStockDates(user, d.phones)) {
              throw new Error('Máy chủ chưa lưu ngày nhập kho và trình duyệt không thể lưu bản dự phòng. Hãy kiểm tra quyền lưu trữ của trình duyệt.');
            }
            setSt('Ngày nhập kho đang được giữ trên trình duyệt; API backend chưa lưu trường stockDate.');
            waiters.forEach(done => done(true));
            return;
          }
        }
        if (shouldVerifyStockDates) cacheStockDates(user, d.phones);
        setSt('Đã lưu');
        waiters.forEach(done => done(true));
      } catch (e) {
        if (e.status === 401) setPhase('login');
        setSt('Lưu lỗi: ' + e.message);
        waiters.forEach(done => done(false));
      }
    }, 400);
  });
  const update = fn => {
    const n = fn(ref.current);
    if (role === 'staff' && !staffCanUpdate(ref.current, n)) {
      setSt('Nhân viên chỉ được thêm điện thoại, đơn bán mới hoặc ghi nhận đổi trả hợp lệ.');
      return Promise.resolve(false);
    }
    const repairRevenuesChanged = !sameRepairRevenues(
      ref.current.repairRevenues || [],
      n.repairRevenues || []
    );
    const stockDatesChanged = JSON.stringify(ref.current.phones.map(phone => [phone.id, phone.stockDate || '']).sort()) !==
      JSON.stringify(n.phones.map(phone => [phone.id, phone.stockDate || '']).sort());
    ref.current = n; setData(n);
    return persist(n, repairRevenuesChanged, stockDatesChanged);
  };

  const enter = async (name, accountRole) => {
    const d = await api('/api/data');
    const nextRole = d.role || accountRole || 'staff';
    const availableTabs = nextRole === 'staff'
      ? TABS.filter(item => item[0] === 'sale' || item[0] === 'inv')
      : ['admin', 'owner', 'manager'].includes(nextRole)
        ? [...TABS, ['accounts']]
        : TABS;
    const requestedTab = window.location.hash.slice(1);
    const saleReturns = d.saleReturns || [];
    const returnSummary = new Map();
    for (const item of saleReturns) {
      const current = returnSummary.get(item.saleId) || { returnedQty: 0, returnRefund: 0 };
      current.returnedQty += Number(item.qty) || 0;
      current.returnRefund += Number(item.refundAmt) || 0;
      returnSummary.set(item.saleId, current);
    }
    const cachedStockDates = readCachedStockDates(name);
    const phones = (d.phones || []).map(phone => ({
      ...phone,
      stockDate: phone.stockDate || cachedStockDates[String(phone.id)] || ''
    }));
    const init = d.empty ? { phones: [], sales: [], exps: [], manualRevenues: [], repairRevenues: [], saleReturns: [] } : {
      phones,
      sales: (d.sales || []).map(sale => ({
        ...sale,
        returnedQty: returnSummary.get(sale.id)?.returnedQty || 0,
        returnRefund: returnSummary.get(sale.id)?.returnRefund || 0
      })),
      exps: d.exps || [],
      manualRevenues: d.manualRevenues || [],
      repairRevenues: d.repairRevenues || [],
      saleReturns
    };
    ref.current = init; setData(init); setUser(name); setRole(nextRole); setPhase('app'); setHasUsers(true);
    setTab(availableTabs.some(item => item[0] === requestedTab) ? requestedTab : nextRole === 'staff' ? 'sale' : 'dash');
    setSt('');
  };

  useEffect(() => {
    (async () => {
      try {
        const s = await api('/api/status'); setHasUsers(s.hasUsers);
        if (s.user) await enter(s.user, s.role); else setPhase('login');
      } catch { setPhase('down'); }
    })();
  }, []);

  useEffect(() => {
    if (phase === 'app' && tab && window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${tab}`);
    }
  }, [phase, tab]);

  const logout = async () => { try { await api('/api/logout', 'POST'); } catch {} ref.current = null; setData(null); setRole(''); setPhase('login'); };
  const clear = () => { if (confirm('Xóa toàn bộ điện thoại, đơn bán, đổi trả, doanh thu và chi tiêu?')) update(() => ({ phones: [], sales: [], exps: [], manualRevenues: [], repairRevenues: [], saleReturns: [] })); };

  if (phase === 'boot') return <StartupScreen />;
  if (phase === 'down') return <StartupScreen failed />;
  if (phase === 'login') return <Login hasUsers={hasUsers} onDone={enter} />;

  const canManage = role === 'admin' || role === 'owner' || role === 'manager';
  const tabs = role === 'staff'
    ? TABS.filter(t => t[0] === 'sale' || t[0] === 'inv')
    : canManage
      ? [...TABS, ['accounts', 'Tài khoản', Accounts]]
      : TABS;
  const View = (tabs.find(t => t[0] === tab) || tabs[0])[2];
  const activeTab = tabs.find(t => t[0] === tab) || tabs[0];
  const searchQuery = searchTerm.trim().toLocaleLowerCase('vi');
  const searchResults = searchQuery ? [
    ...data.phones.map(phone => ({ label: pname(phone), detail: `Kho · còn ${phone.stock}`, tab: 'inv' })),
    ...data.sales.map(sale => ({ label: sale.name, detail: `Đơn bán · ${sale.cust || 'Khách lẻ'} · ${sale.date}`, tab: 'sale' })),
    ...data.exps.map(expense => ({ label: expense.note || expense.cat, detail: `Chi tiêu · ${expense.date}`, tab: 'exp' }))
  ].filter(result => `${result.label} ${result.detail}`.toLocaleLowerCase('vi').includes(searchQuery)).slice(0, 6) : [];
  return <div className="store-shell">
    {menuOpen && <button className="store-scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`store-sidebar${menuOpen ? ' open' : ''}`} aria-label="Điều hướng cửa hàng">
      <button className="store-brand" title="Minh Nhật Store" aria-label="Minh Nhật Store" onClick={() => { setTab('dash'); setMenuOpen(false); }}>
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 3 19 7l-3 3-3-3 3-4ZM7 11l9 9 9-9M7 11v13c0 2-1 3-3 4V15c0-2 2-3 3-1l6 6c2 2 4 2 6 0l6-6c2-2 3-1 3 1v13c-2-1-3-2-3-4V11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="store-sidebar-brand"><strong>MINH NHẬT</strong><span>STORE MANAGEMENT</span></div>
      <nav className="store-nav" aria-label="Các chức năng">
        {tabs.map(item => <button
          key={item[0]}
          title={item[1]}
          aria-label={item[1]}
          aria-current={item[0] === tab ? 'page' : undefined}
          className={`store-nav-button${item[0] === tab ? ' active' : ''}`}
          onClick={() => { setTab(item[0]); setMenuOpen(false); }}
        ><StoreIcon name={item[0]} /><span>{item[1]}</span></button>)}
      </nav>
      <div className="store-side-bottom">
        <span className="store-side-divider" />
        <button className="store-nav-button" title="Đổi mật khẩu" aria-label="Đổi mật khẩu" onClick={() => { setPasswordOpen(true); setMenuOpen(false); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 2 11 12m10-10-6 20-4-9-9-4 20-7Z" /></svg><span>Đổi mật khẩu</span>
        </button>
        <button className="store-nav-button store-logout" title="Đăng xuất" aria-label="Đăng xuất" onClick={logout}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></svg><span>Đăng xuất</span>
        </button>
      </div>
    </aside>
    <div className="store-workspace">
      <header className="store-header">
        <button className="store-menu-toggle" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={menuOpen ? 'M18 6 6 18M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
        </button>
        <div className="store-header-copy">
          <div className="store-header-brand" aria-label="Minh Nhật Store">
            <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 3 19 7l-3 3-3-3 3-4Z" fill="currentColor" /><path d="M7 11l9 9 9-9M7 11v13c0 2-1 3-3 4V15c0-2 2-3 3-1l6 6c2 2 4 2 6 0l6-6c2-2 3-1 3 1v13c-2-1-3-2-3-4V11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>MINH NHẬT STORE</span>
          </div>
          <p>Xin chào, {user} <span>✦</span></p>
          <h1>{activeTab[1]}</h1>
        </div>
        <div className="store-header-actions">
          <div className="store-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
            <input
              type="search"
              value={searchTerm}
              placeholder="Tìm sản phẩm, đơn bán..."
              aria-label="Tìm kiếm toàn trang"
              aria-expanded={searchOpen && Boolean(searchQuery)}
              onFocus={() => setSearchOpen(true)}
              onChange={event => { setSearchTerm(event.target.value); setSearchOpen(true); }}
              onKeyDown={event => {
                if (event.key === 'Escape') { setSearchTerm(''); setSearchOpen(false); }
                if (event.key === 'Enter' && searchResults[0]) { setTab(searchResults[0].tab); setSearchTerm(''); setSearchOpen(false); }
              }}
            />
            {searchOpen && searchQuery && <div className="store-search-results">
              {searchResults.length ? searchResults.map((result, index) => <button key={`${result.tab}-${result.label}-${index}`} onMouseDown={event => event.preventDefault()} onClick={() => {
                setTab(result.tab); setSearchTerm(''); setSearchOpen(false);
              }}><strong>{result.label}</strong><span>{result.detail}</span></button>) : <p>Không tìm thấy kết quả phù hợp.</p>}
            </div>}
          </div>
          <span className="store-notification" role="img" aria-label="Thông báo cửa hàng, có cập nhật mới">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4" /></svg><i />
          </span>
          <label className="store-month-picker" htmlFor="mon"><span>Tháng</span><input id="mon" lang="vi" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label>
          {canManage && <button className="store-clear-button" onClick={clear} title="Xóa toàn bộ dữ liệu để bắt đầu từ đầu">Xóa sạch</button>}
          <span id="st" className={`store-save-status${st.startsWith('Lưu lỗi') ? ' has-error' : ''}`} role="status">{st}</span>
          <span className="store-user-badge"><i>{String(user || 'U').slice(0, 1).toUpperCase()}</i><span>Minh Nhật Store<small>{user} · {ROLE_NAMES[role] || role}</small></span></span>
        </div>
      </header>
      <main className="store-content"><View data={data} month={month} update={update} role={role} username={user} /></main>
    </div>
    {passwordOpen && <PasswordChange onClose={() => setPasswordOpen(false)} />}
  </div>;
}

function PasswordChange({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu mới nhập lại không khớp.');
      return;
    }
    setBusy(true);
    try {
      await api('/api/change-password', 'POST', { currentPassword, newPassword });
      onClose();
      alert('Đã đổi mật khẩu thành công.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return <div role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget && !busy) onClose();
  }} style={{
    position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center',
    padding: 16, background: 'rgba(0,0,0,.55)'
  }}>
    <section className="card" role="dialog" aria-modal="true" aria-labelledby="password-title" style={{ width: '100%', maxWidth: 400 }}>
      <h2 id="password-title">Đổi mật khẩu</h2>
      <form onSubmit={submit}>
        <label htmlFor="current-password">Mật khẩu hiện tại</label>
        <input id="current-password" type="password" autoComplete="current-password" required
          value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
        <label htmlFor="new-password">Mật khẩu mới (8-100 ký tự)</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={100} required
          value={newPassword} onChange={event => setNewPassword(event.target.value)} />
        <label htmlFor="confirm-password">Nhập lại mật khẩu mới</label>
        <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={100} required
          value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
        <p role="alert" style={{ color: 'var(--neg)', minHeight: 20 }}>{error}</p>
        <div className="top">
          <button type="button" disabled={busy} onClick={onClose}>Hủy</button>
          <button className="p" disabled={busy}>{busy ? 'Đang đổi…' : 'Cập nhật mật khẩu'}</button>
        </div>
      </form>
    </section>
  </div>;
}
