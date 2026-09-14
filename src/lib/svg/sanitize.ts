import DOMPurify from "dompurify";
import { LIMITS, validateDimensions } from "../image/validation";

const NS = "http://www.w3.org/2000/svg";
const GRADIENT_ID = "alpha-gradient";
const GRADIENT_PAINT = `url(#${GRADIENT_ID})`;
const pathAttributes = new Set(["d", "fill", "fill-rule", "opacity", "stroke", "stroke-width"]);
const rootAttributes = new Set(["xmlns", "width", "height", "viewBox", "version"]);
const linearAttributes = new Set(["id", "gradientUnits", "x1", "y1", "x2", "y2"]);
const radialAttributes = new Set(["id", "gradientUnits", "cx", "cy", "r", "gradientTransform"]);
const stopAttributes = new Set(["offset", "stop-color", "stop-opacity"]);
const emptyAttributes = new Set<string>();
const numericPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const tags = ["svg", "path", "defs", "linearGradient", "radialGradient", "stop"];

function numberAttribute(element: Element, name: string, minimum: number, maximum: number): number {
  const text = element.getAttribute(name);
  const value = Number(text);
  if (text === null || !numericPattern.test(text) || !Number.isFinite(value) || value < minimum || value > maximum)
    throw new Error("Tọa độ hoặc opacity gradient SVG không hợp lệ.");
  return value;
}

function validateGradient(gradient: Element, width: number, height: number): void {
  if (gradient.getAttribute("id") !== GRADIENT_ID || gradient.getAttribute("gradientUnits") !== "userSpaceOnUse")
    throw new Error("Định danh hoặc hệ tọa độ gradient SVG không hợp lệ.");
  const bound = Math.max(width, height) * 32;
  if (gradient.localName === "linearGradient") {
    const x1 = numberAttribute(gradient, "x1", -bound, bound), y1 = numberAttribute(gradient, "y1", -bound, bound);
    const x2 = numberAttribute(gradient, "x2", -bound, bound), y2 = numberAttribute(gradient, "y2", -bound, bound);
    if (x1 === x2 && y1 === y2) throw new Error("Gradient tuyến tính SVG bị suy biến.");
  } else {
    if (gradient.getAttribute("cx") !== "0" || gradient.getAttribute("cy") !== "0" || gradient.getAttribute("r") !== "1")
      throw new Error("Gradient hướng tâm SVG không hợp lệ.");
    const matrix = gradient.getAttribute("gradientTransform")?.match(/^matrix\(\s*([^()]*)\s*\)$/)?.[1].trim().split(/\s+/);
    if (!matrix || matrix.length !== 6 || matrix.some(n => !numericPattern.test(n) || !Number.isFinite(Number(n)) || Math.abs(Number(n)) > bound))
      throw new Error("Biến đổi gradient SVG không hợp lệ.");
    const [a, b, c, d] = matrix.map(Number);
    if (Math.abs(a * d - b * c) < 1e-12) throw new Error("Biến đổi gradient SVG bị suy biến.");
  }
  const stops = [...gradient.children];
  if (stops.length !== 2 || stops.some((stop, i) => stop.localName !== "stop" || stop.getAttribute("offset") !== String(i)))
    throw new Error("Gradient SVG phải có đúng hai điểm màu.");
  for (const stop of stops) {
    const color = stop.getAttribute("stop-color")?.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
    if (!color || color.slice(1).some(c => Number(c) > 255)) throw new Error("Màu gradient SVG không hợp lệ.");
    numberAttribute(stop, "stop-opacity", 0, 1);
  }
}

