// Website photos from Tony's raw camera shots (used by Prep-Photos.ps1).
// NO post-processing, ever: no brightening, sharpening or colour changes. Only turning (exact 90/180 degrees),
// cropping, resizing to the 1044 canvas, the black mask and the logos.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using System.Runtime.InteropServices;

public class CoinFit { public double Cx, Cy, R; public double ClipPct, MeanLum; public string Note; }

public class SlabBox { public int Left, Top, Right, Bottom; public double TiltDeg; }

// One shot made ready: where the upright, cropped photo is and where the coin sits in it.
public class PrepResult { public string Path; public CoinFit Fit; public int Turn; public bool Cropped; public double TiltDeg; }

public static class CoinPhoto
{
    // ---------- step 0: turn the raw frame upright and crop to the slab ----------

    // turn: -1 = decide from where the coin is, 0 = as found, 1 = 180 degrees from that.
    // A raw frame (landscape, straight from the camera) is first turned 90 degrees so the slab stands up, then
    // cropped to the slab plus `margin` px. Tony's own hand-cropped shots (portrait) are not cropped again.
    // coinLow: true when the coin belongs in the lower half of the slab (obverse; medal-turn reverse).
    // dst is written only when something changed (cropped or turned); otherwise Path is the original.
    public static PrepResult Prepare(string src, string dst, int margin, double expectedDia, bool coinLow, int turn)
    {
        using (var raw = new Bitmap(src))
        {
            bool isRaw = raw.Width > raw.Height;
            Bitmap b = raw; bool own = false;
            var res = new PrepResult { Turn = turn };
            try
            {
                if (isRaw)
                {
                    raw.RotateFlip(RotateFlipType.Rotate270FlipNone);
                    var box = FindSlab(raw);
                    int x0 = Math.Max(0, box.Left - margin), y0 = Math.Max(0, box.Top - margin);
                    int x1 = Math.Min(raw.Width, box.Right + 1 + margin), y1 = Math.Min(raw.Height, box.Bottom + 1 + margin);
                    b = raw.Clone(new Rectangle(x0, y0, x1 - x0, y1 - y0), PixelFormat.Format24bppRgb); own = true;
                    res.Cropped = true; res.TiltDeg = box.TiltDeg;
                }
                var fit = FindCircle(b, expectedDia);
                if (turn < 0) turn = (isRaw && expectedDia > 0 && (fit.Cy > b.Height / 2.0) != coinLow) ? 1 : 0;
                if (turn == 1)
                {
                    b.RotateFlip(RotateFlipType.Rotate180FlipNone);
                    fit.Cx = b.Width - 1 - fit.Cx; fit.Cy = b.Height - 1 - fit.Cy;
                }
                res.Turn = turn; res.Fit = fit;
                if (res.Cropped || turn == 1) { SaveJpeg(b, dst, 100); res.Path = dst; } else res.Path = src;
                return res;
            }
            finally { if (own) b.Dispose(); }
        }
    }

    // The slab's outer edges in an upright frame: on each scanline, the first run of pixels clearly brighter than
    // that line's own background (the cloth is lit unevenly), taken over the straight middle of each side.
    public static SlabBox FindSlab(Bitmap b)
    {
        int w = b.Width, h = b.Height; var L = LumBytes(b);
        var left = new List<double[]>(); var right = new List<double[]>(); var top = new List<double>(); var bot = new List<double>();
        for (int y = (int)(h * 0.2); y < h * 0.8; y += 4)
        {
            int yy = y;
            int l = FirstBright(i => L[yy * w + i], w / 2); if (l >= 0) left.Add(new double[] { y, l });
            int r = FirstBright(i => L[yy * w + w - 1 - i], w / 2); if (r >= 0) right.Add(new double[] { y, w - 1 - r });
        }
        for (int x = (int)(w * 0.2); x < w * 0.8; x += 4)
        {
            int xx = x;
            int t = FirstBright(i => L[i * w + xx], h / 2); if (t >= 0) top.Add(t);
            int u = FirstBright(i => L[(h - 1 - i) * w + xx], h / 2); if (u >= 0) bot.Add(h - 1 - u);
        }
        if (left.Count < 10 || right.Count < 10 || top.Count < 10 || bot.Count < 10) return new SlabBox { Left = 0, Top = 0, Right = w - 1, Bottom = h - 1 };
        // the outermost the edge reaches, ignoring the odd speck of dust
        var box = new SlabBox
        {
            Left = (int)Pct(left.Select(p => p[1]), 0.05), Right = (int)Pct(right.Select(p => p[1]), 0.95),
            Top = (int)Pct(top, 0.05), Bottom = (int)Pct(bot, 0.95)
        };
        box.TiltDeg = Math.Atan((Slope(left) + Slope(right)) / 2) * 180 / Math.PI;
        return box;
    }

