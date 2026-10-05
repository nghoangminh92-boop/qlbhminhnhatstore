import { useState } from 'react';
import { fmt, sh, ymOf, stats } from '../lib';
import { ml } from './shared';
import { createMonthlyExcel } from '../lib/exportExcel';

export default function Reports({ data, month }) {
  const [show, setShow] = useState(false);
  const s = stats(data, month), [y, mo] = month.split('-').map(Number), rows = [];
  for (let i = 11; i >= 0; i--) { const k = ymOf(new Date(y, mo - 1 - i, 1)); rows.push([k, stats(data, k)]); }
  const dailyMap = new Map();
  const getDaily = date => {
    if (!dailyMap.has(date)) dailyMap.set(date, { salesRev: 0, returnRefund: 0, returnedUnits: 0, manualRev: 0, repairRev: 0, cogs: 0, repairMaterialCost: 0, exp: 0, units: 0 });
    return dailyMap.get(date);
  };
  for (const sale of s.sl) {
    const day = getDaily(sale.date);
    day.salesRev += sale.price * sale.qty;
    day.cogs += sale.cost * sale.qty;
    day.units += sale.qty;
  }
  const allSales = new Map(data.sales.map(sale => [sale.id, sale]));
  for (const saleReturn of s.saleReturns) {
    const day = getDaily(saleReturn.date);
    day.returnRefund += saleReturn.refundAmt;
    day.returnedUnits += saleReturn.qty;
    const sale = allSales.get(saleReturn.saleId);
    if (sale) day.cogs -= sale.cost * saleReturn.qty;
  }
  for (const revenue of s.manual) {
    const day = getDaily(revenue.date);
    day.manualRev += revenue.amt;
  }
  for (const repair of s.repairs) {
    const day = getDaily(repair.date);
    day.repairRev += repair.amt;
    day.repairMaterialCost += repair.materialCost || 0;
  }
  for (const expense of s.ex) {
    const day = getDaily(expense.date);
    day.exp += expense.amt;
  }
  const daysInMonth = new Date(y, mo, 0).getDate();
  const dailyRows = Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    const day = dailyMap.get(date) || { salesRev: 0, returnRefund: 0, returnedUnits: 0, manualRev: 0, repairRev: 0, cogs: 0, repairMaterialCost: 0, exp: 0, units: 0 };
    const revenue = day.salesRev - day.returnRefund + day.manualRev + day.repairRev;
    const gross = revenue - day.cogs;
    return { date, ...day, revenue, gross, operatingExp: day.exp - day.repairMaterialCost, net: gross - day.exp };
  });
  const csv = 'Tháng,Doanh thu đơn bán,Hoàn đổi trả,Số máy trả,Doanh thu nhập trực tiếp,Doanh thu sửa chữa,Vật liệu sửa chữa,Tổng doanh thu,Giá vốn,Chi phí khác,Lợi nhuận tạm tính,Số máy bán\n' + rows.map(r => [r[0], r[1].salesRev, r[1].returnRefund, r[1].returnedUnits, r[1].manualRev, r[1].repairRev, r[1].repairMaterialCost, r[1].rev, r[1].cogs, r[1].operatingExp, r[1].net, r[1].units].join(',')).join('\n');
  const tot = rows.reduce((a, r) => a + r[1].net, 0);
  const cls = n => 'n ' + (n >= 0 ? 'pos' : 'neg');
  const exportMonth = () => {
    const sales = [...s.sl].sort((a, b) => a.date.localeCompare(b.date));
    const expenses = [...s.ex].sort((a, b) => a.date.localeCompare(b.date));
    const manualRevenue = [...s.manual].sort((a, b) => a.date.localeCompare(b.date));
    const repairRevenue = [...s.repairs].sort((a, b) => a.date.localeCompare(b.date));
    const saleReturns = [...s.saleReturns].sort((a, b) => a.date.localeCompare(b.date));
    const phoneById = new Map(data.phones.map(phone => [phone.id, phone]));
    const returnTotalsBySale = new Map();
    for (const item of (data.saleReturns || []).filter(item => item.date.slice(0, 7) <= month)) {
      const totals = returnTotalsBySale.get(item.saleId) || { qty: 0, refund: 0 };
      totals.qty += item.qty;
      totals.refund += item.refundAmt;
      returnTotalsBySale.set(item.saleId, totals);
    }
    const saleRows = sales.map(item => {
      const phone = phoneById.get(item.phoneId);
      const returned = returnTotalsBySale.get(item.id) || { qty: 0, refund: 0 };
      const netAmount = item.price * item.qty - returned.refund;
      const remainingCost = item.cost * (item.qty - returned.qty);
      return [
        item.date,
        item.id,
        phone?.brand || '',
        phone?.model || item.name || '',
        phone?.storage || '',
        phone?.color || '',
        item.qty,
        item.price,
        item.cost,
        item.price * item.qty,
        returned.qty,
        returned.refund,
        item.qty - returned.qty,
        netAmount,
        netAmount - remainingCost,
        item.cust || '',
        item.pay || ''
      ];
    });
    const saleTotals = saleRows.reduce((totals, row) => ({
      sold: totals.sold + row[6],
      originalAmount: totals.originalAmount + row[9],
      returned: totals.returned + row[10],
      refund: totals.refund + row[11],
      remaining: totals.remaining + row[12],
      netAmount: totals.netAmount + row[13],
      netProfit: totals.netProfit + row[14]
    }), { sold: 0, originalAmount: 0, returned: 0, refund: 0, remaining: 0, netAmount: 0, netProfit: 0 });
    const sheets = [
      { name: 'Tong hop', rows: [
        ['BÁO CÁO CỬA HÀNG', ml(month)],
        ['Chỉ tiêu', 'Số tiền'],
        ['Doanh thu đơn bán', s.salesRev],
        ['Tiền hoàn đổi trả', s.returnRefund],
        ['Doanh thu nhập trực tiếp (chưa có giá vốn)', s.manualRev],
        ['Doanh thu sửa chữa', s.repairRev],
        ['Trừ chi phí vật liệu sửa chữa (cũng hiện ở Chi tiêu)', s.repairMaterialCost],
        ['Tổng doanh thu', s.rev],
        ['Giá vốn từ đơn bán', s.cogs],
        ['Lợi nhuận gộp sau giá vốn (tạm tính)', s.gross],
        ['Chi phí khác', s.operatingExp],
        ['Lợi nhuận ròng (tạm tính nếu có doanh thu nhập trực tiếp)', s.net],
        ['Số máy bán', s.units]
      ] },
      { name: 'Don ban', rows: [
        ['Ngày bán', 'Mã đơn', 'Hãng', 'Dòng máy', 'Dung lượng', 'Màu sắc', 'Số lượng bán', 'Đơn giá bán', 'Giá vốn / máy', 'Thành tiền gốc', 'Số lượng hoàn đến tháng báo cáo', 'Tiền hoàn đến tháng báo cáo', 'Số lượng còn bán', 'Thành tiền còn lại', 'Lãi sau hoàn', 'Khách hàng', 'Thanh toán'],
        ...saleRows,
        ['Tổng đơn bán trong tháng', '', '', '', '', '', saleTotals.sold, '', '', saleTotals.originalAmount, saleTotals.returned, saleTotals.refund, saleTotals.remaining, saleTotals.netAmount, saleTotals.netProfit, '', '']
      ] },
      { name: 'Doi tra', rows: [
        ['Ngày trả', 'Mã đơn gốc', 'Điện thoại', 'Khách hàng', 'Số lượng trả', 'Tiền hoàn'],
        ...saleReturns.map(item => {
          const sale = allSales.get(item.saleId);
          return [item.date, item.saleId, sale?.name || '', sale?.cust || '', item.qty, item.refundAmt];
        }),
        ['Tổng tháng', '', '', '', saleReturns.reduce((total, item) => total + item.qty, 0), s.returnRefund]
      ] },
      { name: 'Thu nhap', rows: [
        ['Ngày', 'Loại', 'Số tiền', 'Chi tiết / ghi chú'],
        ...manualRevenue.map(item => [item.date, 'Doanh thu nhập trực tiếp (chưa có giá vốn)', item.amt, item.note || '']),
        ...repairRevenue.map(item => [item.date, 'Doanh thu sửa chữa', item.amt, item.note || ''])
      ] },
      { name: 'Sua chua', rows: [
        ['Ngày', 'Doanh thu', 'Chi phí vật liệu', 'Lãi sau vật liệu', 'Ghi chú'],
        ...repairRevenue.map(item => [item.date, item.amt, item.materialCost || 0, item.amt - (item.materialCost || 0), item.note || '']),
        ['Tổng tháng', s.repairRev, s.repairMaterialCost, s.repairRev - s.repairMaterialCost, '']
      ] },
      { name: 'Chi tieu', rows: [
        ['Ngày', 'Khoản mục', 'Số tiền', 'Chi tiết / ghi chú'],
        ...expenses.map(item => [item.date, item.cat, item.amt, item.note || ''])
      ] },
      { name: 'Bao cao ngay', rows: [
        ['Ngày', 'Doanh thu đơn bán', 'Hoàn đổi trả', 'Số máy trả', 'Doanh thu nhập trực tiếp', 'Doanh thu sửa chữa', 'Vật liệu sửa chữa', 'Tổng doanh thu', 'Giá vốn', 'Chi phí khác', 'Lợi nhuận tạm tính', 'Số máy bán'],
        ...dailyRows.map(day => [day.date, day.salesRev, day.returnRefund, day.returnedUnits, day.manualRev, day.repairRev, day.repairMaterialCost, day.revenue, day.cogs, day.operatingExp, day.net, day.units]),
        ['Tổng tháng', s.salesRev, s.returnRefund, s.returnedUnits, s.manualRev, s.repairRev, s.repairMaterialCost, s.rev, s.cogs, s.operatingExp, s.net, s.units]
      ] }
    ];
    const { blob, fileName } = createMonthlyExcel(month, sheets);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <div className="card"><div className="sp" style={{ justifyContent: 'space-between' }}>
      <h2>Báo cáo tháng {ml(month)}</h2>
      <button className="p" onClick={exportMonth}>Xuất Excel tháng này</button>
    </div>
      <div className="scroll"><table><tbody>
        <tr><td>Doanh thu từ đơn bán</td><td className="n">{fmt(s.salesRev)}</td></tr>
        <tr><td>Trừ tiền hoàn đổi trả ({s.returnedUnits} máy)</td><td className="n">{fmt(s.returnRefund)}</td></tr>
        <tr><td>Doanh thu nhập trực tiếp</td><td className="n">{fmt(s.manualRev)}</td></tr>
        <tr><td>Doanh thu sửa chữa</td><td className="n">{fmt(s.repairRev)}</td></tr>
        <tr><td><b>Tổng doanh thu</b></td><td className="n"><b>{fmt(s.rev)}</b></td></tr>
        <tr><td>Trừ giá vốn hàng bán</td><td className="n">{fmt(s.cogs)}</td></tr>
        <tr><td><b>Lợi nhuận gộp sau giá vốn</b></td><td className="n"><b>{fmt(s.gross)}</b></td></tr>
        <tr><td>Trừ chi phí vật liệu sửa chữa (cũng hiện ở Chi tiêu)</td><td className="n">{fmt(s.repairMaterialCost)}</td></tr>
        <tr><td>Trừ chi phí khác</td><td className="n">{fmt(s.operatingExp)}</td></tr>
        <tr><td><b>Lợi nhuận tạm tính</b></td><td className={cls(s.net)}><b>{fmt(s.net)}</b></td></tr>
      </tbody></table></div>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '10px 0 0' }}>
        Đơn bán được ghi nhận vào tháng bán; tiền hoàn và số máy trả được ghi nhận vào tháng đổi trả. Giá vốn hàng trả được hoàn lại trong tháng đổi trả. Vật liệu sửa chữa được tính một lần trong tổng chi phí và hiển thị riêng để đối chiếu. Doanh thu nhập trực tiếp chưa có giá vốn tương ứng nên lợi nhuận là tạm tính.
      </p>
    </div>
    <div className="card"><h2>Báo cáo từng ngày — tháng {ml(month)}</h2>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '0 0 10px' }}>
        Bao gồm cả ngày chưa phát sinh giao dịch. Lợi nhuận là tạm tính nếu có doanh thu nhập trực tiếp chưa có giá vốn.
      </p>
      <div className="scroll"><table><thead><tr>
        <th>Ngày</th><th className="n">Đơn bán</th><th className="n">Hoàn đổi trả</th><th className="n">Máy trả</th><th className="n">Nhập trực tiếp</th><th className="n">Sửa chữa</th><th className="n">Vật liệu sửa chữa</th><th className="n">Tổng doanh thu</th>
        <th className="n">Giá vốn</th><th className="n">Chi phí khác</th><th className="n">Lợi nhuận tạm tính</th><th className="n">Số máy</th>
      </tr></thead><tbody>
        {dailyRows.map(day => <tr key={day.date}>
          <td>{day.date.slice(8)}/{day.date.slice(5, 7)}</td>
          <td className="n">{fmt(day.salesRev)}</td><td className="n">{fmt(day.returnRefund)}</td><td className="n">{day.returnedUnits}</td><td className="n">{fmt(day.manualRev)}</td><td className="n">{fmt(day.repairRev)}</td><td className="n">{fmt(day.repairMaterialCost)}</td>
          <td className="n">{fmt(day.revenue)}</td><td className="n">{fmt(day.cogs)}</td>
          <td className="n">{fmt(day.operatingExp)}</td><td className={cls(day.net)}>{fmt(day.net)}</td><td className="n">{day.units}</td>
        </tr>)}
        <tr><td><b>Tổng tháng</b></td><td className="n"><b>{fmt(s.salesRev)}</b></td><td className="n"><b>{fmt(s.returnRefund)}</b></td><td className="n"><b>{s.returnedUnits}</b></td><td className="n"><b>{fmt(s.manualRev)}</b></td><td className="n"><b>{fmt(s.repairRev)}</b></td><td className="n"><b>{fmt(s.repairMaterialCost)}</b></td>
          <td className="n"><b>{fmt(s.rev)}</b></td><td className="n"><b>{fmt(s.cogs)}</b></td><td className="n"><b>{fmt(s.operatingExp)}</b></td>
          <td className={cls(s.net)}><b>{fmt(s.net)}</b></td><td className="n"><b>{s.units}</b></td></tr>
      </tbody></table></div>
    </div>
    <div className="card"><h2>12 tháng gần nhất (lãi tạm tính cộng dồn {sh(tot)})</h2>
      <div className="scroll"><table><thead><tr><th>Tháng</th><th className="n">Đơn bán</th><th className="n">Hoàn đổi trả</th><th className="n">Máy trả</th><th className="n">Nhập trực tiếp</th><th className="n">Sửa chữa</th><th className="n">Vật liệu sửa chữa</th><th className="n">Tổng doanh thu</th><th className="n">Giá vốn</th><th className="n">Chi phí khác</th><th className="n">Lãi tạm tính</th><th className="n">Số máy bán</th></tr></thead>
        <tbody>{rows.map(([k, r]) => <tr key={k}><td>{ml(k)}</td><td className="n">{fmt(r.salesRev)}</td><td className="n">{fmt(r.returnRefund)}</td><td className="n">{r.returnedUnits}</td><td className="n">{fmt(r.manualRev)}</td><td className="n">{fmt(r.repairRev)}</td><td className="n">{fmt(r.repairMaterialCost)}</td><td className="n">{fmt(r.rev)}</td><td className="n">{fmt(r.cogs)}</td><td className="n">{fmt(r.operatingExp)}</td><td className={cls(r.net)}>{fmt(r.net)}</td><td className="n">{r.units}</td></tr>)}</tbody></table></div>
      <div style={{ marginTop: 12 }}><button onClick={() => setShow(!show)}>{show ? 'Ẩn CSV' : 'Xem dạng CSV để sao chép'}</button>
        {show && <div style={{ marginTop: 8 }}><textarea readOnly value={csv} onClick={e => e.target.select()} /></div>}</div>
    </div>
  </>;
}
