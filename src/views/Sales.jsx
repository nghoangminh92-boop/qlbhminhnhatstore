import { useState } from 'react';
import { PAYS, fmt, today, uid, stats, pname } from '../lib';
import { ml, Empty } from './shared';

export default function Sales({ data, month, update }) {
  const s = stats(data, month);
  const av = data.phones.filter(p => p.stock > 0);
  const [f, setF] = useState({ pid: '', q: 1, pr: '', cust: '', pay: PAYS[0], d: today() });
  const cur = av.find(p => p.id === f.pid) || av[0];
  const price = f.pr === '' ? (cur ? cur.price : '') : f.pr;
  const set = k => e => setF({ ...f, [k]: e.target.value, ...(k === 'pid' ? { pr: '' } : {}) });
  const add = () => {
    const q = +f.q, pr = +price;
    if (!cur || !Number.isInteger(q) || q < 1 || !Number.isFinite(pr) || pr < 0) return alert('Kiểm tra lại số lượng và giá bán.');
    if (q > cur.stock) return alert(`Kho chỉ còn ${cur.stock} máy ${pname(cur)}.`);
    update(S => ({
      ...S,
      phones: S.phones.map(p => p.id === cur.id ? { ...p, stock: p.stock - q } : p),
      sales: [...S.sales, { id: uid(), date: f.d || today(), phoneId: cur.id, name: pname(cur), qty: q, price: pr, cost: cur.cost, cust: f.cust.trim() || 'Khách lẻ', pay: f.pay }]
    }));
    setF({ ...f, q: 1, pr: '', cust: '' });
  };
  const del = x => update(S => ({
    ...S,
    phones: S.phones.map(p => p.id === x.phoneId ? { ...p, stock: p.stock + x.qty } : p),
    sales: S.sales.filter(a => a.id !== x.id)
  }));
  const changeDate = (id, date) => {
    if (!date) return;
    update(S => ({ ...S, sales: S.sales.map(sale => sale.id === id ? { ...sale, date } : sale) }));
  };
  return <>
    <div className="card"><h2>Ghi đơn bán</h2>
      {av.length ? <div className="form">
        <div style={{ gridColumn: 'span 2' }}><label>Điện thoại</label>
          <select value={cur.id} onChange={set('pid')}>{av.map(p => <option key={p.id} value={p.id}>{pname(p)} (còn {p.stock})</option>)}</select></div>
        <div><label>Số lượng</label><input type="number" min="1" step="1" value={f.q} onChange={set('q')} /></div>
        <div><label>Giá bán (₫)</label><input type="number" min="0" value={price} onChange={set('pr')} /></div>
        <div><label>Khách hàng</label><input placeholder="Khách lẻ" value={f.cust} onChange={set('cust')} /></div>
        <div><label>Thanh toán</label><select value={f.pay} onChange={set('pay')}>{PAYS.map(p => <option key={p}>{p}</option>)}</select></div>
        <div><label>Ngày</label><input lang="vi" type="date" value={f.d} onChange={set('d')} /></div>
        <button className="p" onClick={add}>Lưu đơn bán</button>
      </div> : <Empty>Kho đã hết hàng. Thêm máy ở tab Kho điện thoại.</Empty>}
    </div>
    <div className="card"><h2>Đơn bán tháng {ml(month)} ({s.sl.length} đơn)</h2>
      <div className="scroll">{s.sl.length ? <table><thead><tr><th>Ngày</th><th>Điện thoại</th><th className="n">SL</th><th className="n">Giá bán</th><th className="n">Lãi</th><th>Khách</th><th>Thanh toán</th><th /></tr></thead>
        <tbody>{[...s.sl].sort((a, b) => b.date.localeCompare(a.date)).map(x => <tr key={x.id}>
          <td><input lang="vi" aria-label={`Ngày bán ${x.name}`} type="date" value={x.date} onChange={e => changeDate(x.id, e.target.value)} style={{ minWidth: 145, padding: '4px 6px' }} /></td>
          <td>{x.name}</td><td className="n">{x.qty}</td><td className="n">{fmt(x.price * x.qty)}</td>
          <td className={'n ' + (x.price >= x.cost ? 'pos' : 'neg')}>{fmt((x.price - x.cost) * x.qty)}</td><td>{x.cust}</td><td>{x.pay}</td>
          <td><button className="x" onClick={() => del(x)}>Xóa</button></td></tr>)}</tbody></table> : <Empty>Chưa có đơn bán nào trong tháng này.</Empty>}</div>
    </div>
  </>;
}
