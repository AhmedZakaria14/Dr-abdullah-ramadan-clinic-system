import { initializeApp, getApps } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, doc, getDocFromServer, getFirestore, initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

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
