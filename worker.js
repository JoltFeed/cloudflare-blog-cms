const JSONBLOB_ID = '1346083893630230528';
const JSONBLOB_URL = `https://jsonblob.com/api/jsonBlob/${JSONBLOB_ID}`;
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80';
const JSONBLOB_ID = '1346083893630230528';
const JSONBLOB_URL = `https://jsonblob.com/api/jsonBlob/${JSONBLOB_ID}`;
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadServerState(env, request) {
  if (globalThis.__BLOG_STATE__) return globalThis.__BLOG_STATE__;

  const cacheKey = new URL('/__internal_state_v4__', request.url).href;
  try {
    const cache = caches.default;
    const cachedResp = await cache.match(cacheKey);
    if (cachedResp) {
      const state = await cachedResp.json();
      if (state && (state.posts || state.config)) {
        globalThis.__BLOG_STATE__ = state;
        return state;
      }
    }
  } catch (e) {}

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(JSONBLOB_URL, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const state = await resp.json();
      if (state && (state.posts || state.config)) {
        globalThis.__BLOG_STATE__ = state;
        try {
          const cache = caches.default;
          await cache.put(cacheKey, new Response(JSON.stringify(state), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' }
          }));
        } catch (e) {}
        return state;
      }
    }
  } catch (e) {}

  return null;
}

