import { validateDimensions } from "../image/validation";
import { fitAlphaColor } from "./trace-alpha";

type Raster = { width: number; height: number; data: Uint8ClampedArray };
type Point = { x: number; y: number; alpha: number };
export type AlphaGradientError = {
  alphaMAE: number;
  maxAlphaError: number;
  compositeRMSE: number;
  maxCompositeError: number;
};
type FitBase = {
  color: [number, number, number];
  maxAlpha: number;
  error: AlphaGradientError;
};
export type AlphaGradientFit = FitBase & (
  | { kind: "linear"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "radial"; transform: [number, number, number, number, number, number] }
);
type Candidate = {
  geometry: Omit<Extract<AlphaGradientFit, { kind: "linear" }>, keyof FitBase> | Omit<Extract<AlphaGradientFit, { kind: "radial" }>, keyof FitBase>;
  maxAlpha: number;
  predict: (x: number, y: number) => number;
};
const clamp = (x: number, high = 1) => Math.max(0, Math.min(high, x));

// Small least-squares systems only (3 or 6 columns), using partial pivoting.
function leastSquares(points: Point[], basis: (p: Point) => number[], target: (p: Point) => number): number[] | undefined {
  const size = basis(points[0]).length;
  const matrix = Array.from({ length: size }, () => new Float64Array(size + 1));
  for (const point of points) {
    const row = basis(point), value = target(point);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) matrix[i][j] += row[i] * row[j];
      matrix[i][size] += row[i] * value;
    }
  }
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++) if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    if (Math.abs(matrix[pivot][col]) < 1e-10) return undefined;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const divisor = matrix[col][col];
    for (let j = col; j <= size; j++) matrix[col][j] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let j = col; j <= size; j++) matrix[row][j] -= factor * matrix[col][j];
    }
  }
  return matrix.map(row => row[size]);
}

function validateFit(image: Raster, color: [number, number, number], candidate: Candidate): AlphaGradientError | undefined {
  let alphaError = 0, maximumAlpha = 0, squared = 0, maximumComposite = 0;
  const { width, height, data } = image;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const sourceAlpha = data[offset + 3] / 255, alpha = candidate.predict(x + 0.5, y + 0.5);
    const delta = Math.abs(sourceAlpha - alpha);
    if (!Number.isFinite(alpha) || delta > 1.5 / 255) return undefined;
    alphaError += delta; maximumAlpha = Math.max(maximumAlpha, delta);
    for (let c = 0; c < 3; c++) {
      const black = data[offset + c] * sourceAlpha - color[c] * alpha;
      const white = black + 255 * (alpha - sourceAlpha);
      const error = Math.max(Math.abs(black), Math.abs(white));
      if (error > 2) return undefined;
      maximumComposite = Math.max(maximumComposite, error);
      squared += black * black + white * white;
    }
  }
  const alphaMAE = alphaError / (width * height), compositeRMSE = Math.sqrt(squared / (width * height * 6));
  if (alphaMAE > 0.75 / 255 || compositeRMSE > 0.8) return undefined;
  return { alphaMAE, maxAlphaError: maximumAlpha, compositeRMSE, maxCompositeError: maximumComposite };
}

/** Optional analytic fit, accepted only after checking every original pixel.
 * Radial IR maps the unit circle centered at (0,0) through SVG's affine matrix;
 * alpha goes from maxAlpha at radius 0 to zero at radius 1. Linear IR goes from
 * zero opacity at (x1,y1) to maxAlpha at (x2,y2). The caller owns serialization.
 */
