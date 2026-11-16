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
  const expression = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = expression.exec(value))) {
    output += escapeHtml(value.slice(cursor, match.index)).replace(
      /\n/g,
      "<br />",
    );
    const display = match[2] !== undefined;
    const formula = match[1] ?? match[2] ?? "";
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
  sections: { heading: string; body: string; diagramSvg?: string }[],
): Promise<boolean> {
  const body = sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2><div>${renderMathInBody(section.body)}</div>${section.diagramSvg ? `<div class="diagram">${section.diagramSvg}</div>` : ""}</section>`,
    )
    .join("");
  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page{margin:22mm 18mm}body{font-family:Arial,sans-serif;color:#171a32;padding:0;margin:0;line-height:1.6;font-size:11pt}
    @media screen{body{box-sizing:border-box;width:794px;padding:72px 68px;background:#fff}}
    h1{color:#12152a;border-bottom:3px solid #8a72ff;padding-bottom:12px;font-size:24pt}h2{color:#6d58dc;margin-top:26px;font-size:15pt}
    section{page-break-inside:avoid;margin-bottom:18px}.math-inline,.math-display{color:#4737a1;font-family:Georgia,serif;font-style:italic}
    .math-display{margin:12px 0;text-align:center}.math-source{display:none}.math-fallback{display:inline}.math-display .math-fallback{display:block;font-size:16pt;padding:5px}
    .math-ready .math-source{display:inline}.math-ready .math-fallback{display:none}.math-ready .math-display .math-source{display:block}
    .math-ready mjx-container{font-size:112%!important;color:#4737a1}.diagram{max-width:420px;margin:14px auto;page-break-inside:avoid}.diagram svg{width:100%;height:auto}footer{margin-top:34px;color:#707087;font-size:9pt;border-top:1px solid #dedbea;padding-top:10px}
  </style><script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]],displayMath:[["\\\\[","\\\\]"]]},options:{enableMenu:false}};</script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-chtml.js"></script><script>
    window.addEventListener("load",function(){if(window.MathJax&&window.MathJax.typesetPromise){window.MathJax.typesetPromise().then(function(){document.documentElement.classList.add("math-ready")}).catch(function(){})}});
  </script></head><body><h1>${escapeHtml(title)}</h1>${body}<footer><p>Creat cu Elunariq · învață prin următorul pas</p></footer></body></html>`;

  if (Platform.OS === "web") {
    const frame = document.createElement("iframe");
    frame.title = "Previzualizare fișă PDF";
    frame.style.position = "fixed";
    frame.style.left = "-10000px";
    frame.style.top = "0";
    frame.style.width = "794px";
    frame.style.height = "1px";
    frame.style.border = "0";
    document.body.appendChild(frame);
    try {
      await new Promise<void>((resolve, reject) => {
        frame.onload = () => resolve();
        frame.onerror = () => reject(new Error("Fișa nu a putut fi pregătită pentru descărcare."));
        frame.srcdoc = html;
      });
      const frameWindow = frame.contentWindow as (Window & { MathJax?: { typesetPromise?: () => Promise<void> } }) | null;
      const frameDocument = frame.contentDocument;
      if (!frameWindow || !frameDocument?.body) throw new Error("Fișa PDF nu a putut fi randată.");
      await frameWindow.MathJax?.typesetPromise?.().catch(() => undefined);
      await frameDocument.fonts?.ready;
      frame.style.height = `${Math.max(400, frameDocument.body.scrollHeight + 32)}px`;
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf/dist/jspdf.es.min.js");
      const canvas = await html2canvas(frameDocument.body, {
        backgroundColor: "#FFFFFF",
        scale: 2,
        useCORS: true,
        windowWidth: 794,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pageSliceHeight = Math.floor((canvas.width * pageHeight) / pageWidth);
      let sourceY = 0;
      let page = 0;
      while (sourceY < canvas.height) {
        const sliceHeight = Math.min(pageSliceHeight, canvas.height - sourceY);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const context = pageCanvas.getContext("2d");
        if (!context) throw new Error("Browserul nu a putut crea fișa PDF.");
        context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        if (page > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, (sliceHeight / canvas.width) * pageWidth);
        sourceY += sliceHeight;
        page += 1;
      }
      const safeName = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fisa-elunariq";
      pdf.save(`${safeName}.pdf`);
      return true;
    } finally {
      frame.remove();
    }
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
