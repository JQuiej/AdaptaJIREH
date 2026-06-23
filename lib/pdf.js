import pdfParse from 'pdf-parse';

/** Extrae texto plano de un Buffer PDF. */
export async function extractTextFromPDF(buffer) {
  const { text } = await pdfParse(buffer);
  return text.trim();
}
