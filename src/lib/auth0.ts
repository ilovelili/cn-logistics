export const auth0Config = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN || "mju.auth0.com",
  clientId:
    import.meta.env.VITE_AUTH0_CLIENT_ID || "IHxO9zqK3kwJliO0MToWaR6W8LIpt6Du",
} as const;
