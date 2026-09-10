import { Suspense } from "react";
import type { Metadata } from "next";

import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Entrar · ECO-SIGN" };

/**
 * `useSearchParams` obliga a envolver el formulario en Suspense para que la
 * página pueda prerenderizarse.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <FormularioLogin />
    </Suspense>
  );
}
