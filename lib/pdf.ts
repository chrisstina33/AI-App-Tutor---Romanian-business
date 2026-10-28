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
  sections: { heading: string; body: string }[],
): Promise<boolean> {
  const body = sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2><div>${renderMathInBody(section.body)}</div></section>`,
    )
    .join("");
  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page{margin:22mm 18mm}body{font-family:Arial,sans-serif;color:#171a32;padding:0;line-height:1.6;font-size:11pt}
    h1{color:#12152a;border-bottom:3px solid #8a72ff;padding-bottom:12px;font-size:24pt}h2{color:#6d58dc;margin-top:26px;font-size:15pt}
    section{page-break-inside:avoid;margin-bottom:18px}.math-inline,.math-display{color:#4737a1;font-family:Georgia,serif;font-style:italic}
    .math-display{margin:12px 0;text-align:center}.math-source{display:none}.math-fallback{display:inline}.math-display .math-fallback{display:block;font-size:16pt;padding:5px}
    .math-ready .math-source{display:inline}.math-ready .math-fallback{display:none}.math-ready .math-display .math-source{display:block}
    .math-ready mjx-container{font-size:112%!important;color:#4737a1}footer{margin-top:34px;color:#707087;font-size:9pt;border-top:1px solid #dedbea;padding-top:10px}
  </style><script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]],displayMath:[["\\\\[","\\\\]"]]},options:{enableMenu:false}};</script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-chtml.js"></script><script>
    window.addEventListener("load",function(){if(window.MathJax&&window.MathJax.typesetPromise){window.MathJax.typesetPromise().then(function(){document.documentElement.classList.add("math-ready")}).catch(function(){})}});
  </script></head><body><h1>${escapeHtml(title)}</h1>${body}<footer><p>Creat cu Elunariq · învață prin următorul pas</p></footer></body></html>`;

  if (Platform.OS === "web") {
    const printWindow = window.open("", "_blank");
    if (!printWindow)
      throw new Error("Browserul a blocat fereastra pentru exportul PDF.");
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    await new Promise<void>((resolve) => {
      let finished = false;
      const printAfterMath = () => {
        if (finished) return;
        finished = true;
        printWindow.focus();
        printWindow.print();
        resolve();
      };
      const fallbackTimer = window.setTimeout(printAfterMath, 1800);
      printWindow.addEventListener(
        "load",
        () => {
          const mathWindow = printWindow as Window & {
            MathJax?: { typesetPromise?: () => Promise<void> };
          };
          if (mathWindow.MathJax?.typesetPromise) {
            mathWindow.MathJax.typesetPromise()
              .then(() => {
                printWindow.document.documentElement.classList.add(
                  "math-ready",
                );
                window.clearTimeout(fallbackTimer);
                window.setTimeout(printAfterMath, 100);
              })
              .catch(printAfterMath);
          } else {
            window.clearTimeout(fallbackTimer);
            printAfterMath();
          }
        },
        { once: true },
      );
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
