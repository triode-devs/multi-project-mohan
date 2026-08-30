import { json } from '@sveltejs/kit';
import { getFirebaseData, ensureFirebaseSeeded } from '$lib/firebase.js';

export async function GET() {
	try {
		await ensureFirebaseSeeded();
		const forest = (await getFirebaseData('forest')) || {};

		const status = forest.status || {
			hazardLevel: 'MODERATE',
			activeRangers: 8,
			sensorsOnline: 42,
			totalSensors: 45
		};

		const nodesObj = forest.nodes || {};
		const nodes = Object.values(nodesObj);

		const alertsObj = forest.alerts || {};
		const alerts = Object.values(alertsObj);

		return json({
			success: true,
			firebasePath: '/forest',
			system: 'ForestGuard Protection System',
			status,
			nodes,
			alerts
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { action, nodeId, hazardType, zone } = body;

		if (action === 'dispatch') {
			const alertId = `fa-${Date.now()}`;
			const dispatchAlert = {
				id: alertId,
				nodeId: nodeId || 'ESP-N01',
				zone: zone || 'North Ridge',
				hazardType: hazardType || 'Ranger Patrol Dispatched',
				severity: 'HIGH',
				status: 'Dispatched Patrol',
				createdAt: new Date().toISOString()
			};

			const { updateFirebaseData } = await import('$lib/firebase.js');
			await updateFirebaseData(`forest/alerts/${alertId}`, dispatchAlert);

			return json({
				success: true,
				firebasePath: `/forest/alerts/${alertId}`,
				message: 'Ranger patrol dispatched and recorded in Firebase /forest',
				alert: dispatchAlert
			});
		}

		return json({ success: false, message: 'Invalid action' }, { status: 400 });
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
