import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react';

export function SSOCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f0e8' }}>
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
