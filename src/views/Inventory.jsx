import { useEffect, useState } from 'react';
import { fmt, sh, today, uid, pname } from '../lib';
import { Empty, ml } from './shared';

const blankForm = month => ({
  brand: '', model: '', storage: '', color: '', cost: '', stock: '',
  stockDate: month === today().slice(0, 7) ? today() : `${month}-01`
});

export default function Inventory({ data, month, update, role }) {
  const [f, setF] = useState(() => blankForm(month)), [editId, setEditId] = useState(null), [q, setQ] = useState('');
  useEffect(() => {
    if (!editId) setF(current => ({ ...current, stockDate: blankForm(month).stockDate }));
  }, [month, editId]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const ql = q.toLowerCase();
  const inventoryPhones = data.phones;
  const monthPhones = inventoryPhones.filter(phone => phone.stockDate?.slice(0, 7) === month);
  const legacyCount = inventoryPhones.filter(phone => !phone.stockDate).length;
  const list = monthPhones.filter(p => pname(p).toLowerCase().includes(ql) || p.color.toLowerCase().includes(ql));
  const val = monthPhones.reduce((a, p) => a + p.cost * Number(p.stock || 0), 0);
  const canEditInventory = role !== 'staff';
  const submit = async () => {
    const stock = f.stock === '' ? 0 : Number(f.stock);
    const existing = data.phones.find(phone => phone.id === editId);
    const o = { brand: f.brand.trim(), model: f.model.trim(), storage: f.storage.trim(), color: f.color.trim(), cost: Number(f.cost), price: existing?.price ?? null, stock, stockDate: f.stockDate };
    if (!o.brand || !o.model || !Number.isFinite(o.cost) || o.cost < 0 || f.cost === '') return alert('Nhập ít nhất hãng, dòng máy và giá nhập.');
    if (!Number.isInteger(stock) || stock < 0) return alert('Tồn kho phải là số nguyên không âm.');
    const dateParts = o.stockDate.split('-').map(Number);
    const selectedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.stockDate) ||
        selectedDate.getFullYear() !== dateParts[0] ||
        selectedDate.getMonth() !== dateParts[1] - 1 ||
        selectedDate.getDate() !== dateParts[2]) return alert('Chọn ngày nhập kho hợp lệ.');
    const saved = await update(S => ({
      ...S,
      phones: editId
        ? S.phones.map(p => p.id === editId ? { ...p, ...o } : p)
        : [...S.phones, { id: uid(), ...o }]
    }));
    if (!saved) return;
    setEditId(null); setF(blankForm(month));
  };
  const edit = p => { setEditId(p.id); setF({ ...p, stockDate: p.stockDate || '' }); window.scrollTo(0, 0); };
  const cancel = () => { setEditId(null); setF(blankForm(month)); };
  const del = id => update(S => ({ ...S, phones: S.phones.filter(p => p.id !== id) }));
  return <>
    <div className="card"><h2>{editId ? 'Sửa điện thoại' : `Nhập kho tháng ${ml(month)}`}</h2>
      <div className="form">
        <div><label>Hãng</label><input value={f.brand} onChange={set('brand')} /></div>
        <div><label>Dòng máy</label><input value={f.model} onChange={set('model')} /></div>
        <div><label>Dung lượng</label><input placeholder="128GB" value={f.storage} onChange={set('storage')} /></div>
        <div><label>Màu</label><input value={f.color} onChange={set('color')} /></div>
        <div><label>Giá nhập (₫)</label><input type="number" min="0" value={f.cost} onChange={set('cost')} /></div>
        <div><label>Tồn kho</label><input type="number" min="0" step="1" value={f.stock} onChange={set('stock')} /></div>
        <div><label>Ngày nhập kho</label><input lang="vi" type="date" value={f.stockDate} onChange={set('stockDate')} /></div>
        <div className="sp"><button className="p" onClick={submit}>{editId ? 'Cập nhật' : 'Thêm máy'}</button>{editId && <button onClick={cancel}>Hủy</button>}</div>
      </div>
    </div>
    <div className="card">
      <div className="sp" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Hàng nhập tháng {ml(month)} ({monthPhones.length} mẫu, vốn tồn {sh(val)})</h2>
        <input placeholder="Tìm theo tên, màu…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 220 }} />
      </div>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '0 0 10px' }}>
        Danh sách lọc theo ngày nhập kho của tháng đang chọn. Số tồn hiển thị là tồn kho hiện tại của từng mẫu.
      </p>
      {!canEditInventory && <p className="inventory-permission-note" role="note">
        Tài khoản Nhân viên chỉ được thêm mặt hàng mới; quyền sửa hoặc xóa mặt hàng có sẵn dành cho Quản lý/Admin.
      </p>}
      {legacyCount > 0 && <p style={{ color: 'var(--mute)', fontSize: 13 }}>
        Có {legacyCount} mặt hàng cũ chưa có ngày nhập kho nên chưa thể xếp vào tháng. Hãy sửa mặt hàng để bổ sung ngày.
      </p>}
      <div className="scroll">{list.length ? <table><thead><tr><th>Điện thoại</th><th>Màu</th><th>Ngày nhập</th><th className="n">Giá nhập</th><th className="n">Tồn hiện tại</th><th /></tr></thead>
        <tbody>{list.map(p => <tr key={p.id}>
          <td>{pname(p)}</td><td>{p.color}</td><td>{p.stockDate || '—'}</td><td className="n">{fmt(p.cost)}</td>
          <td className="n"><span className={'tag' + (Number(p.stock || 0) <= 2 ? ' l' : '')}>{Number(p.stock || 0)}</span></td>
          <td>{canEditInventory && <><button className="x" style={{ color: 'var(--acc)' }} onClick={() => edit(p)}>Sửa</button><button className="x" onClick={() => del(p.id)}>Xóa</button></>}</td></tr>)}</tbody></table> : <Empty>Không tìm thấy máy nào trong tháng đã chọn.</Empty>}</div>
    </div>
  </>;
}
