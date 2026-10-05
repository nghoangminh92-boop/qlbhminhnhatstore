import { CATS, fmt, sh, ymOf, stats, pname } from '../lib';
import { Empty } from './shared';

export default function Dashboard({ data, month }) {
  const s = stats(data, month);
  const [y, mo] = month.split('-').map(Number);
  const six = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(y, mo - 1 - i, 1); six.push({ l: 'T' + (d.getMonth() + 1), ...stats(data, ymOf(d)) }); }
  const mx = Math.max(1, ...six.map(a => Math.max(a.rev, a.cogs + a.exp)));
  const categories = [...new Set([...CATS, ...s.ex.map(expense => expense.cat).filter(Boolean)])];
  const byCat = categories.map(c => [c, s.ex.filter(e => e.cat === c).reduce((a, e) => a + e.amt, 0)]).filter(c => c[1] > 0).sort((a, b) => b[1] - a[1]);
  const top = {}; s.sl.forEach(x => { top[x.name] = (top[x.name] || 0) + x.qty; });
  const tops = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const low = data.phones.filter(p => p.stock <= 2).sort((a, b) => a.stock - b.stock);
  const margin = s.rev ? Math.round(s.net / s.rev * 100) : 0;
  return <>
    <div className="kpis">
      <div className="kpi main"><small>{s.manualRev ? 'Lợi nhuận tạm tính' : 'Lợi nhuận ròng'}</small><b>{sh(s.net)}</b><small>{s.manualRev ? 'Biên chưa xác định' : `Biên ${margin}%`}</small></div>
      <div className="kpi"><small>Tổng doanh thu</small><b>{sh(s.rev)}</b></div>
      <div className="kpi"><small>Giá vốn hàng bán</small><b>{sh(s.cogs)}</b></div>
      <div className="kpi"><small>Chi phí vận hành</small><b>{sh(s.exp)}</b></div>
      <div className="kpi"><small>Máy đã bán</small><b>{s.units}</b></div>
    </div>
    {s.manualRev > 0 && <div className="card" style={{ color: 'var(--mute)' }}>
      Doanh thu tháng này gồm {sh(s.manualRev)} nhập trực tiếp, chưa có giá vốn; lợi nhuận đang hiển thị là tạm tính.
    </div>}
    <div className="card"><h2>6 tháng gần nhất</h2>
      <div className="chart">{six.map(a => <div className="col" key={a.l + a.rev}>
        <div className="bars">
          <i className="rev" style={{ height: a.rev / mx * 100 + '%' }} title={'Doanh thu ' + fmt(a.rev)} />
          <i className="cost" style={{ height: (a.cogs + a.exp) / mx * 100 + '%' }} title={'Tổng chi ' + fmt(a.cogs + a.exp)} />
        </div><span>{a.l}</span></div>)}</div>
      <div className="legend"><span><i className="rev" />Doanh thu</span><span><i className="cost" />Giá vốn + chi phí</span></div>
    </div>
    <div className="grid2">
      <div className="card"><h2>Chi phí theo khoản</h2>
        {byCat.length ? byCat.map(c => <div className="row" key={c[0]}><span style={{ width: 130 }}>{c[0]}</span><div className="t"><i style={{ width: c[1] / byCat[0][1] * 100 + '%' }} /></div><b>{sh(c[1])}</b></div>) : <Empty>Chưa có chi tiêu trong tháng này.</Empty>}
      </div>
      <div className="card"><h2>Bán chạy trong tháng</h2>
        {tops.length ? tops.map(t => <div className="row" key={t[0]}><span style={{ flex: 1 }}>{t[0]}</span><b>{t[1]} máy</b></div>) : <Empty>Chưa có đơn bán trong tháng này.</Empty>}
      </div>
    </div>
    <div className="card"><h2>Cần nhập thêm hàng</h2>
      {low.length ? low.map(p => <div className="row" key={p.id}><span style={{ flex: 1 }}>{pname(p)}</span><span className="tag l">{p.stock ? 'Còn ' + p.stock : 'Hết hàng'}</span></div>) : <Empty>Tồn kho đang ổn.</Empty>}
    </div>
  </>;
}
