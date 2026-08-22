import { ReactNode, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { setSupabaseAccessTokenProvider } from "../lib/supabase";

export function Auth0SupabaseBridge({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, getIdTokenClaims } = useAuth0();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSupabaseAccessTokenProvider(async () => {
      // Refresh the Auth0 session before reading the ID token that carries the
      // non-namespaced `role: authenticated` claim required by Supabase.
      await getAccessTokenSilently();
      const claims = await getIdTokenClaims();
      if (!claims?.__raw) {
        throw new Error("Missing Auth0 ID token");
      }
      return claims.__raw;
    });
    setReady(true);

    return () => {
      setSupabaseAccessTokenProvider(null);
    };
  }, [getAccessTokenSilently, getIdTokenClaims]);

  return ready ? children : null;
}
