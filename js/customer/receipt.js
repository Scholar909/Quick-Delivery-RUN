// receipt.js
// Live-updating receipt viewer for customers
import { auth, db } from '../firebase.js';
import {
  doc,
  onSnapshot,
  getDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const fmtNaira = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0
    }).format(Number(n));
  } catch {
    return `₦${Number(n).toLocaleString()}`;
  }
};
const fmtTime = (ts) => {
  if (!ts) return '—';
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleString();
  } catch {
    return '—';
  }
};
const setStatusBadge = (status, paymentStatus) => {
  const el = $('statusBadge');
  el.classList.remove(
    'status-pending',
    'status-completed',
    'status-declined',
    'status-unsuccessful'
  );
  let txt = (status || 'pending').toString().toLowerCase();
  if (paymentStatus && paymentStatus.toLowerCase() === 'unsuccessful') txt = 'unsuccessful';

  switch (txt) {
    case 'completed':
    case 'delivered':
    case 'successful':
      el.classList.add('status-completed');
      el.textContent = 'Delivered';
      break;
    case 'declined':
      el.classList.add('status-declined');
      el.textContent = 'Declined';
      break;
    case 'unsuccessful':
      el.classList.add('status-unsuccessful');
      el.textContent = 'Unsuccessful';
      break;
    default:
      el.classList.add('status-pending');
      el.textContent = 'Pending';
  }
};

/* ---------- render ---------- */
function renderReceipt(data, idFromUrl) {
  $('restaurantName').textContent = data.restaurantName || '—';
  $('custName').textContent = data.customerName || '—';
  $('orderId').textContent = data.orderId || idFromUrl || '—';
  
  // ✅ Use customer's chosen delivery destination (To Location)
  const toLocation = data.toLocation || data.deliveryLocation || data.location || '';
  $('roomLocation').textContent = toLocation || '—';

  $('merchantUsername').textContent =
    data.assignedMerchantName ||
    data.assignedMerchantUsername ||
    data.merchantUsername ||
    '—';

  // Items
  const tbody = $('itemsBody');
  const tfoot = $('itemsFoot');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  const items = Array.isArray(data.items) ? data.items : [];
  for (const row of items) {
    const tr = document.createElement('tr');
    const price = Number(row.price) * Number(row.qty || 1);
    tr.innerHTML = `
      <td>${row.name || ''}</td>
      <td>${row.qty ?? 1}</td>
      <td>${fmtNaira(price)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (data.packCharge && data.packCharge > 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>Pack</td><td>1</td><td>${fmtNaira(data.packCharge)}</td>`;
    tbody.appendChild(tr);
  }

  const spacer = document.createElement('tr');
  spacer.innerHTML = `<td style="padding:6px 14px;border-top:none;">&nbsp;</td>
                      <td style="border-top:none;"></td>
                      <td style="border-top:none;"></td>`;
  tfoot.appendChild(spacer);

  // ✅ Always calculate item total properly (items + pack)
  let itemTotal = Array.isArray(data.items)
    ? data.items.reduce((sum, row) => {
        const qty = Number(row.qty || 1);
        const price = Number(row.price || 0);
        return sum + qty * price;
      }, 0)
    : 0;

  // Add pack to item total so display matches records
  const pack = Number(data.packCharge ?? 0);
  itemTotal += pack;

  const delivery = Number(data.deliveryCharge ?? 0);
  const fee = Number(data.feeCharge ?? 0); // Use stored feeCharge
  const totalAll = Number(
    data.totalAmount ?? (itemTotal + delivery + fee)
  );

  $('itemTotal').textContent = fmtNaira(itemTotal);
  $('charge').textContent = fmtNaira(delivery);
  $('fee').textContent = fmtNaira(fee);
  $('totalAll').textContent = fmtNaira(totalAll);

  $('assignedTime').textContent = fmtTime(data.assignedAt || data.assignedTime);
  $('deliveredTime').textContent = fmtTime(data.deliveredTime);

  const statusField = (data.orderStatus || data.status || '').toLowerCase();
  setStatusBadge(statusField, (data.paymentStatus || '').toLowerCase());

  const reasonEl = $('declineReason');
  if (statusField === 'declined') {
    reasonEl.style.display = 'block';
    reasonEl.textContent =
      data.adminDeclineReason ||
      data.declineReason ||
      data.paystackReason ||
      'No reason provided.';
  } else {
    reasonEl.style.display = 'none';
  }

  $('loader').style.display = 'none';
}

/* ---------- main ---------- */
(async function init() {
  const params = new URLSearchParams(location.search);
  const orderId = params.get('orderId');

  if (!orderId) {
    $('loader').textContent = 'No orderId provided in URL.';
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    const ref = doc(db, 'orders', orderId);

    // Fast initial render
    const snap = await getDoc(ref);
    if (snap.exists()) renderReceipt(snap.data(), orderId);

    // Live updates
    onSnapshot(ref, (ss) => {
      if (!ss.exists()) {
        $('loader').textContent = 'Receipt not found.';
        return;
      }
      renderReceipt(ss.data(), orderId);
    });
  });

  $('printBtn').addEventListener('click', () => window.print());
})();