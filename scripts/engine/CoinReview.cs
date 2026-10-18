using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using System.Windows.Forms;

public class ReviewResult { public string Action; public int Pick; public CoinFit Fit; public int Gap; }

// One side of one coin (Prep-Photos.ps1): the photo with the script's circle, a live close-up preview, the slab
// shot, and four edge zooms. Tony accepts the circle, or clicks 3+ points on the coin's true edge, or nudges it
// with the keys; he can also turn the shot 180 degrees and change how big the coin sits in the mask.
public class ReviewForm : Form
{
    const int Canvas = 1044, Dia = 900;                    // Tony's close-up template
    int gap;                                               // px between the coin's edge and the mask
    double MaskK { get { return (Dia / 2.0) / (Dia / 2.0 - gap); } }   // mask radius / coin radius
    static bool styled;

    readonly string coinTitle, sideName;
    readonly string[] files;
    readonly CoinFit[] guesses, fits;
    readonly string[] how;
    int pick;
    Bitmap src, viewBmp, previewBmp, slabBmp, emblem, cac;
    Rectangle viewRect, previewRect, slabRect;
    readonly Rectangle[] tileRects = new Rectangle[4];
    RectangleF viewSrc; float viewK;
    readonly List<PointF> clicks = new List<PointF>();
    Point mouse = new Point(-1, -1);
    string action = "quit";
    Button bPrev, bNext, bReset, bTurn, bOk, bSkip;
    Label help;
    readonly Font big = new Font("Segoe UI", 13, FontStyle.Bold), small = new Font("Segoe UI", 9.5f);

    public ReviewForm(string title, string side, string[] files, CoinFit[] guesses, int pick, int gap, string emblemPath, string cacPath)
    {
        coinTitle = title; sideName = side; this.files = files; this.guesses = guesses; this.pick = pick; this.gap = gap;
        fits = guesses.Select(Copy).ToArray();
        how = guesses.Select(g => g.Note == "saved" ? "your saved circle" : g.Note == "unknown size" ? "coin size unknown: click 3 points on its edge" : "script's guess").ToArray();
        emblem = new Bitmap(emblemPath);
        if (!string.IsNullOrEmpty(cacPath)) cac = new Bitmap(cacPath);
        Text = "Check the coin edge - " + title + " - " + side;
        BackColor = Color.FromArgb(30, 30, 30); ForeColor = Color.White;
        DoubleBuffered = true; KeyPreview = true;
        StartPosition = FormStartPosition.Manual; Bounds = Screen.PrimaryScreen.WorkingArea;
        bPrev = Btn("< Other shot", delegate { Shot(-1); });
        bNext = Btn("Other shot >", delegate { Shot(1); });
        bReset = Btn("Back to guess", delegate { ResetCircle(); });
        bTurn = Btn("Turn 180\u00B0", delegate { Finish("turn"); });
        bOk = Btn("Looks right - use it", delegate { Finish("ok"); });
        bSkip = Btn("Skip this coin", delegate { Finish("skip"); });
        bOk.BackColor = Color.FromArgb(40, 110, 60); bOk.Font = new Font("Segoe UI", 11, FontStyle.Bold);
        bPrev.Enabled = bNext.Enabled = files.Length > 1;
        help = new Label { ForeColor = Color.Silver, Font = small, AutoSize = false, Text =
            "Blue = the coin's edge.  Yellow dashes = where the black mask starts (the gap shows the reeding).\n" +
            "Not right?  Click 3 or more points on the coin's TRUE edge (spread around the coin). Right-click = undo a point.\n" +
            "Fine-tune: arrow keys move the circle, + / - or the mouse wheel resize it (hold Shift for bigger steps).\n" +
            "[ and ] = coin smaller / bigger inside the mask (small coins start smaller so they aren't over-magnified).\n" +
            "T = turn the shot 180\u00B0 (slab or coin upside down).  PgUp / PgDn = other shot of this side.  R = back to the guess.\n" +
            "Enter = use it.  Esc = stop for now (finished coins are kept)." };
        Controls.Add(help);
        DoLayout();
        LoadShot();
    }

