/* Runs synchronously in <head>, before first paint. Kept tiny on purpose.
 * 1. Marks the document as JS-capable so reveal styles apply from the very
 *    first frame (otherwise content would flash visible, then hide, then animate).
 * 2. Decides whether the opening intro plays (first visit per session only),
 *    so the overlay is there from the first frame instead of popping in late.
 * 3. Loads the web fonts without blocking rendering: if Google Fonts is slow
 *    or unreachable, the page still renders immediately in the fallback font.
 */
(function (d) {
  var root = d.documentElement;
  root.classList.add('js');

  try {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (d.currentScript && d.currentScript.hasAttribute('data-intro') && !reduce && !sessionStorage.getItem('bp-intro')) {
      root.classList.add('has-intro');
    }
  } catch (e) { /* storage disabled: skip the intro */ }

  var pre = d.getElementById('font-css');
  if (pre) {
    var css = d.createElement('link');
    css.rel = 'stylesheet';
    css.href = pre.href;
    css.media = 'print';
    css.onload = function () { css.media = 'all'; };
    d.head.appendChild(css);
  }
})(document);
