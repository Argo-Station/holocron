"""The dice-font decode: a book's dice and result symbols read EXACTLY from its own font and colour.

Ruling `glyph-class-recon` R-GCR-2 (b'), contract C-GCR-1. Some PDFs are typeset with the dice and result
symbols as glyphs of an icon font: `SWRPGIcons`, or the merged `ITCSymbolStdBookSWRPG` (letters and dice in
one face). PyMuPDF's plain `get_text()` returns those glyphs as `π º ∫ ≥ …`, which the index has been
storing as junk. The glyph alone does not name the die (`π` is Ability in green and Difficulty in purple),
but the glyph together with its span colour does, and every row of TABLE below was witnessed on the book's
own legend or a crop (ruling §2).

A book opts in with `"text_decode": "swrpg-icons"` in Docs/pdf_sources.json. That is a FILE property,
exactly like `text_shift`: a repoint of the alias at a different PDF carries none of it.
`decode_page()` rebuilds a page's text from `get_text("dict")` spans. In a span whose font is in the SWRPG
icon family, each icon-set character becomes its token (the verified rules tables' vocabulary). Every other
character, and every other span, is emitted verbatim, so a page with no icon span equals `get_text()` line
for line. An icon character whose (glyph, colour) pair is not in TABLE is emitted verbatim and COUNTED,
never guessed. `\\x00` is removed.
"""
import collections

import fitz

TEXT_DECODES = ('swrpg-icons', 'dice-marks')   # 'dice-marks': swrpg_index.dice_marks (ruling dice-render-decode)

# Font-name keys (a subset prefix like "ABCDEF+" or a "-Italic" suffix does not matter).
RULED_ICON_FONTS = ('SWRPGIcons', 'ITCSymbolStdBookSWRPG')
# An icon font seen in the corpus with NO ruled table (old-republic-v08, community, letter-coded dice).
KNOWN_UNRULED_ICON_FONTS = ('SWRPGGlyphsAndDice', 'GenesysGlyphsAndDice')
# Name fragments that mark a font as an icon/dice font at all (for the guard's "undeclared" sweep).
ICON_FONT_MARKERS = ('SWRPG', 'GlyphsAndDice', 'Dice')

ICON_SET = set('πº∫≥∂≤∑±µ∏Ω\x0e\x00')

_PURPLE = {'52237f', '866aac', '866bab'}
_GREEN = {'40ad49', '41ad49', '47a23e', '48a23e'}
_YELLOW = {'ffe900', 'fff200', 'ffe800'}
_RED = {'e41837', 'd2232a', 'd22329', 'e31837'}
_WHITE = {'ffffff'}
_BLUE = {'a3d8f5', 'a3d7f4', '72cddc', '00aeef'}
_BLACK = {'231f20', '000000'}
ANY = None   # the glyph names the symbol at any colour

# TABLE (CONTRACT, ruling glyph-class-recon C-GCR-1): glyph -> [(colour set or ANY, token), ...].
# A new COLOUR for a known die glyph is added only after reading that die on the render (disclosed in the
# gate with alias, page and hex). A new GLYPH, or a die glyph at a colour in neither family, is a
# vocabulary question for the architect.
TABLE = {
    'π': [(_PURPLE, '[DI]'), (_GREEN, '[AB]')],
    'º': [(_YELLOW, '[PR]'), (_RED, '[CH]'), (_WHITE, '[FO]')],
    '∫': [(_BLUE, '[BO]'), (_BLACK, '[SE]')],
    '≥': [(ANY, '[SU]')],
    '∂': [(ANY, '[FA]')],
    '≤': [(ANY, '[AD]')],
    '∑': [(ANY, '[TH]')],
    '±': [(ANY, '[TR]')],
    'µ': [(ANY, '[DE]')],
    '∏': [(_WHITE, '[LS]'), (_BLACK, '[DS]')],
    'Ω': [(ANY, '[FP]')],
    '\x0e': [(ANY, '[FP]')],
}
TOKENS = ('[AB]', '[PR]', '[DI]', '[CH]', '[BO]', '[SE]', '[FO]', '[SU]', '[FA]', '[AD]', '[TH]', '[TR]',
          '[DE]', '[LS]', '[DS]', '[FP]')


def is_ruled_icon_font(font_name):
    return any(k in (font_name or '') for k in RULED_ICON_FONTS)


def token_for(glyph, hexcolour):
    """The token a (glyph, colour) pair names, or None when TABLE has no row for it."""
    for colours, token in TABLE.get(glyph, ()):
        if colours is ANY or hexcolour in colours:
            return token
    return None


def decode_page(page):
    """(text, token_counts, unknown) for one PyMuPDF page.

    text          the page's text, rebuilt from get_text("dict") with the text-mode flags: each line is
                  its spans concatenated; a line gains "\\n" unless it already ends with one; empty lines
                  are skipped (so a page with no icon span equals page.get_text())
    token_counts  Counter of tokens emitted
    unknown       list of (glyph, hexcolour) icon characters with no TABLE row (emitted verbatim)
    """
    counts = collections.Counter()
    unknown = []
    out = []
    for block in page.get_text('dict', flags=fitz.TEXTFLAGS_TEXT)['blocks']:
        if block.get('type') != 0:
            continue
        for line in block['lines']:
            parts = []
            for span in line['spans']:
                text = span['text']
                if not is_ruled_icon_font(span.get('font')):
                    parts.append(text)
                    continue
                hexcolour = '%06x' % (span.get('color') or 0)
                buf = []
                for ch in text:
                    if ch not in ICON_SET:
                        buf.append(ch)
                    elif ch == '\x00':
                        continue
                    else:
                        tok = token_for(ch, hexcolour)
                        if tok is None:
                            unknown.append((ch, hexcolour))
                            buf.append(ch)
                        else:
                            counts[tok] += 1
                            buf.append(tok)
                parts.append(''.join(buf))
            t = ''.join(parts)
            if t == '':
                continue
            out.append(t if t.endswith('\n') else t + '\n')
    return ''.join(out), counts, unknown


def has_ruled_icon_span(page):
    for block in page.get_text('dict', flags=fitz.TEXTFLAGS_TEXT)['blocks']:
        if block.get('type') != 0:
            continue
        for line in block['lines']:
            for span in line['spans']:
                if is_ruled_icon_font(span.get('font')):
                    return True
    return False
