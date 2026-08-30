import medicineHtml from '../../../static/medicine.html?raw';
import forestHtml from '../../../static/forest.html?raw';
import airQualityHtml from '../../../static/air quality.html?raw';

/**
 * Maps route keys to bundled HTML contents
 */
const HTML_CONTENT_MAP = {
	medicine: medicineHtml,
	forest: forestHtml,
	'air-quality': airQualityHtml
};

/**
 * Maps route aliases to standard keys
 */
const ROUTE_ALIASES = {
	medicine: 'medicine',
	forest: 'forest',
	'air-quality': 'air-quality',
	airquality: 'air-quality',
	'air quality': 'air-quality'
};

/**
 * Determines the target route key ('medicine' | 'forest' | 'air-quality' | null)
 * from host (subdomain) or pathname.
 *
 * Subdomain takes priority over pathname.
 */
export function resolveTargetRoute(host, pathname) {
	if (host) {
		// Clean hostname (remove port if present, e.g., "medicine.localhost:5173" -> "medicine.localhost")
		const hostname = host.split(':')[0].toLowerCase();
		const parts = hostname.split('.');

		// If there is a subdomain (e.g., medicine.localhost, medicine.zeroes.co.in)
		if (parts.length > 1) {
			const subdomain = parts[0];
			if (ROUTE_ALIASES[subdomain]) {
				return ROUTE_ALIASES[subdomain];
			}
		}
	}

	if (pathname) {
		// Clean pathname (e.g., "/medicine", "/air-quality", "/air%20quality")
		const cleanPath = decodeURIComponent(pathname.trim()).replace(/^\/+|\/+$/g, '').toLowerCase();
		if (ROUTE_ALIASES[cleanPath]) {
			return ROUTE_ALIASES[cleanPath];
		}
	}

	return null;
}

/**
 * Returns the HTML string content for a resolved route key.
 */
export function getHtmlForRoute(routeKey) {
	if (!routeKey || !HTML_CONTENT_MAP[routeKey]) {
		return null;
	}
	return HTML_CONTENT_MAP[routeKey];
}
