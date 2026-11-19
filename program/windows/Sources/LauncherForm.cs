// LauncherForm.cs — the launcher window, as LAW draws it: `Docs/mockups/argo-a4-guide.html` @ f592705b7, frames
// window-s1-win-a, window-s2-win-a, window-s3-win-a, window-s4-win-a, window-s5-win, and S6's note. Copy verbatim.
//
// The frames' measures (CSS px, scaled by the screen's DPI / 96): 460 wide, one size, fixed; the body #fbfbfb under a
// 1 px #e5e5e5 rule, padding 16/22/18; Segoe UI 14 px, #1d1d1f; a 40 px icon with 22 % corners, 14 px from the headline
// (15 px bold); the lead 14 above and 4 below; the address in 15 px bold Consolas on white, a 1 px #ccc border, 5 px
// corners, padding 5/8, Copy 10 after it; the update line on #fff6d6, 6 px corners, padding 7/10, 12 above, Get it in
// #0a64d6; the buttons 16 below, 8 apart, 4 px corners, padding 5/14, white with a #c4c4c4 border, the primary #005fb8
// with white text; the foot 12 px #6e6e73, 14 below. S5: the message at most 36ch wide beside the icon, OK at the end of
// the row 16 below. The frames are drawn light; the window is too.
//
// NOT BUILT HERE: "Link to your account" and the linked state (T1's link card, D-615 b1). `LinkSlot` keeps their place
// in the button row, after Open Holocron, empty, so adding them changes nothing else.
// S4 is the OS's own Task Dialog (comctl32), never redrawn: the drawn text, Stop Holocron then Keep running, Keep running
// the default.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

enum Face { Running, PortTaken }

sealed class LauncherForm : Form
{
    public readonly Face Face;
    readonly float s;
    readonly Font font, bold, mono, small;
    static readonly Color Ink = Color.FromArgb(0x1d, 0x1d, 0x1f), Body = Color.FromArgb(0xfb, 0xfb, 0xfb);

    IconBox icon;
    Label headline, lead, addr, updateText, foot, err;
    RoundPanel addrBox, updateBox;
    LinkLabel getIt;
    NiceButton copy, open, ok;
    public readonly Panel LinkSlot = new Panel();
    readonly List<Control> order = new List<Control>();   // the visible strings, in the frame's order

    string origin = "";
    UpdateOffer offer;
    public string Origin { get { return origin; } set { origin = value ?? ""; Refresh2(); } }
    public UpdateOffer Offer { get { return offer; } set { offer = value; Refresh2(); } }

    public Action OnCloseAsked, OnOpen, OnChange;
    public Action<string> OnOpenUrl;
    public bool AllowClose;

    // S4's dialog while it is up
    public IntPtr AlertHwnd = IntPtr.Zero;
    public bool AlertUp;
    public const string AlertText = "Players are at your table. Closing stops Holocron for everyone.";
    public static readonly string[] AlertButtons = { "Stop Holocron", "Keep running" };   // as window-s4-win-a draws them
    const int StopId = 101, KeepId = 102;

    public LauncherForm(Face face)
    {
        Face = face;
        using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) s = g.DpiX / 96f;
        font = new Font("Segoe UI", 14 * s, GraphicsUnit.Pixel);
        bold = new Font("Segoe UI", 15 * s, FontStyle.Bold, GraphicsUnit.Pixel);
        mono = new Font("Consolas", 15 * s, FontStyle.Bold, GraphicsUnit.Pixel);
        small = new Font("Segoe UI", 12 * s, GraphicsUnit.Pixel);

