import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { User } from '@/backend/models/User';
import { AuthError, isValidPhone, sanitizePhone } from '@/backend/lib/auth';
import { requireAuthHybrid } from '@/backend/lib/clerk';
import { publicUser } from '@/backend/lib/session';

export const dynamic = 'force-dynamic';

type AddressInput = {
  fullName?: unknown;
  phone?: unknown;
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  state?: unknown;
  pincode?: unknown;
  landmark?: unknown;
  isDefault?: unknown;
};

/** Validates and normalizes an address payload. Returns an error string, or null if valid. */
function parseAddress(body: AddressInput) {
  const fullName = String(body.fullName ?? '').trim().slice(0, 100);
  const phone = sanitizePhone(String(body.phone ?? ''));
  const line1 = String(body.line1 ?? '').trim().slice(0, 200);
  const line2 = String(body.line2 ?? '').trim().slice(0, 200);
  const city = String(body.city ?? '').trim().slice(0, 100);
  const state = String(body.state ?? '').trim().slice(0, 100);
  const pincode = String(body.pincode ?? '').trim();
  const landmark = String(body.landmark ?? '').trim().slice(0, 100);
  const isDefault = Boolean(body.isDefault);

  if (!fullName) return { error: 'Please enter the recipient\u2019s name.' };
  if (!isValidPhone(phone)) return { error: 'Please enter a valid 10-digit phone number.' };
  if (!line1) return { error: 'Please enter the address line.' };
  if (!city) return { error: 'Please enter a city.' };
  if (!state) return { error: 'Please enter a state.' };
  if (!/^\d{6}$/.test(pincode)) return { error: 'Please enter a valid 6-digit pincode.' };

  return {
    value: { fullName, phone, line1, line2: line2 || undefined, city, state, pincode, landmark: landmark || undefined, isDefault },
  };
}

/** Add a new saved address for the signed-in customer. */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuthHybrid(req);
    const body = await req.json().catch(() => ({}));
    const parsed = parseAddress(body);
    if (parsed.error) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

    await connectDB();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 401 });

    const value = parsed.value!;
    // The first saved address, or an explicit "set as default", becomes the default;
    // at most one address can be default at a time.
    if (value.isDefault || user.addresses.length === 0) {
      user.addresses.forEach((a) => { a.isDefault = false; });
      value.isDefault = true;
    }
    user.addresses.push(value);
    await user.save();

    return NextResponse.json({ success: true, user: publicUser(user) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[account/addresses POST]', error);
    return NextResponse.json({ success: false, error: 'Could not save address.' }, { status: 500 });
  }
}

/** Edit an existing saved address (identified by its subdocument id). */
export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await requireAuthHybrid(req);
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ success: false, error: 'Missing address id.' }, { status: 400 });

    const parsed = parseAddress(body);
    if (parsed.error) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

    await connectDB();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 401 });

    const address = user.addresses.id(id);
    if (!address) return NextResponse.json({ success: false, error: 'Address not found.' }, { status: 404 });

    const value = parsed.value!;
    if (value.isDefault) user.addresses.forEach((a) => { a.isDefault = false; });
    Object.assign(address, value);
    await user.save();

    return NextResponse.json({ success: true, user: publicUser(user) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[account/addresses PATCH]', error);
    return NextResponse.json({ success: false, error: 'Could not update address.' }, { status: 500 });
  }
}

/** Remove a saved address. Promotes another address to default if the default one is removed. */
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await requireAuthHybrid(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') ?? '';
    if (!id) return NextResponse.json({ success: false, error: 'Missing address id.' }, { status: 400 });

    await connectDB();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 401 });

    const address = user.addresses.id(id);
    if (!address) return NextResponse.json({ success: false, error: 'Address not found.' }, { status: 404 });

    const wasDefault = Boolean(address.isDefault);
    address.deleteOne();
    if (wasDefault && user.addresses.length > 0) user.addresses[0].isDefault = true;
    await user.save();

    return NextResponse.json({ success: true, user: publicUser(user) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[account/addresses DELETE]', error);
    return NextResponse.json({ success: false, error: 'Could not remove address.' }, { status: 500 });
  }
}
