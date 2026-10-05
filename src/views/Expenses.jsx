import { useState } from 'react';
import { CATS, fmt, today, uid, stats } from '../lib';
import { dm, ml, Empty } from './shared';
import DataImport from './DataImport';

export default function Expenses({ data, month, update }) {
  const s = stats(data, month);
  const categories = [...new Set([...CATS, ...data.exps.map(expense => expense.cat).filter(Boolean)])];
  const [f, setF] = useState({ c: CATS[0], a: '', n: '', d: today() });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const add = () => {
    const a = Number(f.a); if (!Number.isFinite(a) || !(a > 0)) return alert('Nhập số tiền lớn hơn 0.');
    update(S => ({ ...S, exps: [...S.exps, { id: uid(), date: f.d || today(), cat: f.c, amt: a, note: f.n.trim() }] }));
    setF({ ...f, a: '', n: '' });
  };
  const del = id => update(S => ({ ...S, exps: S.exps.filter(a => a.id !== id) }));
  return <>
    <div className="card"><h2>Ghi khoản chi</h2>
      <div className="form">
        <div><label>Khoản chi</label><select value={f.c} onChange={set('c')}>{categories.map(c => <option key={c}>{c}</option>)}</select></div>
        <div><label>Số tiền (₫)</label><input type="number" min="0" value={f.a} onChange={set('a')} /></div>
        <div><label>Ghi chú</label><input value={f.n} onChange={set('n')} /></div>
        <div><label>Ngày</label><input lang="vi" type="date" value={f.d} onChange={set('d')} /></div>
        <button className="p" onClick={add}>Lưu khoản chi</button>
      </div>
    </div>
    <DataImport data={data} update={update} initialType="expense" />
    <div className="card"><h2>Chi tiêu tháng {ml(month)}: {fmt(s.exp)}</h2>
      <div className="scroll">{s.ex.length ? <table><thead><tr><th>Ngày</th><th>Khoản chi</th><th>Ghi chú</th><th className="n">Số tiền</th><th /></tr></thead>
        <tbody>{[...s.ex].sort((a, b) => b.date.localeCompare(a.date)).map(x => {
          const linkedRevenue = x.id.startsWith('dr-');
          return <tr key={x.id}>
            <td>{dm(x.date)}</td><td>{x.cat}</td><td>{x.note}
              {(x.sourceRepairId || linkedRevenue) && <small style={{ display: 'block', color: 'var(--mute)' }}>
                {x.sourceRepairId ? 'Tự động từ doanh thu sửa chữa' : 'Gắn với doanh thu nhập trực tiếp'}
              </small>}
            </td>
            <td className="n">{fmt(x.amt)}</td>
            <td>{x.sourceRepairId || linkedRevenue
              ? <span style={{ color: 'var(--mute)' }}>Liên kết</span>
              : <button className="x" onClick={() => del(x.id)}>Xóa</button>}
            </td>
          </tr>;
        })}</tbody></table> : <Empty>Chưa có khoản chi nào trong tháng này.</Empty>}</div>
    </div>
  </>;
}
