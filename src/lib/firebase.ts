import { initializeApp, getApps } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import {
  Firestore,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { MASTER_OWNER_EMAIL } from './constants';
import type { AccountSlot } from '../types/crm';

export {
  CLINIC_WORKSPACE_ID,
  ALSAFA_WORKSPACE_ID,
  DEFAULT_ADMIN_USERNAME,
  MASTER_OWNER_EMAIL,
  isMasterOwnerEmail,
} from './constants';

let cachedFirestoreDb: Firestore | null = null;
let cachedAuth: Auth | null = null;
let connectionTested = false;

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  cachedAuth = getAuth(app);
  return cachedAuth;
}

export function getFirestoreDb(): Firestore {
  if (cachedFirestoreDb) return cachedFirestoreDb;
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  try {
    cachedFirestoreDb = initializeFirestore(
      app,
      { experimentalForceLongPolling: true },
      dbId
    );
  } catch {
    cachedFirestoreDb = getFirestore(app, dbId);
  }
  if (!connectionTested && typeof window !== 'undefined') {
    connectionTested = true;
    void testFirestoreConnection(cachedFirestoreDb);
  }
  return cachedFirestoreDb;
}

async function testFirestoreConnection(db: Firestore) {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration for dr-abdullah-ramadan-dental.');
    }
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const auth = getFirebaseAuth();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function syncAuthorizedAccountToFirestore(params: {
  email: string;
  displayName?: string;
  accountType: AccountSlot;
  status?: 'active' | 'inactive';
}): Promise<boolean> {
  const auth = getFirebaseAuth();
  if (!auth.currentUser?.emailVerified) {
    // Traditional username/password session: server-side SQLite + Admin sync handles persistence
    return false;
  }
  const normalizedEmail = params.email.trim().toLowerCase().slice(0, 254);
  if (!normalizedEmail || !normalizedEmail.includes('@')) return false;

  const db = getFirestoreDb();
  const path = `authorized_emails/${normalizedEmail}`;
  const accountType: AccountSlot = params.accountType === 'manager' ? 'manager' : 'moderator';
  const role = accountType === 'manager' ? 'full_access' : 'moderator';
  try {
    await setDoc(
      doc(db, 'authorized_emails', normalizedEmail),
      {
        email: normalizedEmail,
        displayName: (params.displayName || normalizedEmail.split('@')[0]).trim().slice(0, 160),
        accountType,
        role,
        isOwner: normalizedEmail === MASTER_OWNER_EMAIL,
        status: params.status === 'inactive' ? 'inactive' : 'active',
        grantedBy: (auth.currentUser.email || MASTER_OWNER_EMAIL).toLowerCase().slice(0, 254),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      return false;
    }
  }
}

export async function removeAuthorizedAccountFromFirestore(email: string): Promise<boolean> {
  const auth = getFirebaseAuth();
  if (!auth.currentUser?.emailVerified) return false;
  const normalizedEmail = email.trim().toLowerCase().slice(0, 254);
  if (!normalizedEmail || normalizedEmail === MASTER_OWNER_EMAIL) return false;

  const db = getFirestoreDb();
  const path = `authorized_emails/${normalizedEmail}`;
  try {
    await deleteDoc(doc(db, 'authorized_emails', normalizedEmail));
    return true;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, path);
    } catch {
      return false;
    }
  }
}