    Button Btn(string text, EventHandler onClick)
    {
        var b = new Button { Text = text, FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(60, 60, 60), ForeColor = Color.White, TabStop = false, Font = small };
        b.Click += onClick; Controls.Add(b); return b;
    }

    static CoinFit Copy(CoinFit f) { return new CoinFit { Cx = f.Cx, Cy = f.Cy, R = f.R, ClipPct = f.ClipPct, MeanLum = f.MeanLum, Note = f.Note }; }

    void DoLayout()
    {
        int W = ClientSize.Width, H = ClientSize.Height, m = 12, RW = Math.Max(360, Math.Min(480, W / 3));
        int vs = Math.Max(200, Math.Min(W - RW - 3 * m, H - 2 * m));
        viewRect = new Rectangle(m, m, vs, vs);
        int x0 = viewRect.Right + m;
        int P = Math.Max(200, Math.Min(RW, (H - 300) / 2));
        previewRect = new Rectangle(x0, 64, P, P);
        int T = (P - 8) / 2, ty = previewRect.Bottom + 8;
        tileRects[0] = new Rectangle(x0, ty, T, T);              // top
        tileRects[1] = new Rectangle(x0 + T + 8, ty, T, T);      // right
        tileRects[2] = new Rectangle(x0, ty + T + 8, T, T);      // left
        tileRects[3] = new Rectangle(x0 + T + 8, ty + T + 8, T, T); // bottom
        // the slab shot beside the preview, when there's room
        int sw = W - previewRect.Right - 12 - m;
        slabRect = sw >= 120 ? new Rectangle(previewRect.Right + 12, previewRect.Y, sw, P) : Rectangle.Empty;
        int bwAll = Math.Max(P, W - x0 - m), by = ty + 2 * T + 16, bw = (bwAll - 16) / 3, bq = (bwAll - 24) / 4;
        bPrev.Bounds = new Rectangle(x0, by, bq, 32);
        bNext.Bounds = new Rectangle(x0 + bq + 8, by, bq, 32);
        bReset.Bounds = new Rectangle(x0 + 2 * (bq + 8), by, bq, 32);
        bTurn.Bounds = new Rectangle(x0 + 3 * (bq + 8), by, bq, 32);
        bOk.Bounds = new Rectangle(x0, by + 40, 2 * bw + 8, 40);
        bSkip.Bounds = new Rectangle(x0 + 2 * (bw + 8), by + 40, bw, 40);
        help.Bounds = new Rectangle(x0, by + 88, bwAll, Math.Max(40, H - by - 92));
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (bOk == null || ClientSize.Width < 100) return;
        DoLayout(); if (src != null) { BuildView(); BuildPreview(); BuildSlab(); } Invalidate();
    }

    void LoadShot()
    {
        if (src != null) src.Dispose();
        src = new Bitmap(files[pick]);
        clicks.Clear();
        BuildSlab();
        BuildView(); BuildPreview(); Invalidate();
    }

    // The photo around the coin, scaled to the view once per shot (the circle and points are drawn over it).
    void BuildView()
    {
        var g0 = guesses[pick]; double side = 2.6 * g0.R;
        viewSrc = new RectangleF((float)(g0.Cx - side / 2), (float)(g0.Cy - side / 2), (float)side, (float)side);
        viewK = (float)(viewRect.Width / side);
        if (viewBmp != null) viewBmp.Dispose();
        viewBmp = new Bitmap(viewRect.Width, viewRect.Height);
        using (var g = Graphics.FromImage(viewBmp))
        {
            g.Clear(Color.Black); g.InterpolationMode = InterpolationMode.HighQualityBilinear; g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(src, new Rectangle(0, 0, viewBmp.Width, viewBmp.Height), viewSrc, GraphicsUnit.Pixel);
        }
    }

    // The slab shot, small (to check it stands the right way up).
    void BuildSlab()
    {
        if (slabBmp != null) { slabBmp.Dispose(); slabBmp = null; }
        if (slabRect.IsEmpty) return;
        double k = Math.Min((double)slabRect.Width / src.Width, (double)slabRect.Height / src.Height);
        slabBmp = new Bitmap(Math.Max(1, (int)(src.Width * k)), Math.Max(1, (int)(src.Height * k)));
        using (var g = Graphics.FromImage(slabBmp)) { g.InterpolationMode = InterpolationMode.HighQualityBilinear; g.DrawImage(src, 0, 0, slabBmp.Width, slabBmp.Height); }
    }