    static int FirstBright(Func<int, byte> at, int n)
    {
        var bg = new List<double>(); for (int i = 0; i < 120 && i < n; i++) bg.Add(at(i));
        double thr = Median(bg) + 40; int c = 0;
        for (int i = 0; i < n; i++) { if (at(i) > thr) { if (++c == 6) return i - 5; } else c = 0; }
        return -1;
    }

    static double Pct(IEnumerable<double> v, double q) { var a = v.OrderBy(x => x).ToList(); return a[(int)Math.Min(a.Count - 1, q * a.Count)]; }

    static double Slope(List<double[]> p)
    {
        var s = new List<double>(); int n = p.Count;
        for (int i = 0; i < n / 2; i++) { var a = p[i]; var c = p[i + n / 2]; if (c[0] != a[0]) s.Add((c[1] - a[1]) / (c[0] - a[0])); }
        return s.Count == 0 ? 0 : Median(s);
    }

    // ---------- finding the coin ----------

    static byte[] LumBytes(Bitmap b)
    {
        int w = b.Width, h = b.Height;
        var data = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        int stride = data.Stride; var row = new byte[stride]; var L = new byte[w * h];
        for (int y = 0; y < h; y++)
        {
            Marshal.Copy(data.Scan0 + y * stride, row, 0, stride);
            for (int x = 0; x < w; x++) { int i = x * 3; L[y * w + x] = (byte)(0.114 * row[i] + 0.587 * row[i + 1] + 0.299 * row[i + 2]); }
        }
        b.UnlockBits(data);
        return L;
    }

    // Luminance, box-downsampled by f.
    static float[] Lum(Bitmap b, int f, out int w, out int h)
    {
        w = b.Width / f; h = b.Height / f;
        var data = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        int stride = data.Stride; var row = new byte[stride]; var sum = new float[w * h];
        for (int y = 0; y < h * f; y++)
        {
            Marshal.Copy(data.Scan0 + y * stride, row, 0, stride);
            int yy = y / f;
            for (int x = 0; x < w * f; x++) { int i = x * 3; sum[yy * w + x / f] += 0.114f * row[i] + 0.587f * row[i + 1] + 0.299f * row[i + 2]; }
        }
        b.UnlockBits(data);
        float n = f * f; for (int i = 0; i < sum.Length; i++) sum[i] /= n;
        return sum;
    }

    static float Sample(float[] img, int w, int h, double x, double y)
    {
        if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return float.NaN;
        int x0 = (int)x, y0 = (int)y; double fx = x - x0, fy = y - y0;
        double a = img[y0 * w + x0], b = img[y0 * w + x0 + 1], c = img[(y0 + 1) * w + x0], d = img[(y0 + 1) * w + x0 + 1];
        return (float)(a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy);
    }

    static double Median(List<double> v) { if (v.Count == 0) return double.NaN; v.Sort(); return v[v.Count / 2]; }

    // Median over angles of (just inside - just outside) for one circle: the coin edge is brighter-inside all the
    // way round; prongs cover a few angles (the median ignores them); labels and barcodes aren't round.
    static double RingScore(float[] img, int w, int h, double cx, double cy, double r, double d, int A, double[] buf)
    {
        int n = 0;
        for (int a = 0; a < A; a++)
        {
            double t = 2 * Math.PI * a / A, ct = Math.Cos(t), st = Math.Sin(t);
            var i1 = Sample(img, w, h, cx + (r - d) * ct, cy + (r - d) * st);
            var o1 = Sample(img, w, h, cx + (r + d) * ct, cy + (r + d) * st);
            if (float.IsNaN(i1) || float.IsNaN(o1)) continue;
            buf[n++] = i1 - o1;
        }
        if (n < A * 0.75) return -999;
        Array.Sort(buf, 0, n);
        return buf[n / 2];
    }

    public static CoinFit FindCircle(string path, double expectedDia)
    {
        using (var src = new Bitmap(path)) return FindCircle(src, expectedDia);
    }

