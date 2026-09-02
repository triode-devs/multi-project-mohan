import { json } from '@sveltejs/kit';
import { getFirebaseData, updateFirebaseData, deleteFirebaseData } from '$lib/firebase.js';

export async function GET() {
	try {
		const firebaseData = await getFirebaseData('medicine') || {};
		
		let itemsObj = firebaseData.data || firebaseData.inventory || firebaseData;
		if (itemsObj && (itemsObj.data || itemsObj.inventory)) {
			itemsObj = itemsObj.data || itemsObj.inventory;
		}

		// Normalize items object to array
		const inventory = Object.values(itemsObj).filter(item => typeof item === 'object' && item !== null && item.name && item.id);
		
		const totalItems = inventory.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
		const actionNeededCount = inventory.filter(item => item.status === 'Expired' || item.status === 'Low Stock' || item.status === 'Out of Stock').length;

		const alerts = inventory
			.filter(item => item.status === 'Expired' || item.status === 'Low Stock' || item.status === 'Out of Stock')
			.map(item => ({
				id: `alt-${item.id}`,
				title: `${item.name} is ${item.status}`,
				type: item.status === 'Expired' ? 'danger' : (item.status === 'Out of Stock' ? 'danger' : 'warning'),
				desc: item.status === 'Expired' ? `Expired on ${item.expiry}` : (item.status === 'Out of Stock' ? '0 units remaining' : `Low Stock: ${item.count} unit(s) left`)
			}));

		let logsObj = firebaseData.logs || {};
		let logs = Object.values(logsObj).filter(l => typeof l === 'object' && l !== null && l.text);

		return json({
			success: true,
			firebasePath: '/medicine',
			stats: {
				totalItems,
				actionNeededCount,
				totalTypes: inventory.length
			},
			alerts,
			inventory,
			logs: logs.slice(-20).reverse()
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { id, oldId, tagUid, name, type, stockType, count, expiry, status, weightQty1, weightQty2, unitWeightGrams, tareWeightGrams, weightGrams } = body;

		const finalTagUid = String(tagUid || id || Date.now()).trim();
		const previousId = oldId ? String(oldId).trim() : null;

		let unitWeight = 10;
		let tareWeight = 0;

		const w1 = Number(weightQty1);
		let w2 = Number(weightQty2);

		// 1 Qty Weight is required. 2 Qty Weight is optional & defaults to double of 1 Qty Weight!
		if (w1 > 0) {
			if (!w2 || w2 <= w1) {
				w2 = w1 * 2;
			}
			unitWeight = Math.max(0.1, w2 - w1);
			tareWeight = Math.max(0, w1 - unitWeight);
		} else {
			unitWeight = Number(unitWeightGrams) || 10;
			tareWeight = Number(tareWeightGrams) || 0;
		}

		const totalCount = Number(count) >= 0 ? Number(count) : 1;
		const expectedWeight = (totalCount * unitWeight) + tareWeight;
		const totalWeight = weightGrams !== undefined ? Number(weightGrams) : expectedWeight;
		const weightVariance = totalWeight - expectedWeight;

		// If oldId was provided and tag UID changed, remove old node from Firebase
		if (previousId && previousId !== finalTagUid) {
			await deleteFirebaseData(`medicine/data/${previousId}`);
			await deleteFirebaseData(`medicine/${previousId}`);
		}

		const newItem = {
			id: finalTagUid,
			tagUid: finalTagUid,
			name: name || 'Medicine Stock',
			type: type || 'RFID',
			stockType: stockType || 'Single Tablet',
			count: totalCount,
			weightQty1: w1 > 0 ? w1 : (unitWeight + tareWeight),
			weightQty2: w2 > 0 ? w2 : ((unitWeight * 2) + tareWeight),
			unitWeightGrams: unitWeight,
			tareWeightGrams: tareWeight,
			weightGrams: totalWeight,
			expectedWeightGrams: expectedWeight,
			weightVarianceGrams: weightVariance,
			expiry: expiry || '2027-12-31',
			status: status || (totalCount === 0 ? 'Out of Stock' : (totalCount <= 2 ? 'Low Stock' : 'Fresh')),
			lastUpdated: new Date().toISOString()
		};

		// Save product data to Firebase Realtime Database
		await updateFirebaseData(`medicine/data/${finalTagUid}`, newItem);

		// Record structured UI log in Firebase /medicine/logs
		const logId = `log-${Date.now()}`;
		const isRfidChange = previousId && previousId !== finalTagUid;
		const logText = isRfidChange 
			? `RFID Tag UID modified from ${previousId} to ${finalTagUid} for ${newItem.name}`
			: `UI Stock Action: '${newItem.name}' (${finalTagUid}) updated to ${totalCount} units (${totalWeight}g)`;

		const newLog = {
			id: logId,
			tagUid: finalTagUid,
			time: new Date().toLocaleTimeString(),
			level: 'SUCCESS',
			type: isRfidChange ? 'UI RFID Edit' : 'UI Stock Entry',
			text: logText
		};
		await updateFirebaseData(`medicine/logs/${logId}`, newLog);

		return json({
			success: true,
			message: `Product RFID ${finalTagUid} updated in Firebase /medicine`,
			item: newItem,
			log: newLog
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function DELETE({ url, request }) {
	try {
		let id = url.searchParams.get('id');
		if (!id) {
			const body = await request.json().catch(() => ({}));
			id = body.id;
		}

		if (!id) {
			return json({ success: false, message: 'Missing product id to delete' }, { status: 400 });
		}

		await deleteFirebaseData(`medicine/data/${id}`);
		await deleteFirebaseData(`medicine/${id}`);

		// Record deletion log in Firebase /medicine/logs
		const logId = `log-${Date.now()}`;
		const deleteLog = {
			id: logId,
			tagUid: id,
			time: new Date().toLocaleTimeString(),
			level: 'DANGER',
			type: 'UI Delete Product',
			text: `Product '${id}' permanently deleted from medicine cabinet inventory`
		};
		await updateFirebaseData(`medicine/logs/${logId}`, deleteLog);

		return json({
			success: true,
			message: `Product ${id} deleted successfully from Firebase /medicine`,
			deletedId: id,
			log: deleteLog
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