function validateDocument(document: Document, width: number, height: number): Element {
  const root = document.documentElement;
  if (document.querySelector("parsererror") || root.localName !== "svg" || document.doctype)
    throw new Error("Engine tạo SVG không hợp lệ.");
  const definitions = [...document.querySelectorAll("defs")];
  const gradients = [...document.querySelectorAll("linearGradient, radialGradient")];
  if (definitions.length > 1 || gradients.length > 1 || definitions.length !== gradients.length)
    throw new Error("SVG chứa định nghĩa gradient không được hỗ trợ.");
  if (definitions.length && (definitions[0].parentNode !== root || definitions[0].children.length !== 1 || gradients[0].parentNode !== definitions[0]))
    throw new Error("Cấu trúc gradient SVG không hợp lệ.");

  // Fail closed on unexpected elements and attributes, including content that
  // DOMPurify would silently remove. Only one owned local paint reference is
  // supported; this does not enable arbitrary URL-bearing SVG attributes.
  for (const element of document.querySelectorAll("*")) {
    const tag = element.localName;
    const validParent = element === root ? tag === "svg"
      : tag === "path" || tag === "defs" ? element.parentNode === root
      : tag === "linearGradient" || tag === "radialGradient" ? element.parentNode === definitions[0]
      : tag === "stop" ? element.parentNode === gradients[0] : false;
    if (element.namespaceURI !== NS || !tags.includes(tag) || !validParent || ((tag === "path" || tag === "stop") && element.children.length))
      throw new Error("SVG chứa thành phần không được hỗ trợ.");
    for (const child of element.childNodes) {
      if ((child.nodeType === 3 && child.textContent?.trim()) || (child.nodeType !== 1 && child.nodeType !== 3 && child.nodeType !== 8))
        throw new Error("SVG chứa nội dung không được hỗ trợ.");
    }
    const allowed = tag === "svg" ? rootAttributes : tag === "path" ? pathAttributes
      : tag === "linearGradient" ? linearAttributes : tag === "radialGradient" ? radialAttributes
        : tag === "stop" ? stopAttributes : emptyAttributes;
    for (const attr of element.attributes) {
      const ownedPaint = tag === "path" && attr.name === "fill" && attr.value === GRADIENT_PAINT && gradients.length === 1;
      if (!allowed.has(attr.name) || (!ownedPaint && /url\s*\(|javascript:|data:/i.test(attr.value)))
        throw new Error("SVG chứa thuộc tính không an toàn.");
      if (attr.name === "d" && !/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]*$/.test(attr.value))
        throw new Error("Dữ liệu đường SVG không hợp lệ.");
      if (attr.name === "d" && (attr.value.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g) ?? []).some(n => !Number.isFinite(Number(n))))
        throw new Error("Tọa độ SVG không hợp lệ.");
    }
  }
  if (gradients.length) validateGradient(gradients[0], width, height);
  if (root.getAttribute("viewBox") !== `0 0 ${width} ${height}`)
    throw new Error("Hệ tọa độ SVG không khớp kích thước ảnh.");
  const paths = document.querySelectorAll("path");
  if (paths.length > LIMITS.paths) throw new Error("SVG chứa quá nhiều đường.");
  let segments = 0;
  for (const path of paths) {
    segments += (path.getAttribute("d")?.match(/[MmLlHhVvCcSsQqTtAaZz]/g) ?? []).length;
    for (const name of ["opacity", "stroke-width"]) {
      const value = path.getAttribute(name);
      if (value !== null && (!Number.isFinite(Number(value)) || Number(value) < 0 || (name === "opacity" && Number(value) > 1)))
        throw new Error("Opacity hoặc nét SVG không hợp lệ.");
    }
    for (const name of ["fill", "stroke"]) {
      const paint = path.getAttribute(name);
      if (name === "fill" && paint === GRADIENT_PAINT && gradients.length === 1) continue;
      if (paint !== null && !/^(none|#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i.test(paint))
        throw new Error("Màu SVG không hợp lệ.");
    }
  }
  if (segments > LIMITS.segments) throw new Error("SVG chứa quá nhiều điểm điều khiển.");
  return root;
}

function structure(element: Element): string {
  return JSON.stringify({
    tag: element.localName,
    attributes: [...element.attributes].map(a => [a.name, a.value]).sort((a, b) => a[0].localeCompare(b[0])),
    children: [...element.children].map(child => structure(child)),
  });
}

export function sanitizeSvg(svg: string, width: number, height: number): string {
  validateDimensions(width, height);
  if (new TextEncoder().encode(svg).length > LIMITS.svgBytes) throw new Error("SVG vượt giới hạn dung lượng.");
  const original = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = validateDocument(original, width, height);
  root.setAttribute("width", String(width)); root.setAttribute("height", String(height));
  const expected = structure(root);
  const clean = DOMPurify.sanitize(new XMLSerializer().serializeToString(root), {
    ALLOWED_TAGS: [...tags],
    ALLOWED_ATTR: [...rootAttributes, ...pathAttributes, ...linearAttributes, ...radialAttributes, ...stopAttributes],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  });
  const final = new DOMParser().parseFromString(clean, "image/svg+xml");
  const checked = validateDocument(final, width, height);
  if (structure(checked) !== expected) throw new Error("SVG không vượt qua kiểm tra cuối.");
  return clean;
}
