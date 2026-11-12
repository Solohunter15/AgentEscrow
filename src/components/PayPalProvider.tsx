"use client";

import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import type { ReactNode } from "react";

export function PayPalProvider({
  clientId,
  children,
}: {
  clientId?: string;
  children: ReactNode;
}) {
  if (!clientId || clientId === "your_paypal_sandbox_client_id") {
    return <>{children}</>;
  }

  return (
    <PayPalScriptProvider
      options={{
        clientId,
        currency: "USD",
        intent: "capture",
      }}
    >
      {children}
    </PayPalScriptProvider>
  );
}
