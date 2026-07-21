import { ReactNode, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { setSupabaseAccessTokenProvider } from "../lib/supabase";

export function Auth0SupabaseBridge({ children }: { children: ReactNode }) {
  const { getIdTokenClaims } = useAuth0();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSupabaseAccessTokenProvider(async () => {
      const claims = await getIdTokenClaims();
      return claims?.__raw ?? null;
    });
    setReady(true);

    return () => {
      setSupabaseAccessTokenProvider(null);
    };
  }, [getIdTokenClaims]);

  return ready ? children : null;
}
