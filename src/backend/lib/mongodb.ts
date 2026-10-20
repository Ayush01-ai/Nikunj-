import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable in .env.local');
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

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
