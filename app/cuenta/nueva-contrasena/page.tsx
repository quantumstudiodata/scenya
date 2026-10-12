import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChangePassword } from "../AccountForms";

export const dynamic = "force-dynamic";

// Llegan aquí desde el enlace de "¿Olvidaste tu contraseña?".
export default async function NuevaContrasena() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");
  const recent = user.recovery_sent_at && Date.now() - new Date(user.recovery_sent_at).getTime() < 60 * 60 * 1000;
  if (!recent) redirect("/cuenta");

  return (
    <div className="wrap">
      <div className="panel">
        <h1>Nueva contraseña</h1>
        <p className="muted">{user.email}</p>
        <ChangePassword email={user.email ?? ""} needsCurrent={false} />
        <Link className="link" href="/cuenta">Ir a Mi cuenta</Link>
      </div>
    </div>
  );
}
