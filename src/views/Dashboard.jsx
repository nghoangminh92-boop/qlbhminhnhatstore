import { useState } from 'react';
import { fmt, sh, ymOf, stats } from '../lib';
import { Empty } from './shared';

const DONUT_COLORS = ['#800000', '#c62828', '#ef5350', '#f28b82', '#f6b7b4', '#9e3b3b'];
const monthLabel = date => `T${date.getMonth() + 1}`;

function Sparkline({ values }) {
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 50 : index / (values.length - 1) * 100;
    const y = 34 - value / max * 29;
    return `${x},${y}`;
  }).join(' ');
  return <svg className="dashboard-sparkline" viewBox="0 0 100 38" preserveAspectRatio="none" role="img" aria-label="Xu hướng doanh thu sáu tháng gần nhất">
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function SalesChart({ rows, period }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const max = Math.max(1, ...rows.flatMap(row => [row.orders, row.customers]));
  const point = (value, index) => ({
    x: rows.length <= 1 ? 320 : 42 + index * (556 / (rows.length - 1)),
    y: 205 - value / max * 160
  });
  const line = key => rows.map((row, index) => {
    const { x, y } = point(row[key], index);
    return `${x},${y}`;
  }).join(' ');

  return <div className="dashboard-line-chart">
    <svg viewBox="0 0 640 250" role="img" aria-label={`Biểu đồ ${period === 'day' ? 'theo ngày' : 'theo tháng'}: đơn bán và khách hàng mới`}>
      {[45, 85, 125, 165, 205].map(y => <line key={y} x1="42" y1={y} x2="598" y2={y} className="dashboard-grid-line" />)}
      <polyline points={line('orders')} className="dashboard-chart-line orders-line" />
      <polyline points={line('customers')} className="dashboard-chart-line customers-line" />
      {rows.map((row, index) => {
        const orderPoint = point(row.orders, index);
        const customerPoint = point(row.customers, index);
        const labelX = rows.length <= 1 ? 320 : 42 + index * (556 / (rows.length - 1));
        const interval = period === 'day' ? Math.ceil(rows.length / 7) : 1;
        return <g key={`${row.label}-${index}`} onMouseEnter={() => setHoverIndex(index)} onMouseLeave={() => setHoverIndex(null)}>
          <circle cx={orderPoint.x} cy={orderPoint.y} r="5" className="dashboard-chart-point orders-point" />
          <circle cx={customerPoint.x} cy={customerPoint.y} r="5" className="dashboard-chart-point customers-point" />
          {index % interval === 0 && <text x={labelX} y="236" textAnchor="middle" className="dashboard-axis-label">{row.label}</text>}
          {hoverIndex === index && <g className="dashboard-chart-tooltip" transform={`translate(${Math.max(48, Math.min(orderPoint.x, 592))} ${Math.max(34, Math.min(orderPoint.y, customerPoint.y))})`}>
            <rect x="-56" y="-36" width="112" height="29" rx="7" />
            <text x="0" y="-17" textAnchor="middle">{row.label}: {row.orders} đơn · {row.customers} khách</text>
          </g>}
          <title>{`${row.label}: ${row.orders} đơn bán, ${row.customers} khách hàng mới`}</title>
        </g>;
      })}
    </svg>
  </div>;
}

