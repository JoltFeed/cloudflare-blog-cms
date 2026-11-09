const FALLBACK_IMG = "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80";

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getState(request, env) {
  if (globalThis.__BLOG_STATE__) {
    return globalThis.__BLOG_STATE__;
  }
  try {
    const cache = caches.default;
    const cacheKey = new URL('/api/state-cache', request.url).href;
    const cachedResp = await cache.match(cacheKey);
    if (cachedResp) {
      const state = await cachedResp.json();
      globalThis.__BLOG_STATE__ = state;
      return state;
    }
  } catch (e) {}

  let posts = [];
  try {
    const postsResp = await env.ASSETS.fetch(new URL('/posts.json', request.url));
    if (postsResp.ok) {
      posts = await postsResp.json();
    }
  } catch (e) {}

  let config = {};
  try {
    const configResp = await env.ASSETS.fetch(new URL('/config.json', request.url));
    if (configResp.ok) {
      config = await configResp.json();
    }
  } catch (e) {}

  const state = { posts, config };
  globalThis.__BLOG_STATE__ = state;
  return state;
}

function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/og-image/')) {
      const state = await getState(request, env);
      const postId = url.pathname.replace('/og-image/', '').replace('.jpg', '');
      const post = (state.posts || []).find(p => String(p.id) === String(postId)) || (state.posts || [])[0];
      const imgData = post ? (post.image || post.featured_image || post.featuredImage || post.img) : null;
      if (imgData && imgData.startsWith('data:image/')) {
        const base64Data = imgData.split(',')[1];
        if (base64Data) {
          const buffer = base64ToUint8Array(base64Data);
          return new Response(buffer, {
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'public, max-age=86400'
            }
          });
        }
      }
      return Response.redirect(FALLBACK_IMG, 302);
    }

    if (url.pathname === '/api/state') {
      const state = await getState(request, env);
      return new Response(JSON.stringify(state), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html') || request.headers.get('accept')?.includes('text/html')) {
      const state = await getState(request, env);
      const posts = state.posts || [];
      const postId = url.searchParams.get('post') || url.searchParams.get('id');

      let post = null;
      if (postId) {
        post = posts.find(p => String(p.id) === String(postId));
      }
      if (!post && posts.length > 0) {
        post = posts[0];
      }

      const qTitle = url.searchParams.get('og_title') || url.searchParams.get('t');
      const qDesc = url.searchParams.get('og_desc') || url.searchParams.get('d');
      const qImg = url.searchParams.get('og_img') || url.searchParams.get('img');

      const title = qTitle || (post ? (post.title || post.name) : '') || 'Cloudflare Blog CMS';
      const desc = qDesc || (post ? (post.excerpt || post.description || post.summary || post.content) : '') || 'Modern blog CMS hosted on Cloudflare Workers & Pages.';
      let rawImg = qImg || (post ? (post.image || post.featured_image || post.featuredImage || post.img) : '') || FALLBACK_IMG;

      let ogImage = rawImg;
      if (rawImg.startsWith('data:image/')) {
        const pId = (post && post.id) ? post.id : (postId || 'default');
        ogImage = new URL('/og-image/' + pId + '.jpg', request.url).href;
      } else if (rawImg.startsWith('/')) {
        ogImage = new URL(rawImg, request.url).href;
      }

      let html = await response.text();

      html = html.replace(/<meta\s+(?:property|name)=["'](?:og:|twitter:)[^"']*["'][^>]*>/gi, '');

      const metaTags = `
    <meta property="og:url" content="${escapeHtml(request.url)}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(desc)}">
    <meta property="og:image" content="${escapeHtml(ogImage)}">
    <meta property="og:image:secure_url" content="${escapeHtml(ogImage)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(desc)}">
    <meta name="twitter:image" content="${escapeHtml(ogImage)}">
`;

      html = html.replace(/<head>/i, '<head>' + metaTags);

      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    return response;
  }
};
