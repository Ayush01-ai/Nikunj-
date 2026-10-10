import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { AuthError } from '@/backend/lib/auth';
import { requireAdminHybrid, requireAuthHybrid } from '@/backend/lib/clerk';

// ─── GET single order ─────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthHybrid(req);
    await connectDB();
    const { id } = await params;
    
    const order = await Order.findOne({ orderId: id }).lean();
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });
    }

    const isOwner = auth.userId && order.userId?.toString() === auth.userId;
    const isGuestOwner = order.guestPhone && auth.phone && order.guestPhone === auth.phone;
    const isAdmin = auth.role === 'admin';

    if (!isAdmin && !isOwner && !isGuestOwner) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[orders/:id GET]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch order.' }, { status: 500 });
  }
}

// ─── PATCH update order status ────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminHybrid(req);
    await connectDB();
    const { id } = await params;
    const body = await req.json();
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'return_requested', 'return_approved', 'returned', 'refunded'];

    const updates: Record<string, unknown> = {};

    if (body.status) {
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ success: false, error: 'Invalid status.' }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (body.paymentStatus) {
      const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
      if (!validPaymentStatuses.includes(body.paymentStatus)) {
        return NextResponse.json({ success: false, error: 'Invalid payment status.' }, { status: 400 });
      }
      updates.paymentStatus = body.paymentStatus;
    }

    if (body.notes) {
      updates.notes = String(body.notes).slice(0, 500);
    }

    const order = await Order.findOneAndUpdate(
      { orderId: id },
      { $set: updates },
      { new: true },
    );

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[orders PATCH]', error);
    return NextResponse.json({ success: false, error: 'Failed to update order.' }, { status: 500 });
  }
}
