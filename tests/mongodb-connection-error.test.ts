import { describe, expect, it } from 'vitest';
import { isDbConnectionError } from '@/backend/lib/mongodb';

// isDbConnectionError distinguishes "the database is unreachable" (DNS, network,
// Atlas IP-access-list/TLS rejection, replica set election) from request-level bugs,
// so API routes can return an honest 503 instead of a generic 500.
describe('isDbConnectionError', () => {
  it('recognizes MongooseServerSelectionError (Atlas IP-access-list / cluster unavailable)', () => {
    const err = Object.assign(new Error('Could not connect to any servers in your MongoDB Atlas cluster'), {
      name: 'MongooseServerSelectionError',
    });
    expect(isDbConnectionError(err)).toBe(true);
  });

  it('recognizes MongoNetworkError', () => {
    const err = Object.assign(new Error('connection timed out'), { name: 'MongoNetworkError' });
    expect(isDbConnectionError(err)).toBe(true);
  });

  it('recognizes DNS/network failures by message when the name is generic', () => {
    expect(isDbConnectionError(new Error('querySrv ENOTFOUND _mongodb._tcp.cluster.mongodb.net'))).toBe(true);
    expect(isDbConnectionError(new Error('ReplicaSetNoPrimary'))).toBe(true);
  });

  it('returns false for unrelated application errors', () => {
    expect(isDbConnectionError(new Error('Invalid cart item.'))).toBe(false);
    expect(isDbConnectionError(new Error('Authentication failed'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isDbConnectionError(null)).toBe(false);
    expect(isDbConnectionError(undefined)).toBe(false);
    expect(isDbConnectionError('some string')).toBe(false);
  });
});