async function saveServerState(state, request) {
  if (!state) return;
  globalThis.__BLOG_STATE__ = state;

  try {
    const cacheKey = new URL('/__internal_state_v4__', request.url).href;
    const cache = caches.default;
    await cache.put(cacheKey, new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' }
    }));
  } catch (e) {}

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    let resp = await fetch(JSONBLOB_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(state),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 3000);
      await fetch('https://jsonblob.com/api/jsonBlob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(state),
        signal: controller2.signal
      });
      clearTimeout(timeoutId2);
    }
  } catch (e) {}
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/state') {
      const state = await loadServerState(env, request);
      return new Response(JSON.stringify(state || {}), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (url.pathname === '/api/save' && request.method === 'POST') {
      try {
        const body = await request.json();
        await saveServerState(body, request);
      } catch (e) {}
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html') || request.headers.get('accept')?.includes('text/html')) {
      const state = await loadServerState(env, request);
      const posts = state?.posts || [];
      const config = state?.config || {};

      const postId = url.searchParams.get('p') || url.searchParams.get('post') || url.searchParams.get('id');
      let post = null;
      if (postId) {
        post = posts.find(p => String(p.id) === String(postId));
      }

      const title = post ? (post.title || post.name || '') : (config.siteTitle || 'Cloudflare Blog CMS');
      const desc = post ? (post.excerpt || post.description || post.summary || post.content || '') : (config.siteDescription || '');

      let ogImage = FALLBACK_IMG;
      if (post) {
        const rawImg = post.image || post.featured_image || post.featuredImage || post.img;
        if (rawImg && rawImg.startsWith('data:')) {
          ogImage = `${url.origin}/og-image/${post.id}.jpg`;
        } else if (rawImg && (rawImg.startsWith('http://') || rawImg.startsWith('https://'))) {
          ogImage = rawImg;
        }
      }

      let html = await response.text();

      const ogMetaTags = `
<meta property="og:type" content="article" />
<meta property="og:url" content="${escapeHtml(request.url)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:secure_url" content="${escapeHtml(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />
<script>window.__INITIAL_STATE__ = ${JSON.stringify(state || {})};</script>
`;

      let customHeader = '';
      if (config.customHeaderCode && config.enableHeaderCode !== false) {
        customHeader += '\n' + config.customHeaderCode;
      }
      if (config.analyticsCode && config.enableAnalytics !== false) {
        customHeader += '\n' + config.analyticsCode;
      }

      const injection = ogMetaTags + '\n' + customHeader;
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${injection}\n</head>`);
      } else {
        html = injection + html;
      }

      return new Response(html, {
        status: response.status,
        headers: response.headers
      });
    }

    return response;
  }
};
async function loadServerState(env, request) {
  if (globalThis.__BLOG_STATE__) {
    return globalThis.__BLOG_STATE__;
  }

  const cacheKey = new URL('/__internal_state_v4__', request.url).href;
  try {
    const cache = caches.default;
    const cachedResp = await cache.match(cacheKey);
    if (cachedResp) {
      const state = await cachedResp.json();
      if (state && (state.posts || state.config)) {
        globalThis.__BLOG_STATE__ = state;
        return state;
      }
    }
  } catch (e) {}

  try {
    const resp = await fetch(JSONBLOB_URL, {
      headers: { 'Accept': 'application/json' }
    });
    if (resp.ok) {
      const state = await resp.json();
      if (state && (state.posts || state.config)) {
        globalThis.__BLOG_STATE__ = state;
        try {
          const cache = caches.default;
          await cache.put(cacheKey, new Response(JSON.stringify(state), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' }
          }));
        } catch (e) {}
        return state;
      }
    }
  } catch (e) {}

  let posts = [];
  try {
    const postsResp = await env.ASSETS.fetch(new URL('/posts.json', request.url));
    if (postsResp.ok) posts = await postsResp.json();
  } catch (e) {}

  let config = {};
  try {
    const configResp = await env.ASSETS.fetch(new URL('/config.json', request.url));
    if (configResp.ok) config = await configResp.json();
  } catch (e) {}

  const state = { posts: posts || [], config: config || {} };
  globalThis.__BLOG_STATE__ = state;
  return state;
}

async function saveServerState(state, request) {
  globalThis.__BLOG_STATE__ = state;
  const cacheKey = new URL('/__internal_state_v4__', request.url).href;
  try {
    const cache = caches.default;
    await cache.put(cacheKey, new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' }
    }));
  } catch (e) {}

  try {
    let res = await fetch(JSONBLOB_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(state)
    });
    if (!res.ok) {
      res = await fetch('https://jsonblob.com/api/jsonBlob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(state)
      });
    }
  } catch (e) {}
}

function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/state') {
      const state = await loadServerState(env, request);
      return new Response(JSON.stringify(state), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (url.pathname === '/api/save' && request.method === 'POST') {
      try {
        const body = await request.json();
        await saveServerState(body, request);
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (url.pathname.startsWith('/og-image/')) {
      const state = await loadServerState(env, request);
      const filename = url.pathname.replace('/og-image/', '');
      const postId = filename.replace(/\.jpg$/, '').replace(/\.png$/, '');
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
      } else if (imgData && (imgData.startsWith('http://') || imgData.startsWith('https://'))) {
        return Response.redirect(imgData, 302);
      }
      return Response.redirect(FALLBACK_IMG, 302);
    }

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html') || request.headers.get('accept')?.includes('text/html')) {
      const state = await loadServerState(env, request);
      const posts = state.posts || [];
      const config = state.config || {};

      const postId = url.searchParams.get('p') || url.searchParams.get('post') || url.searchParams.get('id');

      let post = null;
      if (postId) {
        post = posts.find(p => String(p.id) === String(postId));
      }

      const title = post ? (post.title || post.name || '') : (config.siteTitle || 'Cloudflare Blog CMS');
      const desc = post ? (post.excerpt || post.description || post.summary || post.content || '') : (config.siteDesc || 'Modern blog CMS hosted on Cloudflare Workers & Pages.');

      let ogImage = FALLBACK_IMG;
      if (post) {
        const rawImg = post.image || post.featured_image || post.featuredImage || post.img;
        if (rawImg && rawImg.startsWith('data:')) {
          ogImage = `${url.origin}/og-image/${post.id}.jpg`;
        } else if (rawImg && (rawImg.startsWith('http://') || rawImg.startsWith('https://'))) {
          ogImage = rawImg;
        }
      }

      let html = await response.text();

      const ogMetaTags = `
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(request.url)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(desc)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(desc)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
    <script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script>
      `;

      let customHeader = '';
      if (config.customHeaderCode && config.enableHeaderCode !== false) {
        customHeader += '\n' + config.customHeaderCode;
      }
      if (config.analyticsCode && config.enableAnalytics !== false) {
        customHeader += '\n' + config.analyticsCode;
      }

      const injection = ogMetaTags + '\n' + customHeader;
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${injection}\n</head>`);
      } else {
        html = injection + html;
      }

      return new Response(html, {
        status: response.status,
        headers: response.headers
      });
    }

    return response;
  }
};
