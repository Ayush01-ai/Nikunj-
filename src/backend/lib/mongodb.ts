import mongoose from 'mongoose';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cached;

const isWorkersRuntime = () =>
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

async function pingOk(m: typeof mongoose): Promise<boolean> {
  try {
    const admin = m.connection.db?.admin();
    if (!admin) return false;
    await Promise.race([
      admin.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout')), 3000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    if (!isWorkersRuntime()) return cached.conn;
    // Workers forbid reusing sockets opened by a previous request; verify, else reconnect.
    if (await pingOk(cached.conn)) return cached.conn;
    cached.conn = null;
    cached.promise = null;
    await mongoose.disconnect().catch(() => {});
  }

  // Checked at call time (not module load) so `next build` can evaluate routes without the variable.
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable in .env.local');
  }
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    // Don't leave a rejected promise cached — the next call must retry the connection
    // instead of permanently replaying this failure.
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/**
 * True for errors that mean "the database is currently unreachable" (DNS, network,
 * TLS/IP-access-list rejection, replica set election, etc.) as opposed to a request-level
 * bug. Callers use this to return an honest 503 instead of a generic validation-style 500.
 * Never logs or includes the connection string.
 */
export function isDbConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as { name?: unknown }).name) : '';
  const message = 'message' in err ? String((err as { message?: unknown }).message) : '';
  return (
    name === 'MongooseServerSelectionError' ||
    name === 'MongoServerSelectionError' ||
    name === 'MongoNetworkError' ||
    name === 'MongoNetworkTimeoutError' ||
    /ReplicaSetNoPrimary|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|querySrv/i.test(message)
  );
}
