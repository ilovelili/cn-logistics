import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App.tsx";
import { Auth0SupabaseBridge } from "./components/Auth0SupabaseBridge.tsx";
import { auth0Config } from "./lib/auth0.ts";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      authorizationParams={{
        connection: "email",
        redirect_uri: window.location.origin,
        scope: "openid profile email",
        ui_locales: "ja",
      }}
    >
      <Auth0SupabaseBridge>
        <App />
      </Auth0SupabaseBridge>
    </Auth0Provider>
  </StrictMode>,
);
