import { useMemo, useState } from 'react';
import { CATS, fmt, uid } from '../lib';
import { readSpreadsheet } from '../lib/spreadsheet';

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const dateWords = ['ngay', 'date', 'day'];
const amountWords = ['doanh thu', 'chi tieu', 'khoan chi', 'revenue', 'expense', 'thanh tien', 'tong tien', 'so tien', 'amount', 'sales'];
const noteWords = ['ghi chu', 'note', 'dien giai', 'noi dung', 'khach hang'];
const categoryWords = ['khoan muc', 'loai chi', 'hang muc', 'category', 'expense type'];

function detectColumn(headers, words, ignored = -1) {
  return headers.findIndex((header, index) => index !== ignored && words.some(word => normalize(header).includes(word)));
}

function recordKey(entry) {
  return `${entry.date}|${entry.amt}|${entry.note || ''}|${entry.cat || ''}`;
}

function parseDate(value) {
  if (value && typeof value === 'object' && Number.isFinite(value.excelDate)) value = value.excelDate;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 1 || value > 2958465) return '';
    const parsed = new Date(Math.round((value - 25569) * 86400000));
    return validDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
  }
  const text = String(value ?? '').trim();
  if (/^\d{5}(?:\.\d+)?$/.test(text)) return parseDate(Number(text));
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return validDate(+match[1], +match[2], +match[3]);
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (match) {
    const year = +match[3] < 100 ? (+match[3] < 50 ? 2000 + +match[3] : 1900 + +match[3]) : +match[3];
    return validDate(year, +match[2], +match[1]);
  }
  return '';
}

function validDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let text = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!text) return NaN;
  const separators = [...text.matchAll(/[.,]/g)];
  if (separators.length) {
    const last = separators[separators.length - 1].index;
    const decimals = text.length - last - 1;
    if (separators.length > 1 && decimals !== 2 || decimals === 3) text = text.replace(/[.,]/g, '');
    else text = text.slice(0, last).replace(/[.,]/g, '') + '.' + text.slice(last + 1);
  }
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : NaN;
}

function headerRowIndex(rows) {
  return rows.findIndex(row => {
    const values = row.map(normalize);
    return values.some(value => dateWords.some(word => value.includes(word)))
      && values.some(value => amountWords.some(word => value.includes(word)));
  });
}

