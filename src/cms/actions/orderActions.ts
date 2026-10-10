import { useState } from 'react';
import { useClient, type DocumentActionComponent } from 'sanity';
import { addRestockPatches, historyEntry } from '../lib/orderOps';
import { deliveryPartnerMessage, isReturnStatus, orderStatusMessage, type ShipmentInput } from '../lib/orderMessages';
import { siteOrigin } from './productActions';

interface OrderDoc {
  orderNumber?: string;
  status?: string;
  customerName?: string;
  phone?: string;
  total?: number;
  paymentStatus?: string;
  stockAdjusted?: boolean;
  tracking?: { courier?: string; trackingNumber?: string; trackingUrl?: string };
  items?: { productId?: string; productName?: string; option?: string; colour?: string; quantity?: number; price?: number }[];
}

const NEXT_STEP: Record<string, { status: string; label: string }> = {
  pending: { status: 'confirmed', label: 'Mark as Confirmed' },
  confirmed: { status: 'processing', label: 'Mark as Packing' },
  processing: { status: 'shipped', label: 'Mark as Shipped' },
  shipped: { status: 'delivered', label: 'Mark as Delivered' },
};

export const AdvanceOrderStatusAction: DocumentActionComponent = (props) => {
  const client = useClient({ apiVersion: '2024-01-01' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const doc = props.published as OrderDoc | null;
  const next = doc?.status ? NEXT_STEP[doc.status] : undefined;
  if (!doc || !next) return null;

  const apply = async () => {
    setBusy(true);
    try {
      await client
        .patch(props.id)
        .setIfMissing({ statusHistory: [] })
        .set({ status: next.status })
        .append('statusHistory', [historyEntry(next.status)])
        .commit();
    } finally {
      setBusy(false);
      setConfirming(false);
      props.onComplete();
    }
  };

  const missingTracking = next.status === 'shipped' && !doc.tracking?.trackingNumber;
  return {
    label: busy ? 'Saving…' : next.label,
    tone: 'primary',
    disabled: busy,
    onHandle: () => (missingTracking ? setConfirming(true) : void apply()),
    dialog: confirming && {
      type: 'confirm',
      message: 'No tracking number yet. Add the courier and tracking number first so the customer can follow the parcel. Mark as Shipped anyway?',
      onConfirm: () => void apply(),
      onCancel: () => {
        setConfirming(false);
        props.onComplete();
      },
    },
  };
};

export const CancelOrderAction: DocumentActionComponent = (props) => {
  const client = useClient({ apiVersion: '2024-01-01' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const doc = props.published as OrderDoc | null;
  if (!doc || doc.status === 'cancelled' || doc.status === 'delivered' || isReturnStatus(doc.status)) return null;

  const paid = doc.paymentStatus === 'paid';
  const cancel = async () => {
    setBusy(true);
    try {
      const tx = client.transaction();
      tx.patch(props.id, (p) =>
        p
          .setIfMissing({ statusHistory: [] })
          .set({ status: 'cancelled', stockAdjusted: false, ...(paid && { paymentStatus: 'refund_due' }) })
          .append('statusHistory', [historyEntry('cancelled', paid ? 'Refund due' : undefined)]),
      );
      if (doc.stockAdjusted && doc.items?.length) await addRestockPatches(client, tx, doc.items);
      await tx.commit();
    } finally {
      setBusy(false);
      setConfirming(false);
      props.onComplete();
    }
  };

  return {
    label: busy ? 'Cancelling…' : 'Cancel Order',
    tone: 'critical',
    disabled: busy,
    onHandle: () => setConfirming(true),
    dialog: confirming && {
      type: 'confirm',
      tone: 'critical',
      message: `Cancel order ${doc.orderNumber}? Items go back into stock.${paid ? ' It will be marked "Refund due" — refund it from your Razorpay dashboard.' : ''}`,
      onConfirm: () => void cancel(),
      onCancel: () => {
        setConfirming(false);
        props.onComplete();
      },
    },
  };
};

export const SendToDeliveryPartnerAction: DocumentActionComponent = (props) => {
  const client = useClient({ apiVersion: '2024-01-01' });
  const [busy, setBusy] = useState(false);
  const doc = props.published as (OrderDoc & ShipmentInput) | null;
  if (!doc || !['confirmed', 'processing'].includes(doc.status ?? '')) return null;

  const send = async () => {
    // Open the tab synchronously so the popup blocker allows it, then point it at WhatsApp.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setBusy(true);
    try {
      const settings = await client
        .fetch<{ deliveryPartnerName?: string; deliveryPartnerWhatsApp?: string } | null>(
          `*[_id == "settings.admin"][0]{deliveryPartnerName, deliveryPartnerWhatsApp}`,
        )
        .catch(() => null);
      const partnerPhone = settings?.deliveryPartnerWhatsApp?.replace(/\D/g, '').slice(-10);
      const text = encodeURIComponent(deliveryPartnerMessage(doc));
      const url = partnerPhone ? `https://wa.me/91${partnerPhone}?text=${text}` : `https://wa.me/?text=${text}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;

      const note = `Sent to delivery partner${settings?.deliveryPartnerName ? ` (${settings.deliveryPartnerName})` : ''}`;
      let patch = client
        .patch(props.id)
        .setIfMissing({ statusHistory: [], tracking: {} })
        .set({ 'tracking.handedOverAt': new Date().toISOString() });
      if (!doc.tracking?.courier && settings?.deliveryPartnerName) patch = patch.set({ 'tracking.courier': settings.deliveryPartnerName });
      if (doc.status === 'confirmed') patch = patch.set({ status: 'processing' });
      await patch.append('statusHistory', [historyEntry(doc.status === 'confirmed' ? 'processing' : doc.status!, note)]).commit();
    } finally {
      setBusy(false);
      props.onComplete();
    }
  };

  return {
    label: busy ? 'Sending…' : 'Send to Delivery Partner',
    title: 'Opens WhatsApp with the pickup details (address, items, COD amount) and marks the order as Packing',
    disabled: busy,
    onHandle: () => void send(),
  };
};

export const WhatsAppOrderUpdateAction: DocumentActionComponent = (props) => {
  const doc = props.published as OrderDoc | null;
  const phone = doc?.phone?.replace(/\D/g, '').slice(-10);
  if (!doc || !phone) return null;

  return {
    label: 'Send WhatsApp update',
    title: 'Opens WhatsApp with a ready-made message about the current status',
    onHandle: () => {
      const text = orderStatusMessage(doc, siteOrigin());
      window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      props.onComplete();
    },
  };
};
