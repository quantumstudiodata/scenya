import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function Entrar() {
  return (
    <div className="wrap">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
