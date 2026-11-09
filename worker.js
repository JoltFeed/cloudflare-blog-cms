const defaultConfig = {
  adminUsername: "admin",
  adminPassword: "123",
  enableBeforeTitle: false,
  adBeforeTitle: "",
  enableUnderImage: false,
  adUnderImage: "",
  enableBeforeParagraph: false,
  adBeforeParagraph: "",
  enablePara30: false,
  adPara30: "",
  enablePara60: false,
  adPara60: "",
  enablePara80: false,
  adPara80: "",
  enableAfterPost: false,
  adAfterPost: "",
  enablePopupAd: false,
  adPopupAd: "",
  popupDelaySeconds: 3,
  enableHeaderCode: false,
  customHeaderCode: "",
  enableAnalytics: false,
  analyticsCode: ""
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function base64ToUint8Array(base64Str) {
  const base64 = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

const FALLBACK_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

async function getState(request, env) {
  if (globalThis.__BLOG_STATE__) {
    return globalThis.__BLOG_STATE__;
  }
  const cache = caches.default;
  const stateUrl = new URL('/__internal_blog_state__', request.url);
  try {
    const cached = await cache.match(stateUrl);
    if (cached) {
      const data = await cached.json();
      globalThis.__BLOG_STATE__ = data;
      return data;
    }
  } catch (e) {}

  let posts = [];
  try {
    const postsReq = new Request(new URL('/posts.json', request.url));
    const postsRes = await env.ASSETS.fetch(postsReq);
    if (postsRes.ok) {
      posts = await postsRes.json();
    }
  } catch (e) {}

  const state = { posts, config: defaultConfig };
  globalThis.__BLOG_STATE__ = state;
  return state;
}

class MetaRewriter {
  constructor(metaHtml, customHeaderCode, analyticsCode) {
    this.metaHtml = metaHtml;
    this.customHeaderCode = customHeaderCode;
    this.analyticsCode = analyticsCode;
  }
  element(element) {
    let toInject = this.metaHtml;
    if (this.customHeaderCode) {
      toInject += '\n' + this.customHeaderCode;
    }
    if (this.analyticsCode) {
      toInject += '\n' + this.analyticsCode;
    }
    element.prepend(toInject, { html: true });
  }
}

class MetaRemover {
  element(element) {
    element.remove();
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/save' && request.method === 'POST') {
      try {
        const body = await request.json();
        const posts = body.posts || [];
        const config = body.config || defaultConfig;
        const state = { posts, config };
        globalThis.__BLOG_STATE__ = state;

        const cache = caches.default;
        const stateUrl = new URL('/__internal_blog_state__', request.url);
        await cache.put(stateUrl, new Response(JSON.stringify(state), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=31536000'
          }
        }));

        for (const post of posts) {
          const img = post.image || post.featured_image || post.featuredImage;
          if (img && typeof img === 'string' && img.startsWith('data:image/')) {
            try {
              const bytes = base64ToUint8Array(img);
              const imgCacheUrl = new URL(`/og-image/${post.id}.jpg`, request.url);
              await cache.put(imgCacheUrl, new Response(bytes, {
                headers: {
                  'Content-Type': 'image/jpeg',
                  'Cache-Control': 'public, max-age=31536000'
                }
              }));
            } catch (e) {}
          }
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/api/state' && request.method === 'GET') {
      const state = await getState(request, env);
      return new Response(JSON.stringify(state), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      });
    }

    if (url.pathname.startsWith('/og-image/')) {
      const cache = caches.default;
      const cached = await cache.match(request.url);
      if (cached) return cached;

      const match = url.pathname.match(/\/og-image\/([^.\/]+)/);
      const postId = match ? match[1] : null;

      const state = await getState(request, env);
      const post = (state.posts || []).find(p => String(p.id) === String(postId));
      const img = post ? (post.image || post.featured_image || post.featuredImage) : null;

      if (img && typeof img === 'string') {
        if (img.startsWith('data:image/')) {
          const bytes = base64ToUint8Array(img);
          const res = new Response(bytes, {
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'public, max-age=31536000'
            }
          });
          await cache.put(request.url, res.clone());
          return res;
        } else if (img.startsWith('http://') || img.startsWith('https://')) {
          return Response.redirect(img, 302);
        }
      }

      const fallbackBytes = base64ToUint8Array(FALLBACK_JPEG_BASE64);
      return new Response(fallbackBytes, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    let assetReq = request;
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      assetReq = new Request(new URL('/index.html', request.url), request);
    }

    const response = await env.ASSETS.fetch(assetReq);
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      const state = await getState(request, env);
      const postId = url.searchParams.get('post') || url.searchParams.get('id');
      const post = (state.posts || []).find(p => String(p.id) === String(postId));

      let title = post ? post.title : (url.searchParams.get('og_title') || 'Cloudflare Blog CMS');
      let desc = post
        ? (post.excerpt || (post.content ? post.content.replace(/<[^>]*>/g, '').slice(0, 160) : ''))
        : (url.searchParams.get('og_desc') || 'High performance serverless blog powered by Cloudflare Workers.');
      let rawImg = post ? (post.image || post.featured_image || post.featuredImage) : url.searchParams.get('og_img');

      let ogImage = '';
      if (post && rawImg && rawImg.startsWith('data:image/')) {
        ogImage = new URL(`/og-image/${post.id}.jpg`, request.url).href;
      } else if (rawImg && (rawImg.startsWith('http://') || rawImg.startsWith('https://'))) {
        ogImage = rawImg;
      } else if (rawImg && rawImg.startsWith('/')) {
        ogImage = new URL(rawImg, request.url).href;
      } else {
        ogImage = new URL(`/og-image/${postId || 'default'}.jpg`, request.url).href;
      }

      const metaHtml = `
        <meta property="og:type" content="article">
        <meta property="og:url" content="${escapeHtml(request.url)}">
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
      `.trim();

      const customHeaderCode = (state.config && state.config.enableHeaderCode && state.config.customHeaderCode) ? state.config.customHeaderCode : '';
      const analyticsCode = (state.config && state.config.enableAnalytics && state.config.analyticsCode) ? state.config.analyticsCode : '';

      const rewriter = new HTMLRewriter()
        .on('meta[property^="og:"]', new MetaRemover())
        .on('meta[name^="twitter:"]', new MetaRemover())
        .on('head', new MetaRewriter(metaHtml, customHeaderCode, analyticsCode));

      return rewriter.transform(response);
    }

    return response;
  }
};
