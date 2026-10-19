// Read-only MongoDB connectivity diagnostic.
// Attempts a connection using the project's real MONGODB_URI and classifies
// the failure mode (configuration / dns / network / Atlas IP-access-list /
// authentication / permissions) without ever printing the URI, credentials,
// or any other secret value. Safe to run against a live cluster — it only
// opens a connection and issues an `admin.ping()`.
//
// Usage: npm run db:check
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import mongoose from 'mongoose';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.log(JSON.stringify({ classification: 'configuration', detail: 'MONGODB_URI is not set' }));
  process.exit(1);
}

const start = Date.now();
try {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
  const elapsedMs = Date.now() - start;
  const admin = mongoose.connection.db.admin();
  const pingResult = await admin.ping();
  console.log(JSON.stringify({
    classification: 'success',
    elapsedMs,
    ping: pingResult,
    host: mongoose.connection.host,
    readyState: mongoose.connection.readyState,
  }));
  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  const elapsedMs = Date.now() - start;
  const name = err?.name || 'Error';
  const message = String(err?.message || err);
  // Classify without leaking the URI/credentials (message from the driver can
  // sometimes embed the connection string, so we only surface safe fields).
  let classification = 'unknown';
  if (/ENOTFOUND|EAI_AGAIN|querySrv/i.test(message)) classification = 'dns';
  else if (/ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(message)) classification = 'network';
  else if (/tlsv1 alert internal error|SSL alert number 80/i.test(message)) classification = 'atlas-ip-access-list';
  else if (/ReplicaSetNoPrimary|ServerSelectionError/i.test(name) || /ReplicaSetNoPrimary/i.test(message)) classification = 'atlas-access-list-or-cluster-availability';
  else if (/Authentication failed|bad auth/i.test(message)) classification = 'authentication';
  else if (/not authorized/i.test(message)) classification = 'permissions';
  const redact = (s) => String(s).replace(/mongodb(\+srv)?:\/\/[^\s"]+/gi, '[redacted-uri]');
  let serverErrors;
  try {
    const servers = err?.reason?.servers;
    if (servers && typeof servers.entries === 'function') {
      serverErrors = [...servers.entries()].map(([addr, desc]) => ({
        address: addr,
        type: desc?.type,
        error: desc?.error ? redact(String(desc.error.message || desc.error)) : undefined,
      }));
      // The per-server TLS alert is more specific than the generic top-level
      // "ReplicaSetNoPrimary" message, so prefer it when present.
      if (serverErrors.some((s) => s.error && /tlsv1 alert internal error|SSL alert number 80/i.test(s.error))) {
        classification = 'atlas-ip-access-list';
      }
    }
  } catch {
    // best-effort only
  }
  console.log(JSON.stringify({
    classification,
    errorName: name,
    elapsedMs,
    // Redact anything that looks like it could contain the connection string.
    safeMessage: redact(message),
    serverErrors,
  }));
  process.exit(2);
}