        Text = "Holocron";
        AutoScaleMode = AutoScaleMode.None;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Body;
        ForeColor = Ink;
        Font = font;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        BuildControls();
        Refresh2();
    }

    int P(float px) { return (int)Math.Round(px * s); }

    Label Text1(string t, Font f, Color c)
    {
        var l = new Label();
        l.Text = t; l.Font = f; l.ForeColor = c; l.BackColor = Body; l.AutoSize = false; l.UseMnemonic = false;
        Controls.Add(l);
        return l;
    }

    void BuildControls()
    {
        icon = new IconBox(Paths.IconPng);
        icon.Size = new Size(P(40), P(40));
        Controls.Add(icon);

        if (Face == Face.PortTaken)
        {
            err = Text1("Holocron can't start. Another program is using its address (port " + Build.Port + "). Close that program, or restart this computer, then open Holocron again.", font, Ink);
            ok = new NiceButton("OK", true, font, s);
            ok.Click += delegate { if (OnCloseAsked != null) OnCloseAsked(); };
            Controls.Add(ok);
            AcceptButton = ok;
            order.Add(err); order.Add(ok);
            return;
        }

        headline = Text1("Holocron is running.", bold, Ink);
        lead = Text1("Players on your Wi-Fi open:", font, Ink);
        addrBox = new RoundPanel(Color.White, Color.FromArgb(0xcc, 0xcc, 0xcc), P(5));
        addr = new Label();
        addr.Font = mono; addr.ForeColor = Ink; addr.BackColor = Color.White; addr.AutoSize = false; addr.UseMnemonic = false;
        addrBox.Controls.Add(addr);
        Controls.Add(addrBox);
        copy = new NiceButton("Copy", false, font, s);
        copy.Click += delegate { CopyAddress(); };
        Controls.Add(copy);

        updateBox = new RoundPanel(Color.FromArgb(0xff, 0xf6, 0xd6), Color.Empty, P(6));
        updateText = new Label();
        updateText.Font = font; updateText.ForeColor = Ink; updateText.BackColor = updateBox.Fill; updateText.AutoSize = false; updateText.UseMnemonic = false;
        getIt = new LinkLabel();
        getIt.Text = "Get it"; getIt.Font = font; getIt.BackColor = updateBox.Fill; getIt.AutoSize = false; getIt.UseMnemonic = false;
        getIt.LinkColor = getIt.ActiveLinkColor = getIt.VisitedLinkColor = Color.FromArgb(0x0a, 0x64, 0xd6);
        getIt.LinkClicked += delegate { GetIt(); };
        updateBox.Controls.Add(updateText);
        updateBox.Controls.Add(getIt);
        Controls.Add(updateBox);

        open = new NiceButton("Open Holocron", true, font, s);
        open.Click += delegate { if (OnOpen != null) OnOpen(); };
        Controls.Add(open);
        AcceptButton = open;
        LinkSlot.Size = new Size(0, 0);       // T1's place: empty, so it takes no room
        Controls.Add(LinkSlot);
        foot = Text1("Close this window to stop Holocron.", small, Color.FromArgb(0x6e, 0x6e, 0x73));

        order.AddRange(new Control[] { headline, lead, addr, copy, updateText, getIt, open, foot });
    }

    Size Measure(string t, Font f, int width)
    {
        var flags = TextFormatFlags.WordBreak | TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix;
        return TextRenderer.MeasureText(t, f, new Size(width, int.MaxValue), flags);
    }

    void Place(Label l, int x, int y, int width)
    {
        Size z = Measure(l.Text, l.Font, width);
        l.Padding = Padding.Empty; l.Margin = Padding.Empty;
        l.Bounds = new Rectangle(x, y, Math.Min(width, z.Width + P(2)), z.Height);
    }

    void Refresh2()
    {
        SuspendLayout();
        int W = P(460), left = P(22), inner = W - 2 * left, y = P(16);
        if (Face == Face.PortTaken)
        {
            int ch = TextRenderer.MeasureText("0", font, Size.Empty, TextFormatFlags.NoPadding).Width;
            int tx = left + P(40) + P(14);
            Size z = Measure(err.Text, font, Math.Min(36 * ch, W - left - tx));
            int headH = Math.Max(P(40), z.Height);
            icon.Location = new Point(left, y + (headH - P(40)) / 2);
            err.Bounds = new Rectangle(tx, y + (headH - z.Height) / 2, z.Width + P(2), z.Height);
            y += headH + P(16);
            ok.Location = new Point(W - left - ok.Width, y);
            y += ok.Height + P(18);
        }
        else
        {
            icon.Location = new Point(left, y);
            Size hz = Measure(headline.Text, bold, inner);
            headline.Bounds = new Rectangle(left + P(54), y + (P(40) - hz.Height) / 2, hz.Width + P(2), hz.Height);
            y += P(40) + P(14);

            bool none = origin.Length == 0;
            lead.Text = none ? "No Wi-Fi on this computer. Connect it so players can join." : "Players on your Wi-Fi open:";   // window-s2-win-a
            Place(lead, left, y, inner);
            y += lead.Height;

            addrBox.Visible = !none;
            copy.Visible = !none;
            if (!none)
            {
                y += P(4);
                addr.Text = origin;
                Size az = TextRenderer.MeasureText(origin, mono, Size.Empty, TextFormatFlags.NoPadding);
                addr.Bounds = new Rectangle(P(8) + 1, P(5) + 1, az.Width + P(1), az.Height);
                addrBox.Size = new Size(addr.Width + P(16) + 2, addr.Height + P(10) + 2);
                int rowH = Math.Max(addrBox.Height, copy.Height);
                addrBox.Location = new Point(left, y + (rowH - addrBox.Height) / 2);
                copy.Location = new Point(addrBox.Right + P(10), y + (rowH - copy.Height) / 2);
                y += rowH;
            }

            updateBox.Visible = offer != null;
            if (offer != null)
            {
                y += P(12);
                updateText.Text = "A new version of Holocron is out (" + offer.Version + ").";
                Size uz = TextRenderer.MeasureText(updateText.Text, font, Size.Empty, TextFormatFlags.NoPadding);
                Size gz = TextRenderer.MeasureText("Get it", font, Size.Empty, TextFormatFlags.NoPadding);
                int sp = TextRenderer.MeasureText(" ", font, Size.Empty, TextFormatFlags.NoPadding).Width;
                int lh = Math.Max(uz.Height, gz.Height);
                updateText.Bounds = new Rectangle(P(10), P(7), uz.Width + P(1), lh);
                getIt.Bounds = new Rectangle(updateText.Right + sp, P(7), gz.Width + P(2), lh);
                getIt.Padding = Padding.Empty;
                updateBox.Bounds = new Rectangle(left, y, inner, lh + P(14));
                y += updateBox.Height;
            }
            y += P(16);
            open.Location = new Point(left, y);
            LinkSlot.Location = new Point(open.Right + P(8), y);
            y += open.Height + P(14);
            Place(foot, left, y, inner);
            y += foot.Height + P(18);
        }
        ClientSize = new Size(W, y);
        ResumeLayout(true);
        Invalidate();
        if (OnChange != null) OnChange();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using (var pen = new Pen(Color.FromArgb(0xe5, 0xe5, 0xe5))) e.Graphics.DrawLine(pen, 0, 0, ClientSize.Width, 0);
    }

    // ── actions ──
    void CopyAddress()
    {
        for (int i = 0; i < 5; i++)
        {
            try { Clipboard.SetText(origin); return; }
            catch (ExternalException) { System.Threading.Thread.Sleep(50); }
        }
        Logger.Write("copy: the clipboard was busy");
    }

    void GetIt() { if (offer != null && OnOpenUrl != null) OnOpenUrl(offer.Page.OriginalString); }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // the OS ending the session goes straight to the FormClosing handlers (the app stops with no ask)
        if (AllowClose || e.CloseReason == CloseReason.WindowsShutDown) { base.OnFormClosing(e); return; }
        e.Cancel = true;   // the app decides (S4), then exits; the window is never closed on its own
        if (OnCloseAsked != null) BeginInvoke(OnCloseAsked);
    }

    // ── S4: the OS's own Task Dialog ──
    Native.TaskDialogCallback callback;   // held: the dialog calls it until it is gone

    public void AskPlayersAtTable(Action<bool> answer)
    {
        if (AlertUp) return;
        AlertUp = true;
        int size = Marshal.SizeOf(typeof(Native.TASKDIALOG_BUTTON));
        IntPtr buttons = Marshal.AllocHGlobal(size * 2);
        int pressed = KeepId;
        try
        {
            var b0 = new Native.TASKDIALOG_BUTTON(); b0.nButtonID = StopId; b0.pszButtonText = AlertButtons[0];
            var b1 = new Native.TASKDIALOG_BUTTON(); b1.nButtonID = KeepId; b1.pszButtonText = AlertButtons[1];
            Marshal.StructureToPtr(b0, buttons, false);
            Marshal.StructureToPtr(b1, new IntPtr(buttons.ToInt64() + size), false);
            var c = new Native.TASKDIALOGCONFIG();
            c.cbSize = Marshal.SizeOf(typeof(Native.TASKDIALOGCONFIG));
            c.hwndParent = Handle;
            c.dwFlags = Native.TDF_ALLOW_DIALOG_CANCELLATION | Native.TDF_POSITION_RELATIVE_TO_WINDOW;
            c.pszWindowTitle = "Holocron";
            c.pszContent = AlertText;
            c.cButtons = 2;
            c.pButtons = buttons;
            c.nDefaultButton = KeepId;
            callback = delegate (IntPtr hwnd, int msg, IntPtr w, IntPtr l, IntPtr data)
            {
                if (msg == Native.TDN_CREATED) { AlertHwnd = hwnd; if (OnChange != null) OnChange(); }
                else if (msg == Native.TDN_DESTROYED) AlertHwnd = IntPtr.Zero;
                return 0;
            };
            c.pfCallback = callback;
            int radio; bool verified;
            int hr = Native.TaskDialogIndirect(ref c, out pressed, out radio, out verified);
            if (hr != 0) { Logger.Write("S4: the Task Dialog did not open (0x" + hr.ToString("x8") + "): kept running"); pressed = KeepId; }
        }
        finally
        {
            Marshal.DestroyStructure(buttons, typeof(Native.TASKDIALOG_BUTTON));
            Marshal.DestroyStructure(new IntPtr(buttons.ToInt64() + size), typeof(Native.TASKDIALOG_BUTTON));
            Marshal.FreeHGlobal(buttons);
            AlertUp = false;
            AlertHwnd = IntPtr.Zero;
        }
        if (OnChange != null) OnChange();
        answer(pressed == StopId);   // Keep running, Esc and the dialog's close all keep it running
    }

    // ── what the suite reads (HOLOCRON_TEST_REPORT) ──
    /// Whether a control is drawn in the current state (Control.Visible reads false until the form is shown).
    bool Drawn(Control c)
    {
        if (c == addr || c == copy) return origin.Length > 0;
        if (c == updateText || c == getIt) return offer != null;
        return true;
    }

    public List<string> VisibleStrings()
    {
        var out1 = new List<string>();
        foreach (Control c in order) if (Drawn(c) && !string.IsNullOrEmpty(c.Text)) out1.Add(c.Text);
        return out1;
    }

    public bool PressButton(string title)
    {
        if (AlertUp)
        {
            int id = title == AlertButtons[0] ? StopId : title == AlertButtons[1] ? KeepId : 0;
            if (id == 0 || AlertHwnd == IntPtr.Zero) return false;
            Native.PostMessage(AlertHwnd, Native.TDM_CLICK_BUTTON, new IntPtr(id), IntPtr.Zero);
            return true;
        }
        foreach (Control c in order)
        {
            if (!Drawn(c) || c.Text != title) continue;
            var b = c as Button;
            if (b != null) { b.PerformClick(); return true; }
            if (c == getIt) { GetIt(); return true; }
        }
        return false;
    }

    /// The window as it draws itself, and the dialog when it is up. No screen capture: the suite's pictures come from
    /// here (HOLOCRON_TEST_SNAPSHOT).
    public void Snapshot(string dir, string name)
    {
        try
        {
            using (var bmp = new Bitmap(Width, Height))
            {
                DrawToBitmap(bmp, new Rectangle(0, 0, Width, Height));
                bmp.Save(Path.Combine(dir, name + ".png"), ImageFormat.Png);
            }
            if (AlertHwnd != IntPtr.Zero)
            {
                Native.RECT r;
                if (Native.GetWindowRect(AlertHwnd, out r) && r.Right > r.Left)
                {
                    using (var bmp = new Bitmap(r.Right - r.Left, r.Bottom - r.Top))
                    {
                        using (Graphics g = Graphics.FromImage(bmp))
                        {
                            IntPtr hdc = g.GetHdc();
                            Native.PrintWindow(AlertHwnd, hdc, 2);
                            g.ReleaseHdc(hdc);
                        }
                        bmp.Save(Path.Combine(dir, name + "-alert.png"), ImageFormat.Png);
                    }
                }
            }
        }
        catch (Exception e) { Logger.Write("snapshot: " + e.Message); }
    }
}

