import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { formatLatexForDisplay } from "@/lib/math-format";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMathInBody(value: string): string {
  const expression =
    /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = expression.exec(value))) {
    output += escapeHtml(value.slice(cursor, match.index)).replace(
      /\n/g,
      "<br />",
    );
    const display = match[2] !== undefined || match[3] !== undefined;
    const formula = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    const delimiters = display ? ["\\[", "\\]"] : ["\\(", "\\)"];
    const source = `${delimiters[0]}${escapeHtml(formula)}${delimiters[1]}`;
    const fallback = escapeHtml(formatLatexForDisplay(formula));
    output += display
      ? `<div class="math-display"><span class="math-source">${source}</span><span class="math-fallback">${fallback}</span></div>`
      : `<span class="math-inline"><span class="math-source">${source}</span><span class="math-fallback">${fallback}</span></span>`;
    cursor = expression.lastIndex;
  }

  output += escapeHtml(value.slice(cursor)).replace(/\n/g, "<br />");
  return output;
}

export async function generateLearningPdf(
  title: string,
  sections: { heading: string; body: string; diagramSvg?: string; imageUrl?: string }[],
  preparedWindow?: Window,
): Promise<boolean> {
  const body = sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2><div>${renderMathInBody(section.body)}</div>${section.imageUrl ? `<div class="diagram"><img src="${escapeHtml(section.imageUrl)}" alt="${escapeHtml(section.heading)}" /></div>` : ""}${section.diagramSvg ? `<div class="diagram">${section.diagramSvg}</div>` : ""}</section>`,
    )
    .join("");
  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
    @page{margin:22mm 18mm}body{font-family:Arial,sans-serif;color:#171a32;padding:0;margin:0;line-height:1.6;font-size:11pt}
    @media screen{body{box-sizing:border-box;width:794px;padding:72px 68px;background:#fff}}
    h1{color:#12152a;border-bottom:3px solid #8a72ff;padding-bottom:12px;font-size:24pt}h2{color:#6d58dc;margin-top:26px;font-size:15pt}
    section{page-break-inside:avoid;margin-bottom:18px}.math-inline,.math-display{color:#4737a1;font-family:Georgia,serif;font-style:italic}
    .math-display{margin:12px 0;text-align:center}.math-source{display:none}.math-fallback{display:inline}.math-display .math-fallback{display:block;font-size:16pt;padding:5px}
    .diagram{max-width:420px;margin:14px auto;page-break-inside:avoid}.diagram svg,.diagram img{width:100%;height:auto}.diagram img{display:block;object-fit:contain}footer{margin-top:34px;color:#707087;font-size:9pt;border-top:1px solid #dedbea;padding-top:10px}
  </style></head><body><h1>${escapeHtml(title)}</h1>${body}<footer><p>Creat cu Elunariq · învață prin următorul pas</p></footer></body></html>`;

  if (Platform.OS === "web") {
    const printWindow = preparedWindow ?? window.open("", "_blank");
    if (!printWindow) throw new Error("Browserul a blocat fereastra pentru PDF. Permite ferestrele pop-up și încearcă din nou.");

    await new Promise<void>((resolve, reject) => {
      try {
        printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
          try {
            printWindow.focus();
            printWindow.print();
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 100);
      } catch (error) {
        reject(error);
      }
    });
    return true;
  }

  const result = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Partajarea PDF nu este disponibilă pe acest dispozitiv.");
  await Sharing.shareAsync(result.uri, {
    mimeType: "application/pdf",
    dialogTitle: "Partajează fișa Elunariq",
  });
  return true;
}
