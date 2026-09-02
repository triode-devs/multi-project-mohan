import { json } from '@sveltejs/kit';
import { getFirebaseData, updateFirebaseData } from '$lib/firebase.js';

/**
 * ESP32 Endpoint: Relative Weight Delta Change
 * Accepts RFID tag UID and relative weight change (+/- delta in grams).
 * Example: -10g when 1 tablet is removed, +20g when 2 tablets are added.
 */
export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const tagUid = String(body.tagUid || body.rfid || body.id || '').trim();
		const deltaWeight = Number(body.deltaWeightGrams ?? body.weightDelta ?? body.deltaWeight ?? 0);

		if (!tagUid) {
			return json({
				success: false,
				error: 'Missing required tagUid or rfid parameter'
			}, { status: 400 });
		}

		// Fetch existing product from Firebase
		const existingItem = await getFirebaseData(`medicine/data/${tagUid}`);
		if (!existingItem || !existingItem.name) {
			return json({
				success: false,
				error: `Product with RFID tag ${tagUid} does not exist in inventory yet. Use /api/esp/medicine/stock to create it first.`
			}, { status: 404 });
		}

		const oldWeight = Number(existingItem.weightGrams || 0);
		const oldCount = Number(existingItem.count || 0);
		const unitWeight = Number(existingItem.unitWeightGrams || 10);

		// Calculate new total weight and unit count
		const newWeight = Math.max(0, oldWeight + deltaWeight);
		const newCount = Math.max(0, Math.round(newWeight / unitWeight));
		const deltaUnits = newCount - oldCount;

		const now = new Date();
		const expiryDate = existingItem.expiry ? new Date(existingItem.expiry) : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
		
		let status = 'Fresh';
		if (expiryDate < now) {
			status = 'Expired';
		} else if (newCount === 0) {
			status = 'Out of Stock';
		} else if (newCount <= 2) {
			status = 'Low Stock';
		}

		const updatedProduct = {
			...existingItem,
			count: newCount,
			weightGrams: newWeight,
			lastDeltaWeight: deltaWeight,
			lastDeltaUnits: deltaUnits,
			status,
			lastUpdated: now.toISOString()
		};

		// Save to Firebase Realtime Database
		await updateFirebaseData(`medicine/data/${tagUid}`, updatedProduct);

		// Record ESP32 Delta Log in Firebase /medicine/logs
		const logId = `log-${Date.now()}`;
		const deltaLog = {
			id: logId,
			tagUid,
			time: new Date().toLocaleTimeString(),
			level: deltaWeight < 0 ? 'WARNING' : 'INFO',
			type: 'ESP32 Delta Wt',
			text: `ESP32 Delta (${tagUid}): ${existingItem.name} weight ${deltaWeight >= 0 ? '+' : ''}${deltaWeight}g delta. New count: ${newCount} units`
		};
		await updateFirebaseData(`medicine/logs/${logId}`, deltaLog);

		return json({
			success: true,
			action: deltaWeight < 0 ? 'REDUCED' : (deltaWeight > 0 ? 'INCREASED' : 'NO_CHANGE'),
			firebasePath: `/medicine/data/${tagUid}`,
			summary: {
				deltaWeightGrams: deltaWeight,
				newTotalWeightGrams: newWeight,
				newTotalUnits: newCount,
				unitsChange: deltaUnits
			},
			message: deltaWeight < 0
				? `${Math.abs(deltaWeight)}g reduced. New stock: ${newCount} units (${newWeight}g remaining)`
				: `${deltaWeight}g added. New stock: ${newCount} units (${newWeight}g total)`,
			product: updatedProduct,
			log: deltaLog
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
