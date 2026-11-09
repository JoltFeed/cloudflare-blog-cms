export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);

    if (url.searchParams.has('post')) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        let ogTitle = url.searchParams.get('og_title');
        let ogDesc = url.searchParams.get('og_desc');
        let ogImg = url.searchParams.get('og_img');

        if (!ogTitle || !ogDesc || !ogImg) {
          try {
            const postId = url.searchParams.get('post');
            const postsReq = new Request(new URL('/posts.json', request.url));
            const postsRes = await env.ASSETS.fetch(postsReq);
            if (postsRes.ok) {
              const posts = await postsRes.json();
              const post = posts.find(p => String(p.id) === String(postId));
              if (post) {
                if (!ogTitle) ogTitle = post.title || '';
                if (!ogDesc) ogDesc = post.excerpt || (post.content ? post.content.replace(/<[^>]*>/g, '').slice(0, 160) : '');
                if (!ogImg) ogImg = post.featured_image || post.featuredImage || '';
              }
            }
          } catch (e) {}
        }

        let rewriter = new HTMLRewriter();
        if (ogTitle) {
          rewriter = rewriter
            .on('meta[property="og:title"]', { element(e) { e.setAttribute('content', ogTitle); } })
            .on('meta[name="twitter:title"]', { element(e) { e.setAttribute('content', ogTitle); } });
        }
        if (ogDesc) {
          rewriter = rewriter
            .on('meta[property="og:description"]', { element(e) { e.setAttribute('content', ogDesc); } })
            .on('meta[name="twitter:description"]', { element(e) { e.setAttribute('content', ogDesc); } });
        }
        if (ogImg) {
          rewriter = rewriter
            .on('meta[property="og:image"]', { element(e) { e.setAttribute('content', ogImg); } })
            .on('meta[name="twitter:image"]', { element(e) { e.setAttribute('content', ogImg); } });
        }
        return rewriter.transform(response);
      }
    }
    return response;
  }
};