/// The 40 px icon with 22 % corners (.ico's border-radius).
sealed class IconBox : Control
{
    readonly Image img;
    public IconBox(string png)
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        try { img = File.Exists(png) ? Image.FromFile(png) : Icon.ExtractAssociatedIcon(Application.ExecutablePath).ToBitmap(); } catch { img = null; }
        TabStop = false;
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(Parent != null ? Parent.BackColor : Color.White);
        if (img == null) return;
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        using (GraphicsPath p = RoundPanel.Rounded(new Rectangle(0, 0, Width, Height), (int)Math.Round(Width * 0.22)))
        {
            e.Graphics.SetClip(p);
            e.Graphics.DrawImage(img, new Rectangle(0, 0, Width, Height));
        }
    }
}

/// A rounded box: the address's and the update line's.
sealed class RoundPanel : Panel
{
    public readonly Color Fill, Border;
    readonly int radius;
    public RoundPanel(Color fill, Color border, int radius)
    {
        Fill = fill; Border = border; this.radius = radius;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
    }
    public static GraphicsPath Rounded(Rectangle r, int rad)
    {
        var p = new GraphicsPath();
        int d = Math.Max(1, rad * 2);
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(Parent != null ? Parent.BackColor : Color.White);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using (GraphicsPath p = Rounded(new Rectangle(0, 0, Width - 1, Height - 1), radius))
        {
            using (var b = new SolidBrush(Fill)) e.Graphics.FillPath(b, p);
            if (Border != Color.Empty) using (var pen = new Pen(Border)) e.Graphics.DrawPath(pen, p);
        }
    }
}

