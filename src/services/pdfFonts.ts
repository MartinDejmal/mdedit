// Local, licensed fonts keep exports offline and preserve diacritics and code spacing.
import serifRegular from "../assets/pdf-fonts/LiberationSerif-Regular.ttf?url";
import serifBold from "../assets/pdf-fonts/LiberationSerif-Bold.ttf?url";
import serifItalic from "../assets/pdf-fonts/LiberationSerif-Italic.ttf?url";
import serifBoldItalic from "../assets/pdf-fonts/LiberationSerif-BoldItalic.ttf?url";
import monoRegular from "../assets/pdf-fonts/LiberationMono-Regular.ttf?url";
import monoBold from "../assets/pdf-fonts/LiberationMono-Bold.ttf?url";
import monoItalic from "../assets/pdf-fonts/LiberationMono-Italic.ttf?url";
import monoBoldItalic from "../assets/pdf-fonts/LiberationMono-BoldItalic.ttf?url";

export const PDF_FONTS = {
  Serif: { normal: "Serif-Regular.ttf", bold: "Serif-Bold.ttf", italics: "Serif-Italic.ttf", bolditalics: "Serif-BoldItalic.ttf" },
  Mono: { normal: "Mono-Regular.ttf", bold: "Mono-Bold.ttf", italics: "Mono-Italic.ttf", bolditalics: "Mono-BoldItalic.ttf" },
};

const fontAssets = {
  "Serif-Regular.ttf": serifRegular, "Serif-Bold.ttf": serifBold,
  "Serif-Italic.ttf": serifItalic, "Serif-BoldItalic.ttf": serifBoldItalic,
  "Mono-Regular.ttf": monoRegular, "Mono-Bold.ttf": monoBold,
  "Mono-Italic.ttf": monoItalic, "Mono-BoldItalic.ttf": monoBoldItalic,
};
let fontsPromise: Promise<Record<string, string>> | undefined;
export function loadPdfFonts(): Promise<Record<string, string>> {
  return fontsPromise ??= Promise.all(Object.entries(fontAssets).map(async ([name, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load PDF font: ${name}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let start = 0; start < bytes.length; start += 8192) {
      binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
    }
    return [name, btoa(binary)] as const;
  })).then(Object.fromEntries).catch((error) => {
    fontsPromise = undefined;
    throw error;
  });
}
