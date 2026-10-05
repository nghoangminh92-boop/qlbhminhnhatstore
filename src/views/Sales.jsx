import { useState } from 'react';
import { PAYS, fmt, today, uid, stats, pname } from '../lib';
import { ml, Empty } from './shared';

export default function Sales({ data, month, update }) {
  const s = stats(data, month);
  const av = data.phones.filter(p => p.stock > 0);
  const [f, setF] = useState({ pid: '', q: 1, pr: '', cust: '', pay: PAYS[0], d: today() });
  const [returnForm, setReturnForm] = useState({ saleId: '', date: today(), qty: 1, refundAmt: '' });
  const returns = data.saleReturns || [];
  const returnedBySale = new Map();
  const refundBySale = new Map();
  for (const item of returns) {
    returnedBySale.set(item.saleId, (returnedBySale.get(item.saleId) || 0) + item.qty);
    refundBySale.set(item.saleId, (refundBySale.get(item.saleId) || 0) + item.refundAmt);
  }
  const monthNetSales = s.salesRev - s.returnRefund;
  const monthlySales = [...s.sl].sort((a, b) => b.date.localeCompare(a.date)).map(sale => {
    const returnedQty = sale.returnedQty ?? returnedBySale.get(sale.id) ?? 0;
    const refundAmt = sale.returnRefund ?? refundBySale.get(sale.id) ?? 0;
    const netAmount = sale.price * sale.qty - refundAmt;
    return {
      sale,
      returnedQty,
      netAmount,
      netProfit: netAmount - sale.cost * (sale.qty - returnedQty)
    };
  });
  const returnableSales = data.sales.filter(sale => sale.qty > (returnedBySale.get(sale.id) || 0));
  const selectedReturnSale = returnableSales.find(sale => sale.id === returnForm.saleId) || returnableSales[0];
  const cur = av.find(p => p.id === f.pid) || av[0];
  const price = f.pr === '' ? (cur ? cur.price : '') : f.pr;
  const set = k => e => setF({ ...f, [k]: e.target.value, ...(k === 'pid' ? { pr: '' } : {}) });
  const add = () => {
    const q = +f.q, pr = +price;
    if (!cur || !Number.isInteger(q) || q < 1 || !Number.isFinite(pr) || pr < 0) return alert('Kiểm tra lại số lượng và giá bán.');
    if (q > cur.stock) return alert(`Kho chỉ còn ${cur.stock} máy ${pname(cur)}.`);
    update(S => ({
      ...S,
      phones: S.phones.map(p => p.id === cur.id ? { ...p, stock: Number(p.stock || 0) - q } : p),
      sales: [...S.sales, { id: uid(), date: f.d || today(), phoneId: cur.id, name: pname(cur), qty: q, price: pr, cost: cur.cost, cust: f.cust.trim() || 'Khách lẻ', pay: f.pay }]
    }));
    setF({ ...f, q: 1, pr: '', cust: '' });
  };
  const del = x => {
    if ((x.returnedQty || returnedBySale.get(x.id) || 0) > 0) return alert('Không thể xóa đơn đã có đổi trả. Hãy giữ nguyên lịch sử đơn hàng.');
    if (!data.phones.some(phone => phone.id === x.phoneId)) return alert('Không tìm thấy mặt hàng gốc trong kho nên chưa thể xóa đơn và cộng lại tồn kho. Hãy thêm lại mặt hàng trước.');
    if (!confirm(`Xóa đơn ${x.name} của ${x.cust || 'Khách lẻ'}? Số lượng sẽ được cộng lại kho và lịch sử đơn sẽ bị xóa. Nếu khách trả hàng, hãy dùng chức năng Đổi trả.`)) return;
    update(S => ({
      ...S,
      phones: S.phones.map(p => p.id === x.phoneId ? { ...p, stock: Number(p.stock || 0) + Number(x.qty) } : p),
      sales: S.sales.filter(a => a.id !== x.id)
    }));
  };
  const changeDate = (id, date) => {
    if (!date) return;
    update(S => ({ ...S, sales: S.sales.map(sale => sale.id === id ? { ...sale, date } : sale) }));
  };
  const addReturn = () => {
    const qty = Number(returnForm.qty);
    const refundAmt = Number(returnForm.refundAmt === '' && selectedReturnSale ? selectedReturnSale.price * qty : returnForm.refundAmt);
    if (!selectedReturnSale || !returnForm.date || returnForm.date < selectedReturnSale.date || !Number.isInteger(qty) || qty < 1 ||
        qty > selectedReturnSale.qty - (returnedBySale.get(selectedReturnSale.id) || 0) ||
        !Number.isFinite(refundAmt) || refundAmt < 0 || refundAmt > selectedReturnSale.price * qty) {
      return alert('Kiểm tra lại đơn bán, số lượng trả và số tiền hoàn.');
    }
    if (!data.phones.some(phone => phone.id === selectedReturnSale.phoneId)) {
      return alert('Không tìm thấy điện thoại trong kho để cộng lại hàng trả.');
    }
    update(state => {
      const sale = state.sales.find(item => item.id === selectedReturnSale.id);
      const saleReturns = state.saleReturns || [];
      const alreadyReturned = saleReturns.filter(item => item.saleId === selectedReturnSale.id).reduce((total, item) => total + item.qty, 0);
      const alreadyRefunded = saleReturns.filter(item => item.saleId === selectedReturnSale.id).reduce((total, item) => total + item.refundAmt, 0);
      if (!sale || qty > sale.qty - alreadyReturned) {
        alert('Số lượng còn được đổi trả đã thay đổi. Hãy kiểm tra lại đơn bán.');
        return state;
      }
      return {
        ...state,
        phones: state.phones.map(phone => phone.id === sale.phoneId ? { ...phone, stock: Number(phone.stock || 0) + qty } : phone),
        sales: state.sales.map(item => item.id === sale.id ? {
          ...item,
          returnedQty: alreadyReturned + qty,
          returnRefund: alreadyRefunded + refundAmt
        } : item),
        saleReturns: [...saleReturns, {
          id: uid(), saleId: sale.id, date: returnForm.date, qty, refundAmt
        }]
      };
    });
    setReturnForm({ saleId: '', date: today(), qty: 1, refundAmt: '' });
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
    <div className="card"><h2>Ghi nhận đổi trả</h2>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '0 0 10px' }}>
        Đơn bán được giữ nguyên lịch sử. Khi lưu đổi trả, số lượng hàng tự cộng lại kho và tiền hoàn được trừ vào doanh thu ngày trả. Nếu đổi sang máy khác, ghi nhận trả máy cũ rồi tạo đơn bán cho máy mới.
      </p>
      {returnableSales.length ? <div className="form">
        <div style={{ gridColumn: 'span 2' }}><label>Đơn bán gốc</label>
          <select value={selectedReturnSale?.id || ''} onChange={e => {
            const sale = returnableSales.find(item => item.id === e.target.value);
            setReturnForm({ ...returnForm, saleId: e.target.value, qty: 1, refundAmt: sale ? String(sale.price) : '' });
          }}>{returnableSales.map(sale => <option key={sale.id} value={sale.id}>
            {sale.date} · {sale.name} · {sale.cust || 'Khách lẻ'} · còn trả {sale.qty - (returnedBySale.get(sale.id) || 0)}
          </option>)}</select></div>
        <div><label>Ngày đổi trả</label><input lang="vi" type="date" value={returnForm.date} onChange={e => setReturnForm({ ...returnForm, date: e.target.value })} /></div>
        <div><label>Số lượng trả (còn {selectedReturnSale ? selectedReturnSale.qty - (returnedBySale.get(selectedReturnSale.id) || 0) : 0})</label>
          <input type="number" min="1" max={selectedReturnSale ? selectedReturnSale.qty - (returnedBySale.get(selectedReturnSale.id) || 0) : 1} step="1" value={returnForm.qty}
            onChange={e => setReturnForm({ ...returnForm, qty: e.target.value, refundAmt: String((selectedReturnSale?.price || 0) * Number(e.target.value || 0)) })} /></div>
        <div><label>Tiền hoàn (₫)</label><input type="number" min="0" value={returnForm.refundAmt === '' && selectedReturnSale ? selectedReturnSale.price * Number(returnForm.qty || 0) : returnForm.refundAmt}
          onChange={e => setReturnForm({ ...returnForm, refundAmt: e.target.value })} /></div>
        <button className="p" onClick={addReturn}>Lưu đổi trả &amp; cộng lại kho</button>
      </div> : <Empty>Không còn đơn bán nào có số lượng được đổi trả.</Empty>}
    </div>
    <div className="card"><h2>Đơn bán tháng {ml(month)} ({s.sl.length} đơn)</h2>
      <div className="sp" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span>Doanh thu bán trong tháng: <b>{fmt(s.salesRev)}</b></span>
        <span>Hoàn trả trong tháng: <b>{fmt(s.returnRefund)} ({s.returnedUnits} máy)</b></span>
        <span>Doanh thu bán ròng tháng: <b>{fmt(monthNetSales)}</b></span>
      </div>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '0 0 10px' }}>Muốn sửa giá đơn chưa đổi trả: xóa đơn để kho cộng lại máy, sau đó ghi đơn bán mới với giá đúng. Đơn đã đổi trả cần giữ nguyên lịch sử.</p>
      <div className="scroll">{s.sl.length ? <table><thead><tr><th>Ngày</th><th>Điện thoại</th><th className="n">SL bán</th><th className="n">Đã trả lũy kế</th><th className="n">SL còn bán</th><th className="n">Thành tiền còn lại</th><th className="n">Lãi sau hoàn</th><th>Khách</th><th>Thanh toán</th><th /></tr></thead>
        <tbody>{monthlySales.map(({ sale: x, returnedQty, netAmount, netProfit }) => <tr key={x.id}>
          <td><input lang="vi" aria-label={`Ngày bán ${x.name}`} type="date" value={x.date} onChange={e => changeDate(x.id, e.target.value)} disabled={(x.returnedQty || returnedBySale.get(x.id) || 0) > 0} style={{ minWidth: 145, padding: '4px 6px' }} /></td>
          <td>{x.name}</td><td className="n">{x.qty}</td><td className="n">{returnedQty}</td>
          <td className="n">{x.qty - returnedQty}</td><td className="n">{fmt(netAmount)}</td>
          <td className={'n ' + (netProfit >= 0 ? 'pos' : 'neg')}>{fmt(netProfit)}</td><td>{x.cust}</td><td>{x.pay}</td>
          <td><button className="x" onClick={() => del(x)} disabled={(x.returnedQty || returnedBySale.get(x.id) || 0) > 0}>Xóa</button></td></tr>)}</tbody></table> : <Empty>Chưa có đơn bán nào trong tháng này.</Empty>}</div>
    </div>
    <div className="card"><h2>Đổi trả tháng {ml(month)}</h2>
      <div className="scroll">{s.saleReturns.length ? <table><thead><tr><th>Ngày trả</th><th>Đơn bán gốc</th><th>Khách</th><th className="n">SL trả</th><th className="n">Tiền hoàn</th></tr></thead>
        <tbody>{[...s.saleReturns].sort((a, b) => b.date.localeCompare(a.date)).map(item => {
          const sale = data.sales.find(entry => entry.id === item.saleId);
          return <tr key={item.id}><td>{item.date}</td><td>{sale?.name || 'Đơn bán không tồn tại'}</td><td>{sale?.cust || '—'}</td><td className="n">{item.qty}</td><td className="n">{fmt(item.refundAmt)}</td></tr>;
        })}</tbody></table> : <Empty>Chưa có đổi trả nào trong tháng này.</Empty>}</div>
    </div>
  </>;
}