    // What the close-up will look like (same geometry as CoinPhoto.Close, drawn small).
    void BuildPreview()
    {
        var f = fits[pick]; int P = previewRect.Width; double s = (double)P / Canvas;
        double k = (Dia / 2.0 - gap) / f.R, side = Canvas / k;
        if (previewBmp != null) previewBmp.Dispose();
        previewBmp = new Bitmap(P, P);
        using (var g = Graphics.FromImage(previewBmp))
        {
            g.Clear(Color.Black); g.InterpolationMode = InterpolationMode.HighQualityBilinear; g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(src, new Rectangle(0, 0, P, P), new RectangleF((float)(f.Cx - side / 2), (float)(f.Cy - side / 2), (float)side, (float)side), GraphicsUnit.Pixel);
            using (var path = new GraphicsPath())
            {
                path.AddRectangle(new Rectangle(-1, -1, P + 2, P + 2));
                double r = Dia / 2.0 * s; path.AddEllipse((float)(P / 2.0 - r), (float)(P / 2.0 - r), (float)(2 * r), (float)(2 * r));
                g.SmoothingMode = SmoothingMode.AntiAlias; g.FillPath(Brushes.Black, path);
            }
            using (var ia = new ImageAttributes())
            {
                ia.SetColorMatrix(new ColorMatrix { Matrix33 = 0.8f });
                g.DrawImage(emblem, Scale(new Rectangle(75, 869, 124, 124), s), 0, 0, emblem.Width, emblem.Height, GraphicsUnit.Pixel, ia);
            }
            if (cac != null) g.DrawImage(cac, Scale(new Rectangle(816, 890, 131, 78), s));
        }
    }

    static Rectangle Scale(Rectangle r, double s) { return new Rectangle((int)Math.Round(r.X * s), (int)Math.Round(r.Y * s), (int)Math.Round(r.Width * s), (int)Math.Round(r.Height * s)); }

    PointF ToView(double x, double y) { return new PointF(viewRect.X + (float)((x - viewSrc.X) * viewK), viewRect.Y + (float)((y - viewSrc.Y) * viewK)); }
    PointF ToSrc(Point p) { return new PointF(viewSrc.X + (p.X - viewRect.X) / viewK, viewSrc.Y + (p.Y - viewRect.Y) / viewK); }

