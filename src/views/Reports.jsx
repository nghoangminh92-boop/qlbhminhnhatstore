import { useState } from 'react';
import { fmt, sh, ymOf, stats } from '../lib';
import { ml } from './shared';
import { createMonthlyExcel } from '../lib/exportExcel';

export default function Reports({ data, month }) {
  const [show, setShow] = useState(false);
  const s = stats(data, month), [y, mo] = month.split('-').map(Number), rows = [];
  for (let i = 11; i >= 0; i--) { const k = ymOf(new Date(y, mo - 1 - i, 1)); rows.push([k, stats(data, k)]); }
  const dailyMap = new Map();
  for (const sale of s.sl) {
    const day = dailyMap.get(sale.date) || { salesRev: 0, manualRev: 0, cogs: 0, exp: 0, units: 0 };
    day.salesRev += sale.price * sale.qty;
    day.cogs += sale.cost * sale.qty;
    day.units += sale.qty;
    dailyMap.set(sale.date, day);
  }
  for (const revenue of s.manual) {
    const day = dailyMap.get(revenue.date) || { salesRev: 0, manualRev: 0, cogs: 0, exp: 0, units: 0 };
    day.manualRev += revenue.amt;
    dailyMap.set(revenue.date, day);
  }
  for (const expense of s.ex) {
    const day = dailyMap.get(expense.date) || { salesRev: 0, manualRev: 0, cogs: 0, exp: 0, units: 0 };
    day.exp += expense.amt;
    dailyMap.set(expense.date, day);
  }
  const daysInMonth = new Date(y, mo, 0).getDate();
  const dailyRows = Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    const day = dailyMap.get(date) || { salesRev: 0, manualRev: 0, cogs: 0, exp: 0, units: 0 };
    const revenue = day.salesRev + day.manualRev;
    return { date, ...day, revenue, gross: revenue - day.cogs, net: revenue - day.cogs - day.exp };
  });
  const csv = 'Tháng,Doanh thu đơn bán,Doanh thu nhập trực tiếp,Tổng doanh thu,Giá vốn,Chi phí,Lợi nhuận tạm tính,Số máy\n' + rows.map(r => [r[0], r[1].salesRev, r[1].manualRev, r[1].rev, r[1].cogs, r[1].exp, r[1].net, r[1].units].join(',')).join('\n');
  const tot = rows.reduce((a, r) => a + r[1].net, 0);
  const cls = n => 'n ' + (n >= 0 ? 'pos' : 'neg');
  const exportMonth = () => {
    const sales = [...s.sl].sort((a, b) => a.date.localeCompare(b.date));
    const expenses = [...s.ex].sort((a, b) => a.date.localeCompare(b.date));
    const manualRevenue = [...s.manual].sort((a, b) => a.date.localeCompare(b.date));
    const phoneById = new Map(data.phones.map(phone => [phone.id, phone]));
    const saleRows = sales.map(item => {
      const phone = phoneById.get(item.phoneId);
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
        (item.price - item.cost) * item.qty,
        item.cust || '',
        item.pay || ''
      ];
    });
    const sheets = [
      { name: 'Tong hop', rows: [
        ['BÁO CÁO CỬA HÀNG', ml(month)],
        ['Chỉ tiêu', 'Số tiền'],
        ['Doanh thu đơn bán', s.salesRev],
        ['Doanh thu nhập trực tiếp (chưa có giá vốn)', s.manualRev],
        ['Tổng doanh thu', s.rev],
        ['Giá vốn từ đơn bán', s.cogs],
        ['Lợi nhuận gộp (tạm tính)', s.gross],
        ['Chi tiêu', s.exp],
        ['Lợi nhuận ròng (tạm tính nếu có doanh thu nhập trực tiếp)', s.net],
        ['Số máy bán', s.units]
      ] },
      { name: 'Don ban', rows: [
        ['Ngày bán', 'Mã đơn', 'Hãng', 'Dòng máy', 'Dung lượng', 'Màu sắc', 'Số lượng bán', 'Đơn giá bán', 'Giá vốn / máy', 'Thành tiền', 'Lợi nhuận', 'Khách hàng', 'Thanh toán'],
        ...saleRows,
        ['Tổng tháng', '', '', '', '', '', s.units, '', '', s.salesRev, s.salesRev - s.cogs, '', '']
      ] },
      { name: 'Thu nhap', rows: [
        ['Ngày', 'Loại', 'Số tiền', 'Chi tiết / ghi chú'],
        ...manualRevenue.map(item => [item.date, 'Doanh thu nhập trực tiếp (chưa có giá vốn)', item.amt, item.note || ''])
      ] },
      { name: 'Chi tieu', rows: [
        ['Ngày', 'Khoản mục', 'Số tiền', 'Chi tiết / ghi chú'],
        ...expenses.map(item => [item.date, item.cat, item.amt, item.note || ''])
      ] },
      { name: 'Bao cao ngay', rows: [
        ['Ngày', 'Doanh thu đơn bán', 'Doanh thu nhập trực tiếp', 'Tổng doanh thu', 'Giá vốn', 'Chi tiêu', 'Lợi nhuận tạm tính', 'Số máy bán'],
        ...dailyRows.map(day => [day.date, day.salesRev, day.manualRev, day.revenue, day.cogs, day.exp, day.net, day.units]),
        ['Tổng tháng', s.salesRev, s.manualRev, s.rev, s.cogs, s.exp, s.net, s.units]
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
        <tr><td>Doanh thu nhập trực tiếp</td><td className="n">{fmt(s.manualRev)}</td></tr>
        <tr><td><b>Tổng doanh thu</b></td><td className="n"><b>{fmt(s.rev)}</b></td></tr>
        <tr><td>Trừ giá vốn hàng bán</td><td className="n">{fmt(s.cogs)}</td></tr>
        <tr><td><b>Lợi nhuận gộp</b></td><td className="n"><b>{fmt(s.gross)}</b></td></tr>
        <tr><td>Trừ chi phí vận hành</td><td className="n">{fmt(s.exp)}</td></tr>
        <tr><td><b>Lợi nhuận tạm tính</b></td><td className={cls(s.net)}><b>{fmt(s.net)}</b></td></tr>
      </tbody></table></div>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '10px 0 0' }}>
        Giá vốn chỉ tính từ đơn bán. Doanh thu nhập trực tiếp chưa có giá vốn tương ứng nên lợi nhuận là tạm tính. Tiền nhập máy được tính vào giá vốn khi bán, không tính vào chi phí vận hành.
      </p>
    </div>
    <div className="card"><h2>Báo cáo từng ngày — tháng {ml(month)}</h2>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '0 0 10px' }}>
        Bao gồm cả ngày chưa phát sinh giao dịch. Lợi nhuận là tạm tính nếu có doanh thu nhập trực tiếp chưa có giá vốn.
      </p>
      <div className="scroll"><table><thead><tr>
        <th>Ngày</th><th className="n">Đơn bán</th><th className="n">Nhập trực tiếp</th><th className="n">Tổng doanh thu</th>
        <th className="n">Giá vốn</th><th className="n">Chi tiêu</th><th className="n">Lợi nhuận tạm tính</th><th className="n">Số máy</th>
      </tr></thead><tbody>
        {dailyRows.map(day => <tr key={day.date}>
          <td>{day.date.slice(8)}/{day.date.slice(5, 7)}</td>
          <td className="n">{fmt(day.salesRev)}</td><td className="n">{fmt(day.manualRev)}</td>
          <td className="n">{fmt(day.revenue)}</td><td className="n">{fmt(day.cogs)}</td>
          <td className="n">{fmt(day.exp)}</td><td className={cls(day.net)}>{fmt(day.net)}</td><td className="n">{day.units}</td>
        </tr>)}
        <tr><td><b>Tổng tháng</b></td><td className="n"><b>{fmt(s.salesRev)}</b></td><td className="n"><b>{fmt(s.manualRev)}</b></td>
          <td className="n"><b>{fmt(s.rev)}</b></td><td className="n"><b>{fmt(s.cogs)}</b></td><td className="n"><b>{fmt(s.exp)}</b></td>
          <td className={cls(s.net)}><b>{fmt(s.net)}</b></td><td className="n"><b>{s.units}</b></td></tr>
      </tbody></table></div>
    </div>
    <div className="card"><h2>12 tháng gần nhất (lãi tạm tính cộng dồn {sh(tot)})</h2>
      <div className="scroll"><table><thead><tr><th>Tháng</th><th className="n">Đơn bán</th><th className="n">Nhập trực tiếp</th><th className="n">Tổng doanh thu</th><th className="n">Giá vốn</th><th className="n">Chi phí</th><th className="n">Lãi tạm tính</th><th className="n">Số máy</th></tr></thead>
        <tbody>{rows.map(([k, r]) => <tr key={k}><td>{ml(k)}</td><td className="n">{fmt(r.salesRev)}</td><td className="n">{fmt(r.manualRev)}</td><td className="n">{fmt(r.rev)}</td><td className="n">{fmt(r.cogs)}</td><td className="n">{fmt(r.exp)}</td><td className={cls(r.net)}>{fmt(r.net)}</td><td className="n">{r.units}</td></tr>)}</tbody></table></div>
      <div style={{ marginTop: 12 }}><button onClick={() => setShow(!show)}>{show ? 'Ẩn CSV' : 'Xem dạng CSV để sao chép'}</button>
        {show && <div style={{ marginTop: 8 }}><textarea readOnly value={csv} onClick={e => e.target.select()} /></div>}</div>
    </div>
  </>;
}
