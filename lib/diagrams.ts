export type DiagramKind = "parabola" | "triangle" | "forces" | "molecule";

export function getLessonDiagram(subject: string, prompt: string): { kind: DiagramKind; caption: string } | null {
  const text = `${subject} ${prompt}`.toLowerCase();
  if (subject === "Matematică") {
    if (/triunghi|geometr|unghi|ipotenuz|catet|cerc|arie/.test(text)) return { kind: "triangle", caption: "Schiță geometrică orientativă" };
    if (/funcți|parabol|grafic|vârf|ecuați|rădăcin/.test(text)) return { kind: "parabola", caption: "Schiță de grafic orientativă" };
  }
  if (subject === "Fizică" && /forț|energie|mișcar|accelera|corp|frec|greutat/.test(text)) return { kind: "forces", caption: "Schiță de forțe orientativă" };
  if (subject === "Chimie" && /legătur|molecul|atom|reacț|electron|ionic|covalent/.test(text)) return { kind: "molecule", caption: "Schiță moleculară orientativă" };
  return null;
}

const STROKE = "#5549A8";
const PAPER = "#F8F6FF";

export function diagramSvg(kind: DiagramKind): string {
  const common = `xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 190" role="img"`;
  if (kind === "parabola") return `<svg ${common}><rect x="1" y="1" width="318" height="188" rx="18" fill="${PAPER}"/><path d="M45 155 Q52 149 287 150 M164 25 Q159 90 163 166" fill="none" stroke="${STROKE}" stroke-width="2.4" stroke-linecap="round"/><path d="M76 42 Q115 119 162 126 Q211 120 249 41 M79 46 Q120 119 164 123 Q207 119 246 44" fill="none" stroke="#8176CE" stroke-width="3" stroke-linecap="round"/><circle cx="163" cy="125" r="4" fill="#D98558"/><text x="174" y="122" font-size="13" fill="#302A5D">V</text><text x="279" y="144" font-size="12" fill="#5549A8">x</text><text x="169" y="30" font-size="12" fill="#5549A8">y</text></svg>`;
  if (kind === "triangle") return `<svg ${common}><rect x="1" y="1" width="318" height="188" rx="18" fill="${PAPER}"/><path d="M61 151 Q60 149 152 35 Q155 32 253 151 Q254 154 61 151 M64 148 Q155 150 250 149 M151 39 Q158 98 248 150" fill="none" stroke="${STROKE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M229 148 L229 133 L245 133" fill="none" stroke="#D98558" stroke-width="2"/><text x="52" y="168" font-size="13" fill="#302A5D">A</text><text x="146" y="28" font-size="13" fill="#302A5D">B</text><text x="256" y="168" font-size="13" fill="#302A5D">C</text></svg>`;
  if (kind === "forces") return `<svg ${common}><rect x="1" y="1" width="318" height="188" rx="18" fill="${PAPER}"/><path d="M68 143 Q159 140 254 143 M101 125 L218 125 L218 89 L101 89 Z M104 128 L221 128 L221 91" fill="none" stroke="${STROKE}" stroke-width="2.6" stroke-linejoin="round"/><path d="M159 88 Q157 60 158 31 M154 37 L158 29 L163 38 M100 106 Q73 105 47 105 M54 100 L45 105 L54 110 M218 106 Q247 105 274 105 M266 100 L276 105 L266 110" fill="none" stroke="#D98558" stroke-width="3" stroke-linecap="round"/><text x="166" y="42" font-size="13" fill="#302A5D">N</text><text x="24" y="99" font-size="12" fill="#302A5D">F</text><text x="280" y="99" font-size="12" fill="#302A5D">F</text><text x="147" y="117" font-size="13" fill="#5549A8">corp</text></svg>`;
  return `<svg ${common}><rect x="1" y="1" width="318" height="188" rx="18" fill="${PAPER}"/><path d="M71 95 L123 63 L177 95 L231 63 M71 95 L123 127 L177 95 L231 127" fill="none" stroke="#8176CE" stroke-width="3" stroke-linecap="round"/><circle cx="70" cy="95" r="22" fill="#FFFFFF" stroke="${STROKE}" stroke-width="2.5"/><circle cx="123" cy="63" r="22" fill="#FFFFFF" stroke="#D98558" stroke-width="2.5"/><circle cx="177" cy="95" r="22" fill="#FFFFFF" stroke="${STROKE}" stroke-width="2.5"/><circle cx="231" cy="63" r="22" fill="#FFFFFF" stroke="#D98558" stroke-width="2.5"/><text x="62" y="100" font-size="13" fill="#302A5D">A</text><text x="115" y="68" font-size="13" fill="#302A5D">B</text><text x="169" y="100" font-size="13" fill="#302A5D">A</text><text x="223" y="68" font-size="13" fill="#302A5D">B</text><text x="94" y="158" font-size="13" fill="#5549A8">model de legătură</text></svg>`;
}
