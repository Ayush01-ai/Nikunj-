import { NextRequest, NextResponse } from 'next/server';
import { authorizeOrderForPayment, verifyOrderAccess } from '@/backend/lib/orderAccess';
import { requireAuthHybrid } from '@/backend/lib/clerk';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';
import { getAdminSettings, getSanityOrder, sanityOrderId } from '@/backend/lib/sanityOrders';
import { notifyOrder } from '@/backend/lib/orderNotify';
import { Order } from '@/backend/models/Order';
import { writeClient } from '@/cms/lib/client';
import { historyEntry } from '@/cms/lib/orderOps';
import { daysSinceDelivered } from '@/cms/lib/orderMessages';
import {
  CANCEL_REASONS,
  MAX_PHOTO_BYTES,
  MAX_REQUEST_PHOTOS,
  PHOTO_REQUIRED_REASONS,
  RETURN_REASONS,
  requestEligibility,
} from '@/cms/lib/orderRequests';

export const runtime = 'nodejs';

const isRateLimited = createRateLimiter(5, 10 * 60 * 1000, 'api/orders/request:isRateLimited');
const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const key = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Sniff the real file type instead of trusting the browser-supplied MIME. */
function imageExt(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Customer-raised cancellation or return request. The admin approves / rejects it in the Studio Orders Dashboard. */
export async function POST(req: NextRequest) {
  if (await isRateLimited(`order-request:${clientIp(req)}`)) return fail('Too many requests. Please try again in a few minutes.', 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('Invalid request.');
  }

  const type = String(form.get('type') ?? '');
  const reasonCategory = String(form.get('reasonCategory') ?? '').trim();
  const details = String(form.get('details') ?? '').trim().slice(0, 1000);
  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);

  if (type !== 'cancel' && type !== 'return') return fail('Invalid request type.');
  const reasons: readonly string[] = type === 'cancel' ? CANCEL_REASONS : RETURN_REASONS;
  if (!reasons.includes(reasonCategory)) return fail('Please choose a reason.');
  if (reasonCategory === 'Other' && details.length < 5) return fail('Please tell us a little more about the reason.');
  if (type === 'cancel' && files.length) return fail('Photos are only needed for returns.');
  if (files.length > MAX_REQUEST_PHOTOS) return fail(`You can attach up to ${MAX_REQUEST_PHOTOS} photos.`);
  if (type === 'return' && PHOTO_REQUIRED_REASONS.includes(reasonCategory) && files.length === 0) {
    return fail('Please attach at least one photo so we can verify the issue.');
  }
  if (files.some((f) => f.size > MAX_PHOTO_BYTES)) return fail('Each photo must be under 5 MB.');

  const access = await verifyOrderAccess(req, form.get('orderId'), form.get('phone'));
  if (!access.ok) return fail(access.error, access.status);
  const { orderId, order: mongoOrder } = access;

  // Knowing the order ID + phone is enough to *view* status, but changing an order needs real
  // proof: the logged-in owner, or a guest who verified an OTP sent to the order's phone.
  let viewerId: string | undefined;
  try {
    viewerId = (await requireAuthHybrid(req)).userId;
  } catch {
    // guest
  }
  if (!authorizeOrderForPayment(mongoOrder, viewerId, form.get('guestProof')).ok) {
    return NextResponse.json(
      {
        success: false,
        error: mongoOrder.userId
          ? 'Please log in to the account used for this order to request a cancellation or return.'
          : 'Please verify your phone number with the OTP first.',
        needsVerification: !mongoOrder.userId,
      },
      { status: 403 },
    );
  }

  if (!process.env.SANITY_API_TOKEN) return fail('Requests are temporarily unavailable. Please contact us on WhatsApp.', 503);
  const [managed, admin] = await Promise.all([getSanityOrder(orderId), getAdminSettings()]);
  if (!managed) return fail('This order is still being processed. Please try again in a little while or contact us on WhatsApp.', 409);

  const windowDays = admin.returnWindowDays ?? 7;
  const eligibility = requestEligibility(managed, windowDays);
  const id = sanityOrderId(orderId);
  const now = new Date().toISOString();

  try {
    if (type === 'cancel') {
      if (!eligibility.canCancel) {
        return fail(
          managed.cancelRequest?.state === 'pending'
            ? 'A cancellation request is already under review.'
            : 'This order can no longer be cancelled online — it may already be on its way. Please contact us on WhatsApp.',
          409,
        );
      }
      await writeClient
        .patch(id)
        .setIfMissing({ statusHistory: [] })
        .set({ cancelRequest: { state: 'pending', reasonCategory, ...(details && { details }), requestedAt: now } })
        .append('statusHistory', [historyEntry(managed.status, `Customer requested cancellation: ${reasonCategory}`)])
        .commit();
      return NextResponse.json({ success: true, message: 'Your cancellation request has been sent. We will confirm shortly on WhatsApp.' });
    }

    if (!eligibility.canReturn) {
      return fail(
        managed.status === 'delivered'
          ? `Returns are accepted within ${windowDays} days of delivery, once per order. Please contact us on WhatsApp for help.`
          : 'Returns can be requested once the order is delivered.',
        409,
      );
    }

    const buffers: { buf: Buffer; ext: string }[] = [];
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const ext = imageExt(buf);
      if (!ext) return fail('Photos must be JPG, PNG or WEBP images.');
      buffers.push({ buf, ext });
    }
    const photos = [];
    for (const [i, { buf, ext }] of buffers.entries()) {
      const asset = await writeClient.assets.upload('image', buf, { filename: `${orderId}-return-${i + 1}.${ext}` });
      photos.push({ _key: key(), _type: 'image', asset: { _type: 'reference', _ref: asset._id } });
    }

    const days = daysSinceDelivered(managed.statusHistory);
    await writeClient
      .patch(id)
      .setIfMissing({ statusHistory: [] })
      .set({
        status: 'return_requested',
        returnInfo: {
          reasonCategory,
          reason: details || reasonCategory,
          photos,
          requestedBy: 'customer',
          requestedAt: now,
          withinWindow: true,
        },
      })
      .append('statusHistory', [historyEntry('return_requested', `Customer requested return (day ${days ?? '?'} of ${windowDays}) — ${reasonCategory}`)])
      .commit();
    await Order.updateOne({ orderId }, { $set: { status: 'return_requested' } }).catch(() => undefined);
    await notifyOrder(orderId, {
      orderNumber: orderId,
      status: 'return_requested',
      customerName: mongoOrder.shippingAddress?.fullName,
    }).catch(() => undefined);
    return NextResponse.json({ success: true, message: 'Your return request has been sent. Our team will review the photos and keep you updated.' });
  } catch (error) {
    console.error('[order-request]', orderId, error instanceof Error ? error.message : error);
    return fail('Could not submit your request right now. Please try again or contact us on WhatsApp.', 500);
  }
}
