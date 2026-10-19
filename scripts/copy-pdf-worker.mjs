// Copies the PDF.js worker that react-pdf depends on into /public so the browser can load it
// from the same origin. Runs after every install so the worker always matches the library.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const reactPdfDir = path.dirname(require.resolve("react-pdf/package.json"));
const requireFromReactPdf = createRequire(path.join(reactPdfDir, "package.json"));
const pdfjsDir = path.dirname(requireFromReactPdf.resolve("pdfjs-dist/package.json"));
const source = path.join(pdfjsDir, "build", "pdf.worker.min.mjs");
const target = path.join(process.cwd(), "public", "pdf.worker.min.mjs");

mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`Copied PDF.js worker to ${path.relative(process.cwd(), target)}`);
