// Cloudflare Pages middleware — runs before static assets are served.
//
// The repo root is the deploy root and there is no build step, so every
// committed file is uploaded and served. `_redirects` cannot help here:
// when a static file exists at the requested path, Pages serves the file
// and redirect rules never run. Middleware is the only layer that gets to
// intercept first.

const BLOCKED = ['/.claude/', '/.git/', '/.github/'];

export async function onRequest({ request, next }) {
  const { pathname } = new URL(request.url);

  if (BLOCKED.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return next();
}