export default function DataImport({ data, update, initialType = 'revenue' }) {
  const [type, setType] = useState(initialType);
  const [workbooks, setWorkbooks] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [headerRow, setHeaderRow] = useState(-1);
  const [dateColumn, setDateColumn] = useState(-1);
  const [amountColumn, setAmountColumn] = useState(-1);
  const [noteColumn, setNoteColumn] = useState(-1);
  const [categoryColumn, setCategoryColumn] = useState(-1);
  const [defaultCategory, setDefaultCategory] = useState(CATS[0]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedSheets = useMemo(() => (workbooks || []).map(file => ({
    fileName: file.fileName,
    sheet: file.sheets.find(item => item.name === sheetName) || file.sheets[0]
  })), [workbooks, sheetName]);
  const rows = useMemo(() => selectedSheets[0]?.sheet.rows || [], [selectedSheets]);
  const headers = headerRow >= 0 ? (rows[headerRow] || []).map((value, i) => String(value || `Cột ${i + 1}`)) : (rows[0] || []).map((_, i) => `Cột ${i + 1}`);
  const firstDataRow = headerRow >= 0 ? headerRow + 1 : 0;

  const preview = useMemo(() => selectedSheets.flatMap(({ fileName: sourceFile, sheet: selectedSheet }) => {
    const sourceRows = selectedSheet.rows;
    return sourceRows.slice(firstDataRow).map((row, index) => {
      const date = parseDate(row[dateColumn]);
      const amount = parseAmount(row[amountColumn]);
      const noteParts = noteColumn >= 0 && String(row[noteColumn] ?? '').trim()
        ? [String(row[noteColumn]).trim()]
        : [];
      const sourceHeaders = sourceRows[headerRow >= 0 ? headerRow : 0] || [];
      row.forEach((value, column) => {
        if (column === dateColumn || column === amountColumn || column === noteColumn || column === categoryColumn || value == null || value === '') return;
        const label = String(sourceHeaders[column] || `Cột ${column + 1}`).trim();
        noteParts.push(`${label}: ${String(value).trim()}`);
      });
      const note = noteParts.join(' | ');
      const category = categoryColumn >= 0 ? String(row[categoryColumn] ?? '').trim() : defaultCategory;
      const entry = date && Number.isFinite(amount) && amount > 0
        ? type === 'revenue' ? { date, amt: amount, note } : { date, amt: amount, note, cat: category || defaultCategory }
        : null;
      return { file: sourceFile, line: firstDataRow + index + 1, entry, rawDate: row[dateColumn], rawAmount: row[amountColumn] };
    }).filter(item => (item.rawDate != null && item.rawDate !== '') || (item.rawAmount != null && item.rawAmount !== ''));
  }), [selectedSheets, firstDataRow, dateColumn, amountColumn, noteColumn, categoryColumn, defaultCategory, type]);

  const existingKeys = useMemo(() => new Set((type === 'revenue' ? data.manualRevenues || [] : data.exps || []).map(entry =>
    `${entry.date}|${entry.amt}|${entry.note || ''}|${entry.cat || ''}`)), [data.manualRevenues, data.exps, type]);
  const valid = preview.filter(row => row.entry);
  const { importable, duplicateCount } = useMemo(() => {
    const seen = new Set(existingKeys);
    const ready = [];
    let duplicates = 0;
    valid.forEach(row => {
      const key = recordKey(row.entry);
      if (seen.has(key)) duplicates++;
      else { seen.add(key); ready.push(row); }
    });
    return { importable: ready, duplicateCount: duplicates };
  }, [valid, existingKeys]);
  const invalidCount = preview.length - valid.length;
  const total = importable.reduce((sum, row) => sum + row.entry.amt, 0);
  const importableKeys = new Set(importable.map(row => recordKey(row.entry)));

  const loadFile = async event => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    setError('');
    setBusy(true);
    try {
      const parsed = await Promise.all(files.map(async file => {
        try {
          const sheets = await readSpreadsheet(file);
          if (!sheets.length) throw new Error('File không có trang tính dữ liệu.');
          return { fileName: file.name, sheets };
        } catch (e) {
          throw new Error(`${file.name}: ${e.message}`);
        }
      }));
      const initialRows = parsed[0].sheets[0].rows;
      const detectedHeader = headerRowIndex(initialRows);
      const headersAt = initialRows[detectedHeader >= 0 ? detectedHeader : 0] || [];
      const detectedDate = detectColumn(headersAt, dateWords);
      const detectedCategory = detectColumn(headersAt, categoryWords);
      const detectedAmount = detectColumn(headersAt, amountWords, detectedCategory);
      setWorkbooks(parsed);
      setSheetName(parsed[0].sheets[0].name);
      setHeaderRow(detectedHeader);
      setDateColumn(detectedDate);
      setAmountColumn(detectedAmount);
      setNoteColumn(detectColumn(headersAt, noteWords));
      setCategoryColumn(detectedCategory);
      if (detectedDate < 0 || detectedAmount < 0) setError('Chưa tự nhận diện được cột ngày hoặc doanh thu. Hãy chọn cột tương ứng bên dưới.');
    } catch (e) {
      setWorkbooks(null);
      setError(`Không đọc được file: ${e.message}`);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const chooseSheet = name => {
    const newRows = workbooks[0].sheets.find(item => item.name === name)?.rows || workbooks[0].sheets[0].rows;
    const detectedHeader = headerRowIndex(newRows);
    const headersAt = newRows[detectedHeader >= 0 ? detectedHeader : 0] || [];
    setSheetName(name);
    setHeaderRow(detectedHeader);
    setDateColumn(detectColumn(headersAt, dateWords));
    const detectedCategory = detectColumn(headersAt, categoryWords);
    setAmountColumn(detectColumn(headersAt, amountWords, detectedCategory));
    setNoteColumn(detectColumn(headersAt, noteWords));
    setCategoryColumn(detectedCategory);
  };

  const chooseHeader = value => {
    const index = Number(value);
    const columns = rows[index >= 0 ? index : 0] || [];
    setHeaderRow(index);
    if (index >= 0) {
      setDateColumn(detectColumn(columns, dateWords));
      setAmountColumn(detectColumn(columns, amountWords));
      setNoteColumn(detectColumn(columns, noteWords));
      setCategoryColumn(detectColumn(columns, categoryWords));
    }
  };

  const importRows = () => {
    if (!importable.length) return;
    if (!confirm(`Nhập ${importable.length} dòng ${type === 'revenue' ? 'doanh thu' : 'chi tiêu'} tổng cộng ${fmt(total)}? ${duplicateCount ? `Bỏ qua ${duplicateCount} dòng trùng.` : ''}`)) return;
    const records = importable.map(row => ({ id: uid(), ...row.entry }));
    update(state => type === 'revenue'
      ? { ...state, manualRevenues: [...(state.manualRevenues || []), ...records] }
      : { ...state, exps: [...(state.exps || []), ...records] });
    setNotice(`Đã nhập ${records.length} dòng ${type === 'revenue' ? 'doanh thu' : 'chi tiêu'}. Có thể đổi loại dữ liệu để nhập tiếp từ các file này.`);
  };

  const columnOptions = (value, onChange, optional = false) => <select value={value} onChange={event => onChange(Number(event.target.value))}>
    {!optional && <option value={-1}>Chọn cột</option>}
    {optional && <option value={-1}>Không dùng</option>}
    {headers.map((header, index) => <option key={index} value={index}>{header} (cột {index + 1})</option>)}
  </select>;

  return <section className="card">
    <h2>Nhập dữ liệu từ Excel / CSV</h2>
    <p style={{ color: 'var(--mute)', fontSize: 13, margin: '0 0 10px' }}>
      Hỗ trợ .xlsx, .xlsm, .csv. File được xử lý trên thiết bị này; chọn loại dữ liệu và các cột chi tiết, xem trước rồi mới lưu.
    </p>
    <div className="form" style={{ marginBottom: 10 }}>
      <div><label>Loại dữ liệu nhập</label><select value={type} onChange={event => setType(event.target.value)}>
        <option value="revenue">Doanh thu</option><option value="expense">Chi tiêu</option>
      </select></div>
    </div>
    <label htmlFor="revenue-import-file">Chọn file</label>
    <input id="revenue-import-file" type="file" accept=".xlsx,.xlsm,.csv" onChange={loadFile} disabled={busy} multiple />
    {busy && <p role="status">Đang đọc các file…</p>}
    {error && <p role="alert" style={{ color: 'var(--neg)' }}>{error}</p>}
    {notice && <p role="status" style={{ color: 'var(--acc)' }}>{notice}</p>}
    {workbooks && <>
      <p><b>{workbooks.length} file đã chọn:</b> {workbooks.map(file => file.fileName).join(', ')}</p>
      {[...new Set(workbooks.flatMap(file => file.sheets.map(item => item.name)))].length > 1 && <div className="form">
        <div><label>Trang tính</label><select value={sheetName} onChange={event => chooseSheet(event.target.value)}>
          {[...new Set(workbooks.flatMap(file => file.sheets.map(item => item.name)))].map(name => <option key={name}>{name}</option>)}
        </select></div>
      </div>}
      {selectedSheets.some(({ sheet: selectedSheet }) => selectedSheet.name !== sheetName) && <p style={{ color: 'var(--warn)' }}>
        File nào không có trang tính “{sheetName}” sẽ dùng trang tính đầu tiên của file đó.
      </p>}
      <div className="form" style={{ margin: '12px 0' }}>
        <div><label>Dòng tiêu đề</label><select value={headerRow} onChange={event => chooseHeader(event.target.value)}>
          <option value={-1}>Không có tiêu đề (dòng đầu là dữ liệu)</option>
          {rows.slice(0, 30).map((row, index) => <option key={index} value={index}>Dòng {index + 1}: {row.slice(0, 4).join(' · ').slice(0, 70)}</option>)}
        </select></div>
        <div><label>Cột ngày</label>{columnOptions(dateColumn, setDateColumn)}</div>
        <div><label>{type === 'revenue' ? 'Cột doanh thu' : 'Cột số tiền chi'}</label>{columnOptions(amountColumn, setAmountColumn)}</div>
        <div><label>Cột ghi chú</label>{columnOptions(noteColumn, setNoteColumn, true)}</div>
        {type === 'expense' && <div><label>Cột khoản mục</label>{columnOptions(categoryColumn, setCategoryColumn, true)}</div>}
        {type === 'expense' && categoryColumn < 0 && <div><label>Khoản mục mặc định</label><select value={defaultCategory} onChange={event => setDefaultCategory(event.target.value)}>
          {CATS.map(category => <option key={category}>{category}</option>)}
        </select></div>}
      </div>
      <p role="status">
        Hợp lệ: {valid.length} dòng · Lỗi/bỏ trống: {invalidCount} · Trùng sẽ bỏ qua: {duplicateCount} · Sẽ nhập: {importable.length} dòng ({fmt(total)})
      </p>
      <div className="scroll"><table><thead><tr><th>File</th><th>Dòng</th><th>Ngày đọc được</th>{type === 'expense' && <th>Khoản mục</th>}<th className="n">{type === 'revenue' ? 'Doanh thu' : 'Số tiền chi'}</th><th>Chi tiết / ghi chú</th><th>Kiểm tra</th></tr></thead>
        <tbody>{preview.slice(0, 12).map(row => <tr key={`${row.file}-${row.line}`}>
          <td>{row.file}</td><td>{row.line}</td><td>{row.entry?.date || String(row.rawDate || '—')}</td>{type === 'expense' && <td>{row.entry?.cat || '—'}</td>}
          <td className="n">{row.entry ? fmt(row.entry.amt) : String(row.rawAmount || '—')}</td>
          <td>{row.entry?.note || '—'}</td>
          <td>{!row.entry ? 'Ngày hoặc số tiền không hợp lệ' : importableKeys.has(recordKey(row.entry)) ? 'Sẵn sàng' : 'Trùng — bỏ qua'}</td>
        </tr>)}</tbody></table></div>
      {preview.length > 12 && <p style={{ color: 'var(--mute)' }}>Đang xem 12/{preview.length} dòng đầu.</p>}
      <div className="sp">
        <button className="p" onClick={importRows} disabled={!importable.length}>Nhập {importable.length} dòng {type === 'revenue' ? 'doanh thu' : 'chi tiêu'}</button>
        <button onClick={() => { setWorkbooks(null); setError(''); }}>Hủy file</button>
      </div>
    </>}
  </section>;
}
