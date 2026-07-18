/* File parser — read PDF/DOCX/XLSX/TXT/CSV content as text */
export interface ParseResult { text: string; type: string; name: string; }

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json' || ext === 'xml' || ext === 'html' || ext === 'js' || ext === 'ts' || ext === 'py' || ext === 'css' || ext === 'yaml' || ext === 'yml' || ext === 'log') {
    return { text: await file.text(), type: ext, name: file.name };
  }
  if (ext === 'pdf') return parsePDF(file);
  if (ext === 'docx') return parseDOCX(file);
  if (ext === 'xlsx' || ext === 'xls') return parseXLSX(file);
  return { text: '', type: ext, name: file.name };
}

async function parsePDF(file: File): Promise<ParseResult> {
  try {
    const buf = await file.arrayBuffer();
    // Use pdf.js if loaded, otherwise return a note
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) return { text: '[PDF file — install pdf.js for parsing]', type: 'pdf', name: file.name };
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return { text: text.slice(0, 10000), type: 'pdf', name: file.name };
  } catch { return { text: '[PDF parsing failed]', type: 'pdf', name: file.name }; }
}

async function parseDOCX(file: File): Promise<ParseResult> {
  try {
    const buf = await file.arrayBuffer();
    const mammoth = (window as any).mammoth;
    if (!mammoth) return { text: '[DOCX file — install mammoth.js for parsing]', type: 'docx', name: file.name };
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return { text: result.value.slice(0, 10000), type: 'docx', name: file.name };
  } catch { return { text: '[DOCX parsing failed]', type: 'docx', name: file.name }; }
}

async function parseXLSX(file: File): Promise<ParseResult> {
  try {
    const buf = await file.arrayBuffer();
    const XLSX = (window as any).XLSX;
    if (!XLSX) return { text: '[XLSX file — install SheetJS for parsing]', type: 'xlsx', name: file.name };
    const wb = XLSX.read(buf, { type: 'array' });
    const sheets = wb.SheetNames.map((name: string) => `=== ${name} ===\n` + XLSX.utils.sheet_to_csv(wb.Sheets[name])).join('\n\n');
    return { text: sheets.slice(0, 10000), type: 'xlsx', name: file.name };
  } catch { return { text: '[XLSX parsing failed]', type: 'xlsx', name: file.name }; }
}
