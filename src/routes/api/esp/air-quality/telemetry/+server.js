import { json } from '@sveltejs/kit';
import { updateFirebaseData } from '$lib/firebase.js';

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { nodeId, location, type, pm25, co2, no2, co, temp, hum } = body;

		const id = nodeId || `NODE-0${Math.floor(Math.random() * 4) + 1}`;
		const loc = location || 'Campus Main Block';

		const p25 = Number(pm25) || 15;
		const carbon = Number(co2) || 450;
		const n2 = Number(no2) || 15;

		// Calculate AQI score from dust and CO2
		const calculatedAqi = Math.max(Math.round(p25 * 1.5), Math.round(carbon / 10));
		
		let status = 'Good';
		if (calculatedAqi > 100 || carbon > 1000) {
			status = 'Poor';
		} else if (calculatedAqi > 50) {
			status = 'Moderate';
		}

		// Automatic Exhaust Ventilation Fan Control (PPTX Slide 11 requirement)
		const fanStatus = (status === 'Poor' || carbon > 1000) ? 'ON' : 'OFF';

		const nodeData = {
			id,
			nodeId: id,
			location: loc,
			type: type || 'Indoor',
			aqi: calculatedAqi,
			co2: carbon,
			pm25: p25,
			no2: n2,
			co: Number(co) || 1.0,
			status,
			fanStatus,
			updatedAt: new Date().toISOString()
		};

		// Save to Firebase Realtime Database at /air-quality/nodes/{id}
		await updateFirebaseData(`air-quality/nodes/${id}`, nodeData);

		return json({
			success: true,
			firebasePath: `/air-quality/nodes/${id}`,
			message: 'ESP32 Air Quality & Carbon emission telemetry saved to Firebase /air-quality',
			nodeData
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
