import { json } from '@sveltejs/kit';
import { getFirebaseData, updateFirebaseData } from '$lib/firebase.js';

/**
 * ESP32 Endpoint: Product Creation & Stock Level Updates
 * Integrates MFRC522 RFID reader with HX711 Load Cell weight sensor.
 * Target Path in Firebase: /medicine/data/{tagUid}
 */
export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const tagUid = String(body.tagUid || body.rfid || body.id || '').trim();
		const { name, type, expiry, count, stockType } = body;
		
		const weightProvided = body.weightGrams !== undefined || body.currentWeight !== undefined || body.weight !== undefined;
		const measuredWeight = weightProvided ? Number(body.weightGrams ?? body.currentWeight ?? body.weight ?? 0) : null;
		const singleUnitWeight = Number(body.unitWeightGrams || 0);

		if (!tagUid) {
			return json({
				success: false,
				error: 'Missing required tagUid or rfid parameter from ESP32 RFID reader'
			}, { status: 400 });
		}

		// Fetch existing product record from Firebase if it exists
		const existingFirebaseData = await getFirebaseData(`medicine/data/${tagUid}`);
		const isNewProduct = !existingFirebaseData || !existingFirebaseData.name;

		const oldWeight = Number(existingFirebaseData?.weightGrams || 0);
		const oldCount = Number(existingFirebaseData?.count || 0);
		const unitWeight = singleUnitWeight || Number(existingFirebaseData?.unitWeightGrams || 10);
		const tareWeight = Number(body.tareWeightGrams) || Number(existingFirebaseData?.tareWeightGrams || 0);

		// Calculate stock unit count from explicit count, load cell weight, or existing count
		let computedCount = 1;
		if (count !== undefined && count !== null && count !== '') {
			computedCount = Number(count);
		} else if (measuredWeight !== null && measuredWeight > 0) {
			const netWeight = Math.max(0, measuredWeight - tareWeight);
			computedCount = Math.max(0, Math.round(netWeight / unitWeight));
		} else if (existingFirebaseData?.count !== undefined && existingFirebaseData?.count !== null) {
			computedCount = Number(existingFirebaseData.count);
		}

		// Compute final weight: use measured weight if given, else compute from count * unitWeight + tareWeight
		let finalWeightGrams = 0;
		if (measuredWeight !== null && measuredWeight > 0) {
			finalWeightGrams = measuredWeight;
		} else if (existingFirebaseData?.weightGrams && count === undefined) {
			finalWeightGrams = Number(existingFirebaseData.weightGrams);
		} else {
			finalWeightGrams = (computedCount * unitWeight) + tareWeight;
		}

		const deltaWeight = finalWeightGrams - oldWeight;
		const deltaUnits = computedCount - oldCount;

		// Compute status based on expiry and stock count
		const now = new Date();
		const expiryDate = expiry ? new Date(expiry) : (existingFirebaseData?.expiry ? new Date(existingFirebaseData.expiry) : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()));
		
		let status = 'Fresh';
		if (expiryDate < now) {
			status = 'Expired';
		} else if (computedCount === 0) {
			status = 'Out of Stock';
		} else if (computedCount <= 2) {
			status = 'Low Stock';
		}

		// Construct updated product document
		const productData = {
			id: tagUid,
			tagUid: tagUid,
			name: name || existingFirebaseData?.name || `Medicine ${tagUid}`,
			stockType: stockType || existingFirebaseData?.stockType || 'Single Tablet',
			type: type || existingFirebaseData?.type || 'RFID',
			count: computedCount,
			weightGrams: finalWeightGrams,
			unitWeightGrams: unitWeight,
			tareWeightGrams: tareWeight,
			weightQty1: existingFirebaseData?.weightQty1 || (unitWeight + tareWeight),
			weightQty2: existingFirebaseData?.weightQty2 || ((unitWeight * 2) + tareWeight),
			lastDeltaWeight: deltaWeight,
			lastDeltaUnits: deltaUnits,
			expiry: expiryDate.toISOString().split('T')[0],
			status,
			lastScanTimestamp: now.toISOString()
		};

		// Save to Firebase Realtime Database
		await updateFirebaseData(`medicine/data/${tagUid}`, productData);

		// Record ESP32 Telemetry Log in Firebase /medicine/logs
		const logId = `log-${Date.now()}`;
		const espLog = {
			id: logId,
			tagUid,
			time: new Date().toLocaleTimeString(),
			level: deltaUnits < 0 ? 'WARNING' : (deltaUnits > 0 ? 'SUCCESS' : 'INFO'),
			type: 'ESP32 Stock Update',
			text: `ESP Stock (${tagUid}): ${productData.name} updated to ${computedCount} units (${finalWeightGrams}g)`
		};
		await updateFirebaseData(`medicine/logs/${logId}`, espLog);

		return json({
			success: true,
			action: isNewProduct ? 'CREATED_PRODUCT' : 'UPDATED_STOCK',
			firebasePath: `/medicine/data/${tagUid}`,
			summary: {
				currentWeightGrams: finalWeightGrams,
				deltaWeightGrams: deltaWeight,
				unitsRemaining: computedCount,
				deltaUnits: deltaUnits
			},
			message: isNewProduct 
				? `New product "${productData.name}" (${productData.stockType}) registered with RFID tag ${tagUid}` 
				: `Stock updated for "${productData.name}": ${computedCount} units (${finalWeightGrams}g remaining)`,
			product: productData,
			log: espLog
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