    // Circle of source radius r around the coin centre, drawn in a box that shows source area `area` at `rect`.
    static void Circle(Graphics g, Pen pen, Rectangle rect, RectangleF area, double cx, double cy, double r)
    {
        float k = rect.Width / area.Width;
        g.DrawEllipse(pen, rect.X + (float)((cx - r - area.X) * k), rect.Y + (float)((cy - r - area.Y) * k), (float)(2 * r * k), (float)(2 * r * k));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics; var f = fits[pick];
        using (var edge = new Pen(Color.DeepSkyBlue, 1.5f))
        using (var mask = new Pen(Color.Gold, 1.5f) { DashStyle = DashStyle.Dash })
        using (var thin = new Pen(Color.DeepSkyBlue, 1f))
        using (var thinMask = new Pen(Color.Gold, 1f) { DashStyle = DashStyle.Dash })
        {
            // photo + circles + clicked points
            g.DrawImage(viewBmp, viewRect.Location);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.SetClip(viewRect);
            Circle(g, edge, viewRect, viewSrc, f.Cx, f.Cy, f.R);
            Circle(g, mask, viewRect, viewSrc, f.Cx, f.Cy, f.R * MaskK);
            foreach (var c in clicks)
            {
                var p = ToView(c.X, c.Y);
                using (var red = new Pen(Color.Red, 2)) { g.DrawLine(red, p.X - 7, p.Y, p.X + 7, p.Y); g.DrawLine(red, p.X, p.Y - 7, p.X, p.Y + 7); }
            }
            // magnifier under the mouse, 4x, so the edge can be clicked exactly
            if (viewRect.Contains(mouse))
            {
                var sp = ToSrc(mouse); const int L = 240; const float Z = 4f;
                var area = new RectangleF(sp.X - L / Z / 2, sp.Y - L / Z / 2, L / Z, L / Z);
                int lx = mouse.X + 24, ly = mouse.Y + 24;
                if (lx + L > viewRect.Right) lx = mouse.X - 24 - L;
                if (ly + L > viewRect.Bottom) ly = mouse.Y - 24 - L;
                var lr = new Rectangle(lx, ly, L, L);
                g.InterpolationMode = InterpolationMode.NearestNeighbor; g.PixelOffsetMode = PixelOffsetMode.Half;
                g.DrawImage(src, lr, area, GraphicsUnit.Pixel);
                g.PixelOffsetMode = PixelOffsetMode.Default;
                g.SetClip(lr);
                Circle(g, thin, lr, area, f.Cx, f.Cy, f.R);
                Circle(g, thinMask, lr, area, f.Cx, f.Cy, f.R * MaskK);
                using (var cross = new Pen(Color.FromArgb(200, Color.Red), 1)) { g.DrawLine(cross, lr.X + L / 2, lr.Y, lr.X + L / 2, lr.Bottom); g.DrawLine(cross, lr.X, lr.Y + L / 2, lr.Right, lr.Y + L / 2); }
                g.SetClip(viewRect);
                g.DrawRectangle(Pens.White, lr);
            }
            g.ResetClip();

            // header
            int x0 = previewRect.X;
            g.DrawString(coinTitle, big, Brushes.White, new RectangleF(x0, 6, ClientSize.Width - x0 - 8, 26));
            string status = string.Format("{0}  -  shot {1} of {2}: {3}  -  blown out {4:0.0}%  -  coin {5} px in the {6} mask  -  {7}",
                sideName, pick + 1, files.Length, System.IO.Path.GetFileName(files[pick]).Replace("-prep", ""), f.ClipPct, Dia - 2 * gap, Dia, how[pick]);
            if (clicks.Count > 0 && clicks.Count < 3) status += string.Format("  -  {0} point{1} clicked, need 3", clicks.Count, clicks.Count == 1 ? "" : "s");
            g.DrawString(status, small, Brushes.Silver, new RectangleF(x0, 36, ClientSize.Width - x0 - 8, 22));

            // close-up preview and edge zooms (top, right, left, bottom) at 2x
            g.DrawImage(previewBmp, previewRect.Location);
            if (slabBmp != null) g.DrawImage(slabBmp, slabRect.X + (slabRect.Width - slabBmp.Width) / 2, slabRect.Y);
            double[] ang = { -Math.PI / 2, 0, Math.PI, Math.PI / 2 };
            for (int i = 0; i < 4; i++)
            {
                var tr = tileRects[i]; float Z = 2f;
                double ex = f.Cx + f.R * Math.Cos(ang[i]), ey = f.Cy + f.R * Math.Sin(ang[i]);
                var area = new RectangleF((float)(ex - tr.Width / Z / 2), (float)(ey - tr.Height / Z / 2), tr.Width / Z, tr.Height / Z);
                g.InterpolationMode = InterpolationMode.NearestNeighbor; g.PixelOffsetMode = PixelOffsetMode.Half;
                g.DrawImage(src, tr, area, GraphicsUnit.Pixel);
                g.PixelOffsetMode = PixelOffsetMode.Default;
                g.SetClip(tr);
                Circle(g, thin, tr, area, f.Cx, f.Cy, f.R);
                Circle(g, thinMask, tr, area, f.Cx, f.Cy, f.R * MaskK);
                g.ResetClip();
                g.DrawRectangle(Pens.Gray, tr);
            }
        }
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        Keys k = keyData & Keys.KeyCode; double st = (keyData & Keys.Shift) != 0 ? 5 : 1; var f = fits[pick];
        switch (k)
        {
            case Keys.Left: f.Cx -= st; break;
            case Keys.Right: f.Cx += st; break;
            case Keys.Up: f.Cy -= st; break;
            case Keys.Down: f.Cy += st; break;
            case Keys.Oemplus: case Keys.Add: f.R += st; break;
            case Keys.OemMinus: case Keys.Subtract: f.R -= st; break;
            case Keys.Enter: Finish("ok"); return true;
            case Keys.PageUp: Shot(-1); return true;
            case Keys.PageDown: Shot(1); return true;
            case Keys.Back: case Keys.Delete: Undo(); return true;
            case Keys.R: ResetCircle(); return true;
            case Keys.T: Finish("turn"); return true;
            case Keys.OemOpenBrackets: gap = Math.Min(200, gap + 5); Changed(how[pick]); return true;
            case Keys.OemCloseBrackets: gap = Math.Max(0, gap - 5); Changed(how[pick]); return true;
            case Keys.Escape: Finish("quit"); return true;
            default: return base.ProcessCmdKey(ref msg, keyData);
        }
        Changed("nudged by you");
        return true;
    }

