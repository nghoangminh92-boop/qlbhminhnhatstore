import { useEffect, useState } from 'react';
import { fmt, sh, today, uid, ymOf, stats } from '../lib';
import { dm, ml, Empty } from './shared';
import DataImport from './DataImport';

export default function Revenue({ data, month, update }) {
  const [repairForm, setRepairForm] = useState({ date: month === ymOf(new Date()) ? today() : `${month}-01`, amount: '', materialCost: '', note: '' });
  const [editingRepairId, setEditingRepairId] = useState(null);
  const current = stats(data, month);
  const [year, monthNumber] = month.split('-').map(Number);
  const monthly = [];
  useEffect(() => {
    setRepairForm(value => value.date.slice(0, 7) === month
      ? value
      : { ...value, date: month === ymOf(new Date()) ? today() : `${month}-01` });
  }, [month]);

  for (let i = 11; i >= 0; i--) {
    const key = ymOf(new Date(year, monthNumber - 1 - i, 1));
    monthly.push({ key, ...stats(data, key) });
  }

  const daily = new Map();
  current.sl.forEach(sale => {
    const row = daily.get(sale.date) || { date: sale.date, sales: 0, returned: 0, returnedUnits: 0, entered: 0, repairs: 0 };
    row.sales += sale.price * sale.qty;
    daily.set(sale.date, row);
  });
  current.manual.forEach(entry => {
    const row = daily.get(entry.date) || { date: entry.date, sales: 0, returned: 0, returnedUnits: 0, entered: 0, repairs: 0 };
    row.entered += entry.amt;
    daily.set(entry.date, row);
  });
  current.repairs.forEach(entry => {
    const row = daily.get(entry.date) || { date: entry.date, sales: 0, returned: 0, returnedUnits: 0, entered: 0, repairs: 0 };
    row.repairs += entry.amt;
    daily.set(entry.date, row);
  });
  current.saleReturns.forEach(entry => {
    const row = daily.get(entry.date) || { date: entry.date, sales: 0, returned: 0, returnedUnits: 0, entered: 0, repairs: 0 };
    row.returned += entry.refundAmt;
    row.returnedUnits += entry.qty;
    daily.set(entry.date, row);
  });
  const days = [...daily.values()].sort((a, b) => b.date.localeCompare(a.date));

  const addRepair = async () => {
    const amount = Number(repairForm.amount), materialCost = Number(repairForm.materialCost || 0);
    if (!repairForm.date || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isFinite(materialCost) || materialCost < 0) {
      return alert('Chọn ngày, nhập doanh thu lớn hơn 0 và chi phí vật liệu không âm.');
    }
    const saved = await update(state => {
      const repairRevenues = state.repairRevenues || [];
      const updated = {
        id: editingRepairId || uid(),
        date: repairForm.date,
        amt: amount,
        materialCost,
        note: repairForm.note.trim()
      };
      return {
        ...state,
        repairRevenues: editingRepairId
          ? repairRevenues.map(entry => entry.id === editingRepairId ? updated : entry)
          : [...repairRevenues, updated]
      };
    });
    if (!saved) return;
    setEditingRepairId(null);
    setRepairForm({ date: repairForm.date, amount: '', materialCost: '', note: '' });
  };
  const editRepair = entry => {
    setEditingRepairId(entry.id);
    setRepairForm({
      date: entry.date,
      amount: String(entry.amt),
      materialCost: String(entry.materialCost || 0),
      note: entry.note || ''
    });
  };
  const cancelRepairEdit = () => {
    setEditingRepairId(null);
    setRepairForm({
      date: month === ymOf(new Date()) ? today() : `${month}-01`,
      amount: '',
      materialCost: '',
      note: ''
    });
  };
  const removeRepair = id => {
    if (editingRepairId === id) cancelRepairEdit();
    return update(state => ({
      ...state,
      repairRevenues: (state.repairRevenues || []).filter(entry => entry.id !== id)
    }));
  };

  return <>
    <div className="kpis">
      <div className="kpi"><small>Doanh thu từ đơn bán</small><b>{sh(current.salesRev)}</b></div>
      <div className="kpi"><small>Doanh thu nhập trực tiếp</small><b>{sh(current.manualRev)}</b></div>
      <div className="kpi"><small>Doanh thu sửa chữa</small><b>{sh(current.repairRev)}</b></div>
      <div className="kpi main"><small>Tổng doanh thu tháng {ml(month)}</small><b>{sh(current.rev)}</b></div>
    </div>
    <div className="card">
      <h2>Ghi doanh thu sửa chữa</h2>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '0 0 10px' }}>
        Ghi doanh thu và chi phí vật liệu; chi phí vật liệu sẽ được tính vào mục Chi tiêu.
      </p>
      <div className="form">
        <div><label>Ngày ghi nhận</label><input lang="vi" type="date" value={repairForm.date} onChange={e => setRepairForm({ ...repairForm, date: e.target.value })} /></div>
        <div><label>Doanh thu (₫)</label><input type="number" min="1" value={repairForm.amount} onChange={e => setRepairForm({ ...repairForm, amount: e.target.value })} /></div>
        <div><label>Chi phí vật liệu (₫)</label><input type="number" min="0" value={repairForm.materialCost} onChange={e => setRepairForm({ ...repairForm, materialCost: e.target.value })} /></div>
        <div><label>Ghi chú</label><input value={repairForm.note} onChange={e => setRepairForm({ ...repairForm, note: e.target.value })} /></div>
        <button className="p" onClick={addRepair}>{editingRepairId ? 'Cập nhật doanh thu sửa chữa' : 'Lưu doanh thu sửa chữa'}</button>
        {editingRepairId && <button onClick={cancelRepairEdit}>Hủy sửa</button>}
      </div>
    </div>
    <DataImport data={data} update={update} initialType="revenue" />
    <div className="card">
      <h2>Doanh thu theo ngày — tháng {ml(month)}</h2>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '0 0 10px' }}>Doanh thu ngày gồm đơn bán, trừ tiền hoàn đổi trả, cộng khoản nhập trực tiếp và sửa chữa.</p>
      <div className="scroll">{days.length ? <table><thead><tr><th>Ngày</th><th className="n">Đơn bán</th><th className="n">Hoàn đổi trả</th><th className="n">Máy trả</th><th className="n">Nhập trực tiếp</th><th className="n">Sửa chữa</th><th className="n">Tổng doanh thu</th></tr></thead>
        <tbody>{days.map(day => <tr key={day.date}>
          <td>{dm(day.date)}</td><td className="n">{fmt(day.sales)}</td><td className="n">{fmt(day.returned || 0)}</td><td className="n">{day.returnedUnits}</td><td className="n">{fmt(day.entered)}</td><td className="n">{fmt(day.repairs || 0)}</td><td className="n"><b>{fmt(day.sales - (day.returned || 0) + day.entered + (day.repairs || 0))}</b></td>
        </tr>)}</tbody></table> : <Empty>Chưa có doanh thu trong tháng này.</Empty>}</div>
    </div>
    <div className="card">
      <h2>Doanh thu theo tháng — 12 tháng gần nhất</h2>
      <div className="scroll"><table><thead><tr><th>Tháng</th><th className="n">Đơn bán</th><th className="n">Hoàn đổi trả</th><th className="n">Máy trả</th><th className="n">Nhập trực tiếp</th><th className="n">Sửa chữa</th><th className="n">Tổng doanh thu</th><th className="n">Số máy bán</th></tr></thead>
        <tbody>{monthly.map(row => <tr key={row.key}>
          <td>{ml(row.key)}</td><td className="n">{fmt(row.salesRev)}</td><td className="n">{fmt(row.returnRefund)}</td><td className="n">{row.returnedUnits}</td><td className="n">{fmt(row.manualRev)}</td><td className="n">{fmt(row.repairRev)}</td><td className="n"><b>{fmt(row.rev)}</b></td><td className="n">{row.units}</td>
        </tr>)}</tbody></table></div>
    </div>
    <div className="card">
      <h2>Doanh thu sửa chữa tháng {ml(month)}</h2>
      <div className="scroll">{current.repairs.length ? <table><thead><tr><th>Ngày</th><th>Ghi chú</th><th className="n">Doanh thu</th><th className="n">Vật liệu</th><th className="n">Lãi sau vật liệu</th><th /></tr></thead>
        <tbody>{[...current.repairs].sort((a, b) => b.date.localeCompare(a.date)).map(entry => <tr key={entry.id}>
          <td>{dm(entry.date)}</td><td>{entry.note || '—'}</td><td className="n">{fmt(entry.amt)}</td>
          <td className="n">{fmt(entry.materialCost || 0)}</td>
          <td className="n">{fmt(entry.amt - (entry.materialCost || 0))}</td>
          <td><button onClick={() => editRepair(entry)}>Sửa</button>{' '}
            <button className="x" onClick={() => removeRepair(entry.id)}>Xóa</button></td>
        </tr>)}</tbody></table> : <Empty>Chưa có doanh thu sửa chữa trong tháng này.</Empty>}</div>
    </div>
  </>;
}
