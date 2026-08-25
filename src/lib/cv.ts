// Import the internal module directly: pdf-parse's index.js runs a
// require-time self-test (reading a bundled fixture PDF) whenever
// `module.parent` is undefined, which is always true once bundled —
// this throws ENOENT under Next.js/Turbopack. lib/pdf-parse.js skips it.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";

export async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "pdf") {
    const result = await pdfParse(buffer);
    return result.text.trim();
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  throw new Error(`Непідтримуваний формат файлу: .${ext}`);
}
