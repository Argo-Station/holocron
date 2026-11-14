/**
 * desktopLayout.jsx — the three reusable desktop LAYOUT PRIMITIVES (F-46; ruling
 * desktop-curation-program §3 T0b, amended by A4). Built like ui.jsx → window.SWRPGDesktop;
 * loaded after vendor.js (React) and before the app bundle.
 *
 * A4 — ROTATION-STABILITY LAW (binds every D-lap): every primitive is ALWAYS MOUNTED. A mode flip
 * (tablet rotation, window resize, zoom crossing 1024) changes STYLE VALUES only, never the element
 * tree's shape — so a flip is a pure restyle, not a remount, and in-flight keystrokes/scroll
 * survive. Each primitive therefore renders the SAME children at the SAME tree position in both
 * modes; only geometry changes. Composition only — no style injected INTO children.
 */
(function (root) {
  var React = root.React;
  function h() { return React.createElement.apply(React, arguments); }

  // useLayoutMode — THE one hook for the resolved layout mode ('mobile'|'desktop'). Shared home so
  // app.jsx AND the shared kernels (store, NPC) all subscribe identically; re-renders on a mode flip
  // (A4: the consumer keeps its tree and only restyles). Reads window.SWRPGLayout.
  function useLayoutMode() {
    var _u = React.useState(function () {
      return (root.SWRPGLayout ? root.SWRPGLayout.mode() : 'mobile');
    });
    var m = _u[0], setM = _u[1];
    React.useEffect(function () {
      if (!root.SWRPGLayout) return;
      var on = function () { setM(root.SWRPGLayout.mode()); };
      on();
      root.addEventListener('swrpg-layout-changed', on);
      return function () { root.removeEventListener('swrpg-layout-changed', on); };
    }, []);
    return m;
  }

  // CenterColumn — a flex-COLUMN wrapper that fills its parent's height (every player screen is a
  // `flex-direction:column` shell) and centers its children horizontally at `max` on desktop;
  // PASS-THROUGH (no width cap) on mobile. Always mounted: the wrapper div exists in both modes;
  // `mode` flips maxWidth only, never the tree — so a mode flip is a pure restyle (A4).
  function CenterColumn(props) {
    var isDesk = props.mode === 'desktop';
    var max = props.max || 'var(--desk-read-max)';
    return h('div', {
      'data-desk-center': isDesk ? '1' : '0',  // smoke hook: the desktop content-column width
      style: {
        display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0,
        width: '100%', margin: '0 auto',
        maxWidth: isDesk ? max : 'none',
      },
    }, props.children);
  }

  // SplitPane — rail + detail side by side on desktop; on mobile the rail is display:none and the
  // detail fills — the SAME detail child at the SAME tree position (the rail is additive beside it,
  // never a swap). Both panes own their scroll; the page never double-scrolls. (Used from D2.)
  function SplitPane(props) {
    var isDesk = props.mode === 'desktop';
    var railWidth = props.railWidth || 'var(--desk-rail-w)';
    var detailMax = props.detailMax || null;
    // The detailMax cap wrapper is ALSO a positioning context (relative + full height) so an
    // absolute-inset detail screen fills the CAPPED column, not the whole pane.
    var detail = (isDesk && detailMax)
      ? h('div', { style: { maxWidth: detailMax, width: '100%', height: '100%', margin: '0 auto', position: 'relative' } }, props.detail)
      : props.detail;
    // Panes are positioning contexts (position:relative) so an `position:absolute; inset:0` child
    // screen — the app's immersive full-bleed idiom — fills its PANE, not the viewport.
    // A COLLAPSED RAIL DRAWS NO BORDER. Callers collapse the rail by passing railWidth "0px" — the
    // sheet does it for table mode, the creator's species step does it for the phone's detail view
    // — and the divider was still painting, leaving a 1px sliver hanging at the edge of a pane that
    // is supposed to be gone. Found by a species-step assert that read the collapsed rail's text
    // and was RIGHT to see something there. Fixed in the primitive because both consumers had it.
    var railCollapsed = !isDesk || railWidth === 0 || railWidth === '0' || railWidth === '0px';
    // D1 measurement hooks (ruling `creator-desktop-wide-and-fit-concept`): `data-` attributes only,
    // no geometry change and NOT the D2 fix. The primitive is shared by species, career, the mechanic
    // step and the sheet, so one pair of hooks serves every consumer's assert — including D2's gutter
    // check, which the ruling requires on all three creator consumers rather than the one opened.
    // D2 — THE PANES GET A GUTTER. They were separated by a one-pixel border and nothing else, so
    // a species portrait and its stat block sat flush against the list beside them. `--desk-gutter`
    // (24px) exists for exactly this and was used by nothing. Applied HERE, in the primitive, so
    // every consumer gets it at once — species, career, the mechanic step and the sheet's table
    // mode — rather than three copies that can disagree. Collapsed rail = no gutter: a gap beside a
    // pane that is not there is the same sliver defect the border already taught this file.
    return h('div', { 'data-splitpane': '1', style: { display: 'flex', height: '100%',
      columnGap: (isDesk && !railCollapsed) ? 'var(--desk-gutter)' : 0 } },
      h('div', { 'data-splitpane-rail': '1', style: {
        position: 'relative',
        width: isDesk ? railWidth : 0, flexShrink: 0,
        display: railCollapsed ? 'none' : 'block',
        overflowY: 'auto',
        borderRight: railCollapsed ? 'none' : '1px solid rgba(255,255,255,0.08)',
      } }, props.rail),
      h('div', { 'data-splitpane-detail': '1', style: { position: 'relative', flex: 1, minWidth: 0, overflowY: 'auto' } }, detail)
    );
  }

  // WorkspaceGrid — 3-col (or 2-col when `right` absent) grid on desktop; single column on mobile.
  // RESERVED for the D-C1 GM-workspace concept — no lap consumes it until that concept is ruled.
  function WorkspaceGrid(props) {
    var isDesk = props.mode === 'desktop';
    var cols = props.right
      ? 'minmax(280px,1fr) minmax(560px,2fr) minmax(280px,1fr)'
      : 'minmax(280px,1fr) minmax(560px,2fr)';
    return h('div', {
      style: isDesk
        ? { display: 'grid', gridTemplateColumns: cols, height: '100%', gap: 'var(--desk-gutter)' }
        : { display: 'block', height: '100%' },
    }, props.left, props.main, props.right || null);
  }

  var api = { useLayoutMode: useLayoutMode, CenterColumn: CenterColumn, SplitPane: SplitPane, WorkspaceGrid: WorkspaceGrid };
  if (typeof root !== 'undefined') root.SWRPGDesktop = api;
})(typeof window !== 'undefined' ? window : this);
