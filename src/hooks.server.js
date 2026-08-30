import { resolveTargetRoute, getHtmlForRoute } from '$lib/server/routes-helper.js';

export async function handle({ event, resolve }) {
	const { url, request } = event;
	const host = request.headers.get('host') || url.host;

	// Allow API routes to be handled by SvelteKit endpoint handlers
	if (url.pathname.startsWith('/api')) {
		return resolve(event);
	}

	// Pass through specific static asset requests like robots.txt or favicon
	if (url.pathname === '/robots.txt' || url.pathname === '/favicon.ico') {
		return resolve(event);
	}

	// Resolve route based on subdomain (first priority) or pathname (second priority)
	const routeKey = resolveTargetRoute(host, url.pathname);

	if (routeKey) {
		const html = getHtmlForRoute(routeKey);
		if (html) {
			return new Response(html, {
				status: 200,
				headers: {
					'content-type': 'text/html; charset=utf-8'
				}
			});
		}
	}

	// Requirement: "if nothing matchs the routes page must be empty"
	return new Response('<!DOCTYPE html><html><head><title>Empty Route</title></head><body></body></html>', {
		status: 200,
		headers: {
			'content-type': 'text/html; charset=utf-8'
		}
	});
}
