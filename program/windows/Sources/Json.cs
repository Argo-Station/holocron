// Json.cs — the little JSON the launcher reads and writes: the update file (A4-C13), /program/presence (A4-C12) and the
// suite's report. .NET Framework's own serializers live outside mscorlib and System, so the launcher carries its own
// reader (objects, arrays, strings, numbers, true/false/null; anything else is a failure) and a writer that sorts keys.
// Numbers read as double; an integer is a double with no fraction.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

static class Json
{
    // ── reading ──
    public static object Parse(string s)
    {
        int i = 0;
        object v = Value(s, ref i);
        Ws(s, ref i);
        if (i != s.Length) throw new FormatException("trailing text");
        return v;
    }

    static void Ws(string s, ref int i) { while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++; }

    static object Value(string s, ref int i)
    {
        Ws(s, ref i);
        if (i >= s.Length) throw new FormatException("end of text");
        char c = s[i];
        if (c == '{')
        {
            var o = new Dictionary<string, object>();
            i++; Ws(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return o; }
            while (true)
            {
                Ws(s, ref i);
                if (i >= s.Length || s[i] != '"') throw new FormatException("key");
                string k = Str(s, ref i);
                Ws(s, ref i);
                if (i >= s.Length || s[i] != ':') throw new FormatException("colon");
                i++;
                o[k] = Value(s, ref i);
                Ws(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; return o; }
                throw new FormatException("object");
            }
        }
        if (c == '[')
        {
            var a = new List<object>();
            i++; Ws(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return a; }
            while (true)
            {
                a.Add(Value(s, ref i));
                Ws(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; return a; }
                throw new FormatException("array");
            }
        }
        if (c == '"') return Str(s, ref i);
        if (Lit(s, ref i, "true")) return true;
        if (Lit(s, ref i, "false")) return false;
        if (Lit(s, ref i, "null")) return null;
        int start = i;
        if (i < s.Length && s[i] == '-') i++;
        while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+' || s[i] == '-')) i++;
        double d;
        if (i == start || !double.TryParse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture, out d))
            throw new FormatException("value");
        return d;
    }

    static bool Lit(string s, ref int i, string word)
    {
        if (string.CompareOrdinal(s, i, word, 0, word.Length) != 0) return false;
        i += word.Length;
        return true;
    }

    static string Str(string s, ref int i)
    {
        var b = new StringBuilder();
        i++;
        while (i < s.Length)
        {
            char c = s[i++];
            if (c == '"') return b.ToString();
            if (c != '\\') { b.Append(c); continue; }
            if (i >= s.Length) break;
            char e = s[i++];
            switch (e)
            {
                case '"': b.Append('"'); break;
                case '\\': b.Append('\\'); break;
                case '/': b.Append('/'); break;
                case 'b': b.Append('\b'); break;
                case 'f': b.Append('\f'); break;
                case 'n': b.Append('\n'); break;
                case 'r': b.Append('\r'); break;
                case 't': b.Append('\t'); break;
                case 'u':
                    if (i + 4 > s.Length) throw new FormatException("escape");
                    b.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                    i += 4;
                    break;
                default: throw new FormatException("escape");
            }
        }
        throw new FormatException("string");
    }

    /// An integer member (a double with no fraction), or null.
    public static int? Int(Dictionary<string, object> o, string key)
    {
        object v;
        if (o == null || !o.TryGetValue(key, out v) || !(v is double)) return null;
        double d = (double)v;
        if (d != Math.Floor(d) || d < int.MinValue || d > int.MaxValue) return null;
        return (int)d;
    }

    public static string Text(Dictionary<string, object> o, string key)
    {
        object v;
        if (o == null || !o.TryGetValue(key, out v)) return null;
        return v as string;
    }

    // ── writing ──
    public static string Write(object v)
    {
        var b = new StringBuilder();
        Emit(b, v);
        return b.ToString();
    }

    static void Emit(StringBuilder b, object v)
    {
        if (v == null) { b.Append("null"); return; }
        if (v is bool) { b.Append((bool)v ? "true" : "false"); return; }
        if (v is int) { b.Append(((int)v).ToString(CultureInfo.InvariantCulture)); return; }
        if (v is string) { Quote(b, (string)v); return; }
        var d = v as IDictionary<string, object>;
        if (d != null)
        {
            var keys = new List<string>(d.Keys);
            keys.Sort(string.CompareOrdinal);
            b.Append('{');
            for (int k = 0; k < keys.Count; k++)
            {
                if (k > 0) b.Append(',');
                Quote(b, keys[k]);
                b.Append(':');
                Emit(b, d[keys[k]]);
            }
            b.Append('}');
            return;
        }
        var list = v as System.Collections.IEnumerable;
        if (list != null)
        {
            b.Append('[');
            bool first = true;
            foreach (object x in list) { if (!first) b.Append(','); first = false; Emit(b, x); }
            b.Append(']');
            return;
        }
        throw new ArgumentException("cannot write " + v.GetType().Name);
    }

    static void Quote(StringBuilder b, string s)
    {
        b.Append('"');
        foreach (char c in s)
        {
            if (c == '"') b.Append("\\\"");
            else if (c == '\\') b.Append("\\\\");
            else if (c == '\n') b.Append("\\n");
            else if (c == '\r') b.Append("\\r");
            else if (c == '\t') b.Append("\\t");
            else if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4"));
            else b.Append(c);
        }
        b.Append('"');
    }
}
