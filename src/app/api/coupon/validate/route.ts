import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/cms/lib/client';
import { COUPON_BY_CODE_QUERY } from '@/cms/lib/queries';
import type { Coupon } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body?.code || '').trim().toUpperCase();
    const orderTotal = Number(body?.orderTotal || 0);

    if (!code || !/^[A-Z0-9]{3,20}$/.test(code)) {
      return NextResponse.json({ success: false, error: 'Invalid coupon code format.' }, { status: 400 });
    }

    const coupon = await client.fetch<Coupon>(COUPON_BY_CODE_QUERY, { code });

    if (!coupon) {
      return NextResponse.json({ success: false, error: 'Invalid coupon code.' }, { status: 404 });
    }

    // Date validation
    const now = new Date();
    if (coupon.validFrom && now < new Date(coupon.validFrom)) {
      return NextResponse.json({ success: false, error: 'This coupon is not yet active.' }, { status: 400 });
    }
    if (coupon.validUntil && now > new Date(coupon.validUntil)) {
      return NextResponse.json({ success: false, error: 'This coupon has expired.' }, { status: 400 });
    }

    // Minimum order value
    if (coupon.minimumOrderValue > 0 && orderTotal < coupon.minimumOrderValue) {
      return NextResponse.json({
        success: false,
        error: `Minimum order value of ₹${coupon.minimumOrderValue} required for this coupon.`,
      }, { status: 400 });
    }

    // Calculate discount
    let discountAmount: number;
    if (coupon.discountType === 'percentage') {
      discountAmount = Math.round((orderTotal * coupon.discountValue) / 100);
      if (coupon.maximumDiscountCap > 0) {
        discountAmount = Math.min(discountAmount, coupon.maximumDiscountCap);
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, orderTotal);
    }

    return NextResponse.json({
      success: true,
      data: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
        message: coupon.discountType === 'percentage'
          ? `${coupon.discountValue}% discount applied! You save ₹${discountAmount}`
          : `₹${discountAmount} discount applied!`,
      },
    });
  } catch (error) {
    console.error('[coupon/validate]', error);
    return NextResponse.json({ success: false, error: 'Failed to validate coupon.' }, { status: 500 });
  }
}
