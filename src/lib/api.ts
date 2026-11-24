const AUTH_TOKEN_KEY = 'leadflow_auth_token';
const ACCOUNT_VAULT_KEY = 'leadflow_account_vault';

let inMemoryToken: string | null = null;
let inMemoryAccountVault: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (stored) {
        inMemoryToken = stored;
        return stored;
      }
    }
  } catch {
    // ignore storage access errors
  }
  return null;
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (token) {
        window.localStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    }
  } catch {
    // ignore storage access errors
  }
}

export function getAccountVault(): string | null {
  if (inMemoryAccountVault) return inMemoryAccountVault;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(ACCOUNT_VAULT_KEY);
      if (stored && stored.startsWith('vlt1.')) {
        inMemoryAccountVault = stored;
        return stored;
      }
    }
  } catch {
    // ignore storage access errors
  }
  return null;
}

export function setAccountVault(vault: string | null): void {
  if (!vault || !vault.startsWith('vlt1.')) return;
  inMemoryAccountVault = vault;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACCOUNT_VAULT_KEY, vault);
    }
  } catch {
    // ignore storage access errors
  }
}

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit & { expectBlob?: boolean; skipAuthRedirect?: boolean } = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const isLoginEndpoint = path.startsWith('/auth/login');
  const sentToken = isLoginEndpoint ? null : getAuthToken();
  if (sentToken) {
    headers.set('Authorization', `Bearer ${sentToken}`);
  }

  // Send opaque server-encrypted account vault on auth & account management requests
  // so multi-instance/cold-started containers immediately share created Moderator accounts
  const needsVaultSync =
    isLoginEndpoint ||
    path.startsWith('/auth/change-password') ||
    path.includes('/members');
  if (needsVaultSync) {
    const vault = getAccountVault();
    if (vault) {
      headers.set('X-Account-Vault', vault);
    }
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (contentType.includes('application/json')) {
      const errData = await res.json().catch(() => ({}));
      message = errData.error || message;
    }
    // Only invalidate session if this 401 belongs to the CURRENT active token (avoid race when switching accounts)
    if (
      res.status === 401 &&
      !options.skipAuthRedirect &&
      !isLoginEndpoint &&
      sentToken &&
      sentToken === getAuthToken()
    ) {
      setAuthToken(null);
      unauthorizedHandler?.();
    }
    throw new Error(message);
  }

  if (options.expectBlob) {
    return (await res.blob()) as unknown as T;
  }

  if (contentType.includes('application/json')) {
    const data = (await res.json()) as any;
    if (data && typeof data.accountVault === 'string' && data.accountVault.startsWith('vlt1.')) {
      setAccountVault(data.accountVault);
    }
    return data as T;
  }

  throw new Error('API endpoint returned non-JSON response');
}