    // The coin's best guess circle, its size known from the denomination (expectedDia, source px). Coarse search,
    // finer hill-climb (kept within 5% of the expected size), then a full-resolution edge fit. Unknown size (0):
    // a placeholder in the middle, for Tony to click.
    public static CoinFit FindCircle(Bitmap src, double expectedDia)
    {
        if (expectedDia <= 0)
        {
            var u = new CoinFit { Cx = src.Width / 2.0, Cy = src.Height / 2.0, R = src.Width * 0.3, Note = "unknown size" };
            Exposure(src, u); return u;
        }
        double E = expectedDia / 2;
        int f1 = 8, w1, h1; var L1 = Lum(src, f1, out w1, out h1);
        var buf = new double[360];
        var top = new List<double[]>();   // score, cx, cy, r (full-res px)
        for (int y = (int)(h1 * 0.20); y < h1 * 0.80; y += 2)
            for (int x = (int)(w1 * 0.35); x < w1 * 0.65; x += 2)
                for (double r = 0.95 * E / f1; r <= 1.05 * E / f1; r += 0.5)
                    top.Add(new[] { RingScore(L1, w1, h1, x, y, r, 2, 90, buf), x * f1 + f1 / 2.0, y * f1 + f1 / 2.0, r * f1 });
        top.Sort((p, q) => q[0].CompareTo(p[0]));
        var cands = new List<double[]>();
        foreach (var t in top)
        {
            if (cands.Any(c => Math.Abs(c[1] - t[1]) < 0.1 * E && Math.Abs(c[2] - t[2]) < 0.1 * E && Math.Abs(c[3] - t[3]) < 0.04 * E)) continue;
            cands.Add(t); if (cands.Count == 6) break;
        }
        int f2 = 2, w2, h2; var L2 = Lum(src, f2, out w2, out h2);
        double[] best = null;
        foreach (var c in cands)
        {
            double bx = c[1] / f2, by = c[2] / f2, br = c[3] / f2, bs = -999;
            for (double step = 4; step >= 1; step /= 2)
            {
                bool moved = true;
                while (moved)
                {
                    moved = false; double cx0 = bx, cy0 = by, cr0 = br;
                    for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++) for (int dr = -1; dr <= 1; dr++)
                    {
                        if (Math.Abs((cr0 + dr * step) * f2 / E - 1) > 0.05) continue;
                        double sc = RingScore(L2, w2, h2, cx0 + dx * step, cy0 + dy * step, cr0 + dr * step, 3, 360, buf);
                        if (sc > bs + 1e-9) { bs = sc; bx = cx0 + dx * step; by = cy0 + dy * step; br = cr0 + dr * step; moved = true; }
                    }
                }
            }
            if (best == null || bs > best[0]) best = new[] { bs, bx * f2 + f2 / 2.0, by * f2 + f2 / 2.0, br * f2 };
        }
        int W, H; var Lf = Lum(src, 1, out W, out H);
        double fx = best[1], fy = best[2], fr = best[3];
        var pts = EdgePoints(Lf, W, H, fx, fy, fr * 0.985, fr * 1.015);
        if (pts.Count >= 50)
        {
            double cx, cy, R; FitRobust(pts, out cx, out cy, out R);
            if (Math.Abs(R - fr) < 0.02 * fr && Math.Abs(cx - fx) < 0.02 * fr && Math.Abs(cy - fy) < 0.02 * fr) { fx = cx; fy = cy; fr = R; }
        }
        var fit = new CoinFit { Cx = fx, Cy = fy, R = fr, Note = "guess" };
        Exposure(src, fit);
        return fit;
    }

    // Per angle, the strongest bright->dark step between radii lo and hi.
    static List<double[]> EdgePoints(float[] Lf, int W, int H, double cx0, double cy0, double lo, double hi)
    {
        var pts = new List<double[]>(); int N = 720;
        for (int a = 0; a < N; a++)
        {
            double t = 2 * Math.PI * a / N, ct = Math.Cos(t), st = Math.Sin(t);
            double bestD = 0, bestR = -1;
            for (int r = (int)lo; r <= hi; r++)
            {
                double inn = 0, outv = 0; bool ok = true;
                for (int k = 1; k <= 4; k++)
                {
                    var i1 = Sample(Lf, W, H, cx0 + (r - k) * ct, cy0 + (r - k) * st);
                    var o1 = Sample(Lf, W, H, cx0 + (r + k) * ct, cy0 + (r + k) * st);
                    if (float.IsNaN(i1) || float.IsNaN(o1)) { ok = false; break; }
                    inn += i1; outv += o1;
                }
                if (!ok) continue;
                double d = (inn - outv) / 4;
                if (d > bestD) { bestD = d; bestR = r; }
            }
            if (bestR > 0 && bestD > 8) pts.Add(new[] { cx0 + bestR * ct, cy0 + bestR * st });
        }
        return pts;
    }

    // Circle fit that drops outliers (insert prongs, glare) over a few rounds.
    static List<double[]> FitRobust(List<double[]> pts, out double Cx, out double Cy, out double R)
    {
        var inl = pts;
        FitCircle(inl, out Cx, out Cy, out R);
        for (int it = 0; it < 5; it++)
        {
            double cx = Cx, cy = Cy, rr = R;
            var res = pts.Select(p => Math.Abs(Math.Sqrt((p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy)) - rr)).ToList();
            var mad = Median(new List<double>(res)) * 1.4826 + 0.5;
            var next = pts.Where((p, i) => res[i] < 2.5 * mad).ToList();
            if (next.Count < 10) break;
            inl = next;
            FitCircle(inl, out Cx, out Cy, out R);
        }
        return inl;
    }

    // Circle through points Tony clicked on the coin's edge (3 = exact, more = least squares). Null if in a line.
    public static CoinFit FitPoints(IList<PointF> clicks)
    {
        if (clicks.Count < 3) return null;
        var p = clicks.Select(c => new double[] { c.X, c.Y }).ToList();
        double cx, cy, r; FitCircle(p, out cx, out cy, out r);
        if (double.IsNaN(r) || double.IsInfinity(r) || r < 50) return null;
        return new CoinFit { Cx = cx, Cy = cy, R = r, Note = "clicked" };
    }

    static void FitCircle(List<double[]> p, out double cx, out double cy, out double r)
    {
        // Kasa algebraic fit: x^2+y^2 + D x + E y + F = 0
        double sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; int n = p.Count;
        foreach (var q in p) { double x = q[0], y = q[1], z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
        double[,] M = { { sxx, sxy, sx }, { sxy, syy, sy }, { sx, sy, n } };
        double[] b = { -sxz, -syz, -sz };
        var s = Solve3(M, b);
        cx = -s[0] / 2; cy = -s[1] / 2; r = Math.Sqrt(cx * cx + cy * cy - s[2]);
    }

    static double Det(double[,] a) { return a[0, 0] * (a[1, 1] * a[2, 2] - a[1, 2] * a[2, 1]) - a[0, 1] * (a[1, 0] * a[2, 2] - a[1, 2] * a[2, 0]) + a[0, 2] * (a[1, 0] * a[2, 1] - a[1, 1] * a[2, 0]); }

    static double[] Solve3(double[,] m, double[] b)
    {
        double d = Det(m); var r = new double[3];
        for (int c = 0; c < 3; c++) { var t = (double[,])m.Clone(); for (int i = 0; i < 3; i++) t[i, c] = b[i]; r[c] = Det(t) / d; }
        return r;
    }

    // Exposure inside the coin: % of pixels blown out (any channel >= 250) and mean brightness. Used to pick the shot.
    static void Exposure(Bitmap b, CoinFit fit)
    {
        var data = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        int stride = data.Stride; var row = new byte[stride]; long n = 0, clip = 0; double sum = 0;
        double r2 = fit.R * fit.R * 0.95 * 0.95;
        for (int y = (int)(fit.Cy - fit.R); y < fit.Cy + fit.R; y += 2)
        {
            if (y < 0 || y >= b.Height) continue;
            Marshal.Copy(data.Scan0 + y * stride, row, 0, stride);
            for (int x = (int)(fit.Cx - fit.R); x < fit.Cx + fit.R; x += 2)
            {
                if (x < 0 || x >= b.Width) continue;
                double dx = x - fit.Cx, dy = y - fit.Cy; if (dx * dx + dy * dy > r2) continue;
                int i = x * 3; int mx = Math.Max(row[i], Math.Max(row[i + 1], row[i + 2]));
                n++; if (mx >= 250) clip++;
                sum += 0.114 * row[i] + 0.587 * row[i + 1] + 0.299 * row[i + 2];
            }
        }
        b.UnlockBits(data);
        fit.ClipPct = 100.0 * clip / Math.Max(1, n); fit.MeanLum = sum / Math.Max(1, n);
    }

    // ---------- the website images ----------

    static void SaveJpeg(Bitmap b, string path, long q)
    {
        var enc = ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
        var p = new EncoderParameters(1); p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, q);
        // Through a stream opened with the long-path prefix: GDI+ saving straight to a path fails at 260 characters,
        // and the coin folders' long names (repeated in the file names) can get there.
        string full = System.IO.Path.GetFullPath(path);
        using (var fs = System.IO.File.Create(full.StartsWith(@"\\") ? full : @"\\?\" + full)) b.Save(fs, enc, p);
    }

    // Slab shot: the whole (cropped) photo, fit to the canvas height, centred on black.
    public static void Slab(string src, string dst, int size, long q)
    {
        using (var s = new Bitmap(src))
        using (var o = new Bitmap(size, size, PixelFormat.Format24bppRgb))
        using (var g = Graphics.FromImage(o))
        {
            g.Clear(Color.Black);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality; g.CompositingQuality = CompositingQuality.HighQuality;
            double k = Math.Min((double)size / s.Width, (double)size / s.Height);
            int dw = (int)Math.Round(s.Width * k), dh = (int)Math.Round(s.Height * k);
            using (var ia = new ImageAttributes()) { ia.SetWrapMode(WrapMode.TileFlipXY); g.DrawImage(s, new Rectangle((size - dw) / 2, (size - dh) / 2, dw, dh), 0, 0, s.Width, s.Height, GraphicsUnit.Pixel, ia); }
            SaveJpeg(o, dst, q);
        }
    }

    // Close-up: the coin centred, `gap` px between its edge and the round mask of diameter `dia` (10 px on most
    // coins so the edge shows; more on small coins so they aren't over-magnified), black outside, logos on top.
    public static void Close(string src, string dst, CoinFit fit, int size, int dia, int gap, string emblem, Rectangle emblemBox, float emblemOpacity, string cac, Rectangle cacBox, long q)
    {
        using (var s = new Bitmap(src))
        using (var o = new Bitmap(size, size, PixelFormat.Format24bppRgb))
        {
            using (var g = Graphics.FromImage(o))
            {
                g.Clear(Color.Black);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality; g.CompositingQuality = CompositingQuality.HighQuality;
                double k = (dia / 2.0 - gap) / fit.R, side = size / k;
                using (var ia = new ImageAttributes()) { ia.SetWrapMode(WrapMode.TileFlipXY); g.DrawImage(s, new Rectangle(0, 0, size, size), (float)(fit.Cx - side / 2), (float)(fit.Cy - side / 2), (float)side, (float)side, GraphicsUnit.Pixel, ia); }
            }
            // anti-aliased circular mask
            var data = o.LockBits(new Rectangle(0, 0, size, size), ImageLockMode.ReadWrite, PixelFormat.Format24bppRgb);
            int stride = data.Stride; var row = new byte[stride]; double c = size / 2.0, rr = dia / 2.0;
            for (int y = 0; y < size; y++)
            {
                Marshal.Copy(data.Scan0 + y * stride, row, 0, stride);
                for (int x = 0; x < size; x++)
                {
                    double d = Math.Sqrt((x + 0.5 - c) * (x + 0.5 - c) + (y + 0.5 - c) * (y + 0.5 - c));
                    double a = Math.Max(0, Math.Min(1, rr + 0.5 - d));
                    if (a < 1) for (int ch = 0; ch < 3; ch++) row[x * 3 + ch] = (byte)Math.Round(row[x * 3 + ch] * a);
                }
                Marshal.Copy(row, 0, data.Scan0 + y * stride, stride);
            }
            o.UnlockBits(data);
            using (var g = Graphics.FromImage(o))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality; g.CompositingQuality = CompositingQuality.HighQuality;
                using (var e = new Bitmap(emblem)) using (var ia = new ImageAttributes())
                {
                    ia.SetColorMatrix(new ColorMatrix { Matrix33 = emblemOpacity });
                    g.DrawImage(e, emblemBox, 0, 0, e.Width, e.Height, GraphicsUnit.Pixel, ia);
                }
                if (!string.IsNullOrEmpty(cac)) using (var e = new Bitmap(cac)) g.DrawImage(e, cacBox);
            }
            SaveJpeg(o, dst, q);
        }
    }
}
