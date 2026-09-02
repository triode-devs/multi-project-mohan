import { json } from '@sveltejs/kit';
import { getFirebaseData, updateFirebaseData } from '$lib/firebase.js';

/**
 * ESP32 Endpoint: Update Existing Product Remaining Weight
 * Supports Adaptive Tare & Weight Tolerance (e.g. Unit Weight = 10g, Container Tare = 2g, Measured = 22g -> 2 Units).
 * Stores ESP32 scan telemetry logs in Firebase /medicine/logs.
 */
export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const tagUid = String(body.tagUid || body.rfid || body.id || '').trim();
		
		const weightProvided = body.weightGrams !== undefined || body.currentWeight !== undefined || body.weight !== undefined;
		const currentWeight = weightProvided ? Number(body.weightGrams ?? body.currentWeight ?? body.weight ?? 0) : null;
		const inputUnitWeight = body.unitWeightGrams ? Number(body.unitWeightGrams) : null;
		const inputTareWeight = body.tareWeightGrams !== undefined ? Number(body.tareWeightGrams) : null;
		const stockType = body.stockType || body.type;

		if (!tagUid) {
			return json({
				success: false,
				error: 'Missing required tagUid or rfid parameter'
			}, { status: 400 });
		}

		// Fetch existing product from Firebase
		const existingItem = await getFirebaseData(`medicine/data/${tagUid}`);
		const isNewProduct = !existingItem || !existingItem.name;

		const oldWeight = Number(existingItem?.weightGrams || 0);
		const oldCount = Number(existingItem?.count || 0);
		const unitWeight = inputUnitWeight || Number(existingItem?.unitWeightGrams || 10);
		const tareWeight = inputTareWeight !== null ? inputTareWeight : Number(existingItem?.tareWeightGrams || 0);

		// Calculate Count: use body.count if provided, else compute from weight, else preserve existing count
		let computedCount = oldCount;
		if (body.count !== undefined && body.count !== null && body.count !== '') {
			computedCount = Number(body.count);
		} else if (currentWeight !== null && currentWeight > 0) {
			const netWeight = Math.max(0, currentWeight - tareWeight);
			computedCount = Math.max(0, Math.round(netWeight / unitWeight));
		}

		// Calculate Weight: use currentWeight if provided and > 0, else auto-compute from count * unitWeight + tareWeight
		let finalWeightGrams = 0;
		if (currentWeight !== null && currentWeight > 0) {
			finalWeightGrams = currentWeight;
		} else {
			finalWeightGrams = (computedCount * unitWeight) + tareWeight;
		}

		const expectedWeight = (computedCount * unitWeight) + tareWeight;
		const weightVariance = finalWeightGrams - expectedWeight;

		// Calculate Delta from previous scan
		const deltaWeight = finalWeightGrams - oldWeight;
		const deltaUnits = computedCount - oldCount;

		// Compute Status
		const now = new Date();
		const expiryDate = existingItem?.expiry ? new Date(existingItem.expiry) : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
		
		let status = 'Fresh';
		if (expiryDate < now) {
			status = 'Expired';
		} else if (computedCount === 0) {
			status = 'Out of Stock';
		} else if (computedCount <= 2) {
			status = 'Low Stock';
		}

		const updatedProduct = {
			id: tagUid,
			tagUid,
			name: existingItem?.name || body.name || `Medicine ${tagUid}`,
			stockType: stockType || existingItem?.stockType || existingItem?.type || 'Single Tablet',
			type: existingItem?.type || 'RFID',
			count: computedCount,
			weightGrams: finalWeightGrams,
			unitWeightGrams: unitWeight,
			tareWeightGrams: tareWeight,
			expectedWeightGrams: expectedWeight,
			weightVarianceGrams: weightVariance,
			lastDeltaWeight: deltaWeight,
			lastDeltaUnits: deltaUnits,
			expiry: existingItem?.expiry || body.expiry || expiryDate.toISOString().split('T')[0],
			status,
			lastUpdated: now.toISOString()
		};

		// Save product to Firebase Realtime Database
		await updateFirebaseData(`medicine/data/${tagUid}`, updatedProduct);

		// Store ESP32 Telemetry Log in Firebase /medicine/logs
		const logId = `log-${Date.now()}`;
		const espLog = {
			id: logId,
			tagUid,
			time: new Date().toLocaleTimeString(),
			level: deltaWeight < 0 ? 'WARNING' : (deltaWeight > 0 ? 'INFO' : 'SUCCESS'),
			type: 'ESP32 Load Cell',
			text: deltaWeight < 0 
				? `ESP32 scan (${tagUid}): ${updatedProduct.name} ${Math.abs(deltaWeight)}g taken. Remaining: ${computedCount} units (${currentWeight}g)`
				: (deltaWeight > 0 
					? `ESP32 scan (${tagUid}): ${updatedProduct.name} ${deltaWeight}g added. Remaining: ${computedCount} units (${currentWeight}g)`
					: `ESP32 scan (${tagUid}): ${updatedProduct.name} scanned. Weight: ${currentWeight}g (${computedCount} units)`)
		};
		await updateFirebaseData(`medicine/logs/${logId}`, espLog);

		return json({
			success: true,
			action: isNewProduct ? 'CREATED' : (deltaWeight < 0 ? 'WEIGHT_REDUCED' : (deltaWeight > 0 ? 'WEIGHT_INCREASED' : 'NO_CHANGE')),
			firebasePath: `/medicine/data/${tagUid}`,
			summary: {
				currentWeightGrams: currentWeight,
				unitWeightGrams: unitWeight,
				tareWeightGrams: tareWeight,
				expectedWeightGrams: expectedWeight,
				weightVarianceGrams: weightVariance,
				deltaWeightGrams: deltaWeight,
				currentUnitsRemaining: computedCount,
				deltaUnits: deltaUnits
			},
			message: `Measured ${currentWeight}g (${unitWeight}g/unit + ${tareWeight}g tare). Calculated: ${computedCount} units (Variance: ${weightVariance >= 0 ? '+' : ''}${weightVariance.toFixed(1)}g)`,
			product: updatedProduct,
			log: espLog
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