export default function Dashboard({ data, month }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const [period, setPeriod] = useState('month');
  const current = stats(data, month);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(year, monthNumber - 1 - (5 - index), 1);
    return { date, key: ymOf(date), label: monthLabel(date), summary: stats(data, ymOf(date)) };
  });
  const previous = stats(data, ymOf(new Date(year, monthNumber - 2, 1)));
  const growth = previous.rev ? (current.rev - previous.rev) / previous.rev * 100 : null;
  const monthSales = data.sales.filter(sale => sale.date.slice(0, 7) === month);
  const monthReturns = (data.saleReturns || []).filter(item => item.date.slice(0, 7) === month);
  const customerNames = new Set(monthSales.map(sale => (sale.cust || '').trim()).filter(name => name && name.toLocaleLowerCase() !== 'khách lẻ'));
  const stockByBrand = new Map();
  data.phones.forEach(phone => {
    const brand = phone.brand || 'Khác';
    stockByBrand.set(brand, (stockByBrand.get(brand) || 0) + Number(phone.stock || 0));
  });
  const products = [...stockByBrand.entries()].filter(([, quantity]) => quantity > 0).sort((a, b) => b[1] - a[1]);
  const stockTotal = products.reduce((total, [, quantity]) => total + quantity, 0);
  let offset = 0;
  const donut = products.map(([brand, quantity], index) => {
    const start = offset;
    offset += quantity / Math.max(1, stockTotal) * 100;
    return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start}% ${offset}%`;
  }).join(', ');
  const firstCustomerDate = new Map();
  data.sales.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(sale => {
    const customer = (sale.cust || '').trim();
    if (!customer || customer.toLocaleLowerCase() === 'khách lẻ' || firstCustomerDate.has(customer)) return;
    firstCustomerDate.set(customer, sale.date);
  });
  const chartRows = period === 'month'
    ? months.map(({ key, label, summary }) => ({
      label,
      orders: summary.sl.length,
      customers: [...firstCustomerDate.values()].filter(date => date.slice(0, 7) === key).length
    }))
    : Array.from({ length: new Date(year, monthNumber, 0).getDate() }, (_, index) => {
      const day = String(index + 1).padStart(2, '0');
      const date = `${month}-${day}`;
      return {
        label: String(index + 1),
        orders: monthSales.filter(sale => sale.date === date).length,
        customers: [...firstCustomerDate.values()].filter(firstDate => firstDate === date).length
      };
    });
  const topRevenue = Math.max(1, ...months.map(item => item.summary.rev));

  return <section className="dashboard">
    <div className="dashboard-intro">
      <div><p className="dashboard-eyebrow">TỔNG QUAN CỬA HÀNG</p><h2>Chào mừng trở lại</h2><p>Theo dõi sức khỏe kinh doanh của Minh Nhật Store.</p></div>
      <span className="dashboard-period-label">Tháng {monthNumber}/{year}</span>
    </div>

    <div className="dashboard-metrics">
      <article className="dashboard-metric-card revenue-card">
        <div className="dashboard-metric-heading"><span className="dashboard-icon revenue-icon">₫</span><span>Doanh thu tháng này</span></div>
        <strong className="dashboard-metric-value">{sh(current.rev)}</strong>
        <div className="dashboard-growth">
          <span>{growth === null ? '—' : `${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth).toFixed(1)}%`}</span>
          <small>{growth === null ? 'Chưa có dữ liệu tháng trước để so sánh' : 'so với tháng trước'}</small>
        </div>
        <Sparkline values={months.map(item => item.summary.rev)} />
        <div className="dashboard-sparkline-labels"><span>{months[0].label}</span><span>{months[5].label}</span></div>
      </article>

      <article className="dashboard-metric-card orders-card">
        <div className="dashboard-metric-heading"><span className="dashboard-icon orders-icon">▤</span><span>Đơn bán trong tháng</span></div>
        <strong className="dashboard-metric-value">{monthSales.length.toLocaleString('vi-VN')}<small> đơn</small></strong>
        <div className="dashboard-order-breakdown">
          <div><span>Đơn đã ghi nhận</span><b>{monthSales.length}</b></div>
          <div><span>Máy đã bán</span><b>{current.units}</b></div>
          <div><span>Khách ghi nhận</span><b>{customerNames.size}</b></div>
          <div><span>Lượt đổi trả</span><b>{monthReturns.length}</b></div>
        </div>
      </article>
    </div>

    <div className="dashboard-analytics">
      <article className="dashboard-panel inventory-panel">
        <div className="dashboard-panel-heading"><div><h3>Cơ cấu hàng tồn kho</h3><p>Phân bổ số lượng theo thương hiệu</p></div><span className="dashboard-panel-icon">◉</span></div>
        {products.length ? <>
          <div className="dashboard-donut-layout">
            <div className="dashboard-donut" style={{ background: `conic-gradient(${donut})` }} role="img" aria-label={`Tồn kho tổng cộng ${stockTotal} sản phẩm`}>
              <div><strong>{stockTotal.toLocaleString('vi-VN')}</strong><span>sản phẩm</span></div>
            </div>
            <div className="dashboard-product-legend">{products.slice(0, 6).map(([brand, quantity], index) => <div key={brand}><i style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} /><span>{brand}</span><b>{quantity}</b></div>)}</div>
          </div>
          <div className="dashboard-stock-summary"><span>Tổng lượng hàng còn trong kho</span><strong>{stockTotal.toLocaleString('vi-VN')} sản phẩm</strong></div>
        </> : <Empty>Chưa có sản phẩm còn hàng trong kho.</Empty>}
      </article>

      <article className="dashboard-panel performance-panel">
        <div className="dashboard-panel-heading"><div><h3>Hiệu suất bán hàng</h3><p>Đơn bán và khách hàng mới</p></div>
          <div className="dashboard-period-switch" role="group" aria-label="Chu kỳ biểu đồ">
            <button className={period === 'day' ? 'selected' : ''} onClick={() => setPeriod('day')}>Ngày</button>
            <button className={period === 'month' ? 'selected' : ''} onClick={() => setPeriod('month')}>Tháng</button>
          </div>
        </div>
        <div className="dashboard-chart-legend"><span><i className="orders-legend" />Đơn bán</span><span><i className="customers-legend" />Khách hàng mới</span></div>
        <SalesChart rows={chartRows} period={period} />
      </article>
    </div>

    <article className="dashboard-panel dashboard-revenue-history">
      <div className="dashboard-panel-heading"><div><h3>Doanh thu 6 tháng gần nhất</h3><p>Đối chiếu doanh thu với giá vốn và chi phí</p></div></div>
      <div className="dashboard-history-chart">{months.map(item => <div className="dashboard-history-column" key={item.key}>
        <div className="dashboard-history-bars" title={`${item.label}: doanh thu ${fmt(item.summary.rev)}, giá vốn và chi phí ${fmt(item.summary.cogs + item.summary.exp)}`}>
          <i className="history-revenue" style={{ height: `${item.summary.rev / topRevenue * 100}%` }} />
          <i className="history-cost" style={{ height: `${(item.summary.cogs + item.summary.exp) / topRevenue * 100}%` }} />
        </div><span>{item.label}</span>
      </div>)}</div>
      <div className="dashboard-chart-legend"><span><i className="orders-legend" />Doanh thu</span><span><i className="customers-legend" />Giá vốn + chi phí</span></div>
    </article>
  </section>;
}
