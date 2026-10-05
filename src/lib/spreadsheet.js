const decoder = new TextDecoder();

function parseCsv(text) {
  const sample = text.split(/\r?\n/, 1)[0];
  const counts = new Map([',', ';', '\t'].map(char => [char, 0]));
  let inQuotes = false;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === '"') {
      if (inQuotes && sample[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && counts.has(sample[i])) counts.set(sample[i], counts.get(sample[i]) + 1);
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(value); value = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (value !== '' || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function xmlDocument(xml) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('Cấu trúc XML trong file Excel không hợp lệ.');
  return document;
}

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase();
  if (!letters) return -1;
  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function normalizeZipPath(path) {
  const resolved = new URL(path, 'https://spreadsheet.invalid/xl/').pathname;
  return decodeURIComponent(resolved.replace(/^\/+/, ''));
}

async function unzip(buffer) {
  const view = new DataView(buffer);
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('File Excel không phải định dạng .xlsx hợp lệ.');
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Không đọc được danh mục file Excel.');
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const contentStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(contentStart, contentStart + compressedSize);
    entries.set(name, { method, compressed });
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  const read = async path => {
    const entry = entries.get(path);
    if (!entry) throw new Error(`Không tìm thấy thành phần ${path} trong file Excel.`);
    if (entry.method === 0) return decoder.decode(entry.compressed);
    if (entry.method !== 8 || typeof DecompressionStream === 'undefined') {
      throw new Error('Trình duyệt không hỗ trợ giải nén file Excel này. Hãy dùng Chrome/Edge mới nhất hoặc lưu lại dưới dạng CSV.');
    }
    try {
      const stream = new Blob([entry.compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return decoder.decode(await new Response(stream).arrayBuffer());
    } catch {
      throw new Error('Không giải nén được file Excel. Hãy kiểm tra file hoặc lưu lại dưới dạng CSV.');
    }
  };
  read.has = path => entries.has(path);
  return read;
}

function parseSharedStrings(document) {
  return [...document.getElementsByTagName('si')].map(item =>
    [...item.getElementsByTagName('t')].map(text => text.textContent || '').join(''));
}

function dateStyleIndexes(xml) {
  if (!xml) return new Set();
  const document = xmlDocument(xml);
  const custom = new Map([...document.getElementsByTagName('numFmt')].map(node =>
    [Number(node.getAttribute('numFmtId')), node.getAttribute('formatCode') || '']));
  const dateFormat = format => /[ymdhis]/i.test(format.replace(/"[^"]*"|\\.|_.|\*./g, ''));
  const builtInDateFormats = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  const cellXfs = document.getElementsByTagName('cellXfs')[0];
  return new Set([...(cellXfs?.children || [])].map((xf, index) => {
    const id = Number(xf.getAttribute('numFmtId') || 0);
    return builtInDateFormats.has(id) || dateFormat(custom.get(id) || '') ? index : -1;
  }).filter(index => index >= 0));
}

function parseWorksheet(xml, sharedStrings, dateStyles) {
  const document = xmlDocument(xml);
  const rows = [];
  for (const rowNode of document.getElementsByTagName('row')) {
    const rowIndex = Number(rowNode.getAttribute('r')) - 1;
    if (!Number.isInteger(rowIndex) || rowIndex < 0) continue;
    const row = rows[rowIndex] || [];
    for (const cell of rowNode.getElementsByTagName('c')) {
      const col = columnIndex(cell.getAttribute('r') || '');
      if (col < 0) continue;
      const type = cell.getAttribute('t');
      const valueNode = cell.getElementsByTagName('v')[0];
      let value = valueNode?.textContent || '';
      if (type === 's') value = sharedStrings[Number(value)] ?? '';
      else if (type === 'inlineStr') value = [...cell.getElementsByTagName('t')].map(text => text.textContent || '').join('');
      else if (type === 'b') value = value === '1';
      else if (!type && value !== '') {
        value = Number(value);
        if (dateStyles.has(Number(cell.getAttribute('s') || 0)) && Number.isFinite(value)) value = { excelDate: value };
      }
      row[col] = value;
    }
    rows[rowIndex] = row;
  }
  return rows.map(row => row || []);
}

async function parseXlsx(buffer) {
  const readZip = await unzip(buffer);
  const workbook = xmlDocument(await readZip('xl/workbook.xml'));
  const relationships = xmlDocument(await readZip('xl/_rels/workbook.xml.rels'));
  const targets = new Map([...relationships.getElementsByTagName('Relationship')].map(node =>
    [node.getAttribute('Id'), normalizeZipPath(node.getAttribute('Target') || '')]));
  let sharedStrings = [];
  if (readZip.has('xl/sharedStrings.xml')) sharedStrings = parseSharedStrings(xmlDocument(await readZip('xl/sharedStrings.xml')));
  let dateStyles = new Set();
  if (readZip.has('xl/styles.xml')) dateStyles = dateStyleIndexes(await readZip('xl/styles.xml'));

  const sheets = [];
  for (const node of workbook.getElementsByTagName('sheet')) {
    const name = node.getAttribute('name');
    const relation = node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
      || node.getAttribute('r:id');
    const path = targets.get(relation);
    if (name && path) sheets.push({ name, rows: parseWorksheet(await readZip(path), sharedStrings, dateStyles) });
  }
  if (!sheets.length) throw new Error('Không tìm thấy trang tính trong file Excel.');
  return sheets;
}

export async function readSpreadsheet(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv' || file.type === 'text/csv') {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    return [{ name: 'CSV', rows: parseCsv(text) }];
  }
  if (extension === 'xls') throw new Error('File .xls cũ chưa được hỗ trợ. Hãy mở bằng Excel và lưu thành .xlsx hoặc .csv.');
  if (extension !== 'xlsx' && extension !== 'xlsm') throw new Error('Chọn file .xlsx, .xlsm hoặc .csv.');
  return parseXlsx(await file.arrayBuffer());
}