export function fitAlphaGradient(image: Raster): AlphaGradientFit | undefined {
  const { width, height, data } = image;
  validateDimensions(width, height);
  if (data.length !== width * height * 4) throw new Error("Buffer ảnh không hợp lệ.");
  if (width < 3 || height < 3) return undefined;
  const hue = fitAlphaColor(image);
  if (!hue) return undefined;
  let eligible = 0, maxAlphaByte = 0;
  for (let i = 3; i < data.length; i += 4) {
    maxAlphaByte = Math.max(maxAlphaByte, data[i]);
    if (data[i] > 3 && data[i] < 252) eligible++;
  }
  if (eligible < 32) return undefined;
  const stride = Math.max(1, Math.ceil(eligible / 2048)), scale = Math.max(width, height);
  const points: Point[] = [];
  let seen = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (alpha <= 3 || alpha >= 252) continue;
    if (seen++ % stride) continue;
    points.push({ x: (x + 0.5 - width / 2) / scale, y: (y + 0.5 - height / 2) / scale, alpha: alpha / 255 });
  }
  const candidates: Candidate[] = [];
  // Excluding the observed top level permits a clipped linear ramp whose
  // opaque stop itself has fractional alpha. Full-image validation decides.
  const linearPoints = points.filter(p => p.alpha < (maxAlphaByte - 0.5) / 255);
  if (linearPoints.length >= 16) {
    const plane = leastSquares(linearPoints, p => [p.x, p.y, 1], p => p.alpha);
    if (plane) {
      const [nx, ny, intercept] = plane, norm = nx * nx + ny * ny;
      if (norm > 1e-8) {
        for (const amplitude of [1, maxAlphaByte / 255]) {
          const x1 = width / 2 - scale * intercept * nx / norm;
          const y1 = height / 2 - scale * intercept * ny / norm;
          const x2 = x1 + scale * amplitude * nx / norm, y2 = y1 + scale * amplitude * ny / norm;
          if ([x1, y1, x2, y2].some(v => !Number.isFinite(v) || Math.abs(v) > scale * 32)) continue;
          candidates.push({
            geometry: { kind: "linear", x1, y1, x2, y2 }, maxAlpha: amplitude,
            predict: (x, y) => clamp(nx * (x - width / 2) / scale + ny * (y - height / 2) / scale + intercept, amplitude),
          });
        }
      }
    }
  }
  for (const candidate of candidates) {
    const error = validateFit(image, hue.color, candidate);
    if (error) return { ...candidate.geometry, color: hue.color, maxAlpha: candidate.maxAlpha, error };
  }

  // For a cone alpha=A(1-r), r²=(1-alpha/A)² is quadratic in x,y.
  // Its least-squares coefficients are linear combinations of fits to alpha
  // and alpha², allowing a bounded one-dimensional search for unknown peak A.
  const basis = (p: Point) => [p.x * p.x, 2 * p.x * p.y, p.y * p.y, p.x, p.y, 1];
  const first = leastSquares(points, basis, p => p.alpha);
  const second = leastSquares(points, basis, p => p.alpha ** 2);
  if (!first || !second) return undefined;
  function radial(amplitude: number): Candidate | undefined {
    const coeff = first!.map((v, i) => (i === 5 ? 1 : 0) - 2 * v / amplitude + second![i] / amplitude ** 2);
    const [a, b, c, d, e] = coeff, determinant = a * c - b * b;
    if (a <= 1e-8 || c <= 1e-8 || determinant <= 1e-10) return undefined;
    const cx = -(c * d - b * e) / (2 * determinant), cy = -(a * e - b * d) / (2 * determinant);
    // Invert the transpose of Q's Cholesky factor to map a unit circle to
    // this ellipse. This also represents rotated and off-center ellipses.
    const l11 = Math.sqrt(a), l21 = b / l11, l22 = Math.sqrt(c - l21 * l21);
    const transform: [number, number, number, number, number, number] = [
      scale / l11, 0, -scale * l21 / (l11 * l22), scale / l22,
      cx * scale + width / 2, cy * scale + height / 2,
    ];
    if (transform.some(v => !Number.isFinite(v) || Math.abs(v) > scale * 32)) return undefined;
    return {
      geometry: { kind: "radial", transform }, maxAlpha: amplitude,
      predict: (x, y) => {
        const dx = (x - width / 2) / scale - cx, dy = (y - height / 2) / scale - cy;
        return amplitude * clamp(1 - Math.sqrt(Math.max(0, a * dx * dx + 2 * b * dx * dy + c * dy * dy)));
      },
    };
  }
  const low = Math.max(4 / 255, (maxAlphaByte - 0.5) / 255), high = 1;
  let best: Candidate | undefined, bestAmplitude = low, bestError = Infinity;
  function consider(amplitude: number): void {
    const candidate = radial(amplitude);
    if (!candidate) return;
    let error = 0;
    for (const p of points) {
      const delta = candidate.predict(p.x * scale + width / 2, p.y * scale + height / 2) - p.alpha;
      error += delta * delta;
    }
    if (error < bestError) { bestError = error; best = candidate; bestAmplitude = amplitude; }
  }
  const coarseStep = (high - low) / 64;
  for (let step = 0; step <= 64; step++) consider(low + coarseStep * step);
  // Three local refinements remain bounded and deterministic; global coarse
  // candidates prevent an arbitrary optimizer initialization from deciding.
  let window = coarseStep;
  for (let iteration = 0; iteration < 3; iteration++) {
    const center = bestAmplitude;
    for (let step = -8; step <= 8; step++) consider(clamp(center + window * step / 8, high));
    window /= 8;
  }
  if (!best) return undefined;
  const error = validateFit(image, hue.color, best);
  return error ? { ...best.geometry, color: hue.color, maxAlpha: best.maxAlpha, error } : undefined;
}
