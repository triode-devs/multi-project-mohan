import { json } from '@sveltejs/kit';
import { getFirebaseData, updateFirebaseData, ensureFirebaseSeeded } from '$lib/firebase.js';

export async function GET() {
	try {
		await ensureFirebaseSeeded();
		const airQuality = (await getFirebaseData('air-quality')) || {};

		const nodesObj = airQuality.nodes || {};
		const zones = Object.values(nodesObj);

		const activeFans = zones.filter(z => z.fanStatus === 'ON').length;
		const poorCount = zones.filter(z => z.status === 'Poor').length;

		// Calculate overall average AQI
		const totalAqi = zones.reduce((sum, z) => sum + (Number(z.aqi) || 0), 0);
		const avgAqi = zones.length > 0 ? Math.round(totalAqi / zones.length) : (airQuality.aqi || 65);

		const category = avgAqi <= 50 ? 'GOOD' : avgAqi <= 100 ? 'MODERATE' : 'POOR';

		return json({
			success: true,
			firebasePath: '/air-quality',
			system: 'Smart Campus Air Monitor',
			summary: {
				avgAqi,
				category,
				totalZones: zones.length,
				activeFans,
				poorZonesCount: poorCount
			},
			metrics: airQuality.metrics || {
				pm25: '11.2 µg/m³',
				co2: '415 ppm',
				temperature: '24.5°C'
			},
			zones
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { zoneId, fanStatus, targetAqi } = body;

		if (!zoneId) {
			return json({ success: false, message: 'Missing zoneId' }, { status: 400 });
		}

		const updatePayload = {};
		if (fanStatus) updatePayload.fanStatus = fanStatus;
		if (targetAqi !== undefined) {
			updatePayload.aqi = Number(targetAqi);
			updatePayload.status = updatePayload.aqi <= 50 ? 'Good' : updatePayload.aqi <= 100 ? 'Moderate' : 'Poor';
		}

		await updateFirebaseData(`air-quality/nodes/${zoneId}`, updatePayload);

		return json({
			success: true,
			firebasePath: `/air-quality/nodes/${zoneId}`,
			message: `Updated Firebase /air-quality/nodes/${zoneId}`,
			updates: updatePayload
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
