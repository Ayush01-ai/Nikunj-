import { useState } from 'react';
import { useClient, type DocumentActionComponent } from 'sanity';
import { STOCK_PRODUCTS_QUERY, buildStockPatches, stockLookupIds } from '../lib/orderStock';
import { orderStatusMessage } from '../lib/orderMessages';
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

const historyEntry = (status: string, note?: string) => ({
  _key: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  status,
  at: new Date().toISOString(),
  ...(note && { note }),
});

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
  if (!doc || doc.status === 'cancelled' || doc.status === 'delivered') return null;

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
      if (doc.stockAdjusted && doc.items?.length) {
        const lines = doc.items
          .filter((i): i is typeof i & { productId: string } => Boolean(i.productId))
          .map((i) => ({ productId: i.productId, option: i.option, quantity: i.quantity ?? 1 }));
        const products = await client.fetch(STOCK_PRODUCTS_QUERY, { ids: stockLookupIds(lines) });
        for (const patch of buildStockPatches(products, lines, 1)) tx.patch(patch.id, (p) => p.inc(patch.inc));
      }
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