    protected override void OnMouseMove(MouseEventArgs e) { base.OnMouseMove(e); mouse = e.Location; Invalidate(viewRect); }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); mouse = new Point(-1, -1); Invalidate(viewRect); }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (!viewRect.Contains(e.Location)) return;
        if (e.Button == MouseButtons.Right) { Undo(); return; }
        if (e.Button != MouseButtons.Left) return;
        clicks.Add(ToSrc(e.Location));
        Refit();
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        base.OnMouseWheel(e);
        double st = (ModifierKeys & Keys.Shift) != 0 ? 5 : 1;
        fits[pick].R += Math.Sign(e.Delta) * st;
        Changed("nudged by you");
    }

    void Refit()
    {
        var c = CoinPhoto.FitPoints(clicks);
        if (c != null)
        {
            var f = fits[pick]; f.Cx = c.Cx; f.Cy = c.Cy; f.R = c.R;
            Changed("your " + clicks.Count + " points");
        }
        else Invalidate();
    }

    void Undo()
    {
        if (clicks.Count == 0) return;
        clicks.RemoveAt(clicks.Count - 1);
        Refit();
    }

    void Changed(string why) { how[pick] = why; BuildPreview(); Invalidate(); }

    void ResetCircle() { fits[pick] = Copy(guesses[pick]); how[pick] = "script's guess"; clicks.Clear(); BuildPreview(); Invalidate(); }

    void Shot(int d)
    {
        if (files.Length < 2) return;
        pick = (pick + d + files.Length) % files.Length;
        LoadShot();
    }

    void Finish(string a)
    {
        if (a == "quit" && MessageBox.Show(this, "Stop for now? Coins you already accepted are kept, and next time it picks up where you left off.",
            "Stop reviewing", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        action = a; Close();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            foreach (var b in new[] { src, viewBmp, previewBmp, slabBmp, emblem, cac }) if (b != null) b.Dispose();
            big.Dispose(); small.Dispose();
        }
        base.Dispose(disposing);
    }

    public static ReviewResult Ask(string title, string side, string[] files, CoinFit[] guesses, int pick, int gap, string emblemPath, string cacPath)
    {
        if (!styled) { Application.EnableVisualStyles(); styled = true; }
        using (var f = new ReviewForm(title, side, files, guesses, pick, gap, emblemPath, cacPath))
        {
            f.ShowDialog();
            return new ReviewResult { Action = f.action, Pick = f.pick, Fit = Copy(f.fits[f.pick]), Gap = f.gap };
        }
    }

    // Test aid: render the window to a PNG without showing it (optional clicks, mouse position for the magnifier).
    public static void Snapshot(string title, string side, string[] files, CoinFit[] guesses, int pick, int gap, string emblemPath, string cacPath,
        int w, int h, PointF[] srcClicks, string png)
    {
        using (var f = new ReviewForm(title, side, files, guesses, pick, gap, emblemPath, cacPath))
        {
            f.ClientSize = new Size(w, h);
            if (srcClicks != null && srcClicks.Length > 0)
            {
                f.clicks.AddRange(srcClicks); f.Refit();
                var last = f.ToView(srcClicks[0].X, srcClicks[0].Y); f.mouse = new Point((int)last.X, (int)last.Y);
            }
            var hw = f.Handle; foreach (Control c in f.Controls) { var hc = c.Handle; }
            using (var b = new Bitmap(f.Width, f.Height)) { f.DrawToBitmap(b, new Rectangle(0, 0, f.Width, f.Height)); b.Save(png, ImageFormat.Png); }
        }
    }
}