/// The frames' buttons (.nb.win, .nb.pri.win): a real Button (focus, keyboard, Enter on the primary), drawn to the frame.
sealed class NiceButton : Button
{
    readonly bool primary;
    readonly float s;
    public NiceButton(string text, bool primary, Font font, float scale)
    {
        this.primary = primary; s = scale;
        Text = text; Font = font; UseMnemonic = false;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        Size z = TextRenderer.MeasureText(text, font, Size.Empty, TextFormatFlags.NoPadding);
        Size = new Size(z.Width + (int)Math.Round(28 * s) + 2, (int)Math.Round(20.3f * s) + (int)Math.Round(10 * s) + 2);
    }
    bool hover, down;
    protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hover = false; down = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.Clear(Parent != null ? Parent.BackColor : Color.White);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        Color fill = primary ? Color.FromArgb(0x00, 0x5f, 0xb8) : Color.White;
        Color edge = primary ? Color.FromArgb(0x00, 0x5f, 0xb8) : Color.FromArgb(0xc4, 0xc4, 0xc4);
        if (hover || down) fill = primary ? Color.FromArgb(down ? 0x00 : 0x19, down ? 0x4e : 0x6c, down ? 0x99 : 0xc1) : Color.FromArgb(down ? 0xf0 : 0xf6, down ? 0xf0 : 0xf6, down ? 0xf0 : 0xf6);
        using (GraphicsPath p = RoundPanel.Rounded(new Rectangle(0, 0, Width - 1, Height - 1), (int)Math.Round(4 * s)))
        {
            using (var b = new SolidBrush(fill)) g.FillPath(b, p);
            using (var pen = new Pen(edge)) g.DrawPath(pen, p);
        }
        TextRenderer.DrawText(g, Text, Font, new Rectangle(0, 0, Width, Height), primary ? Color.White : Color.FromArgb(0x1d, 0x1d, 0x1f),
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix);
        if (Focused && ShowFocusCues)
            using (var pen = new Pen(primary ? Color.White : Color.FromArgb(0x1d, 0x1d, 0x1f)) { DashStyle = DashStyle.Dot })
                g.DrawRectangle(pen, 3, 3, Width - 7, Height - 7);
    }
}
