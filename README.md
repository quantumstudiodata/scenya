# Scenya — Series & Dramas

Plataforma web de miniseries. Next.js + Supabase (usuarios y catálogo) + Stripe (suscripción).

- **10 episodios gratis** por serie.
- **Acceso Total**: $99 MXN/mes o $999 MXN/año. Desbloquea todo el catálogo.

## Puesta en marcha

### 1. Supabase
1. En **SQL Editor**, ejecuta `supabase/migrations/0001_init.sql` (crea las tablas).
2. Opcional: ejecuta `supabase/seed.sql` para cargar 6 series de ejemplo.
3. En **Authentication → URL Configuration**, pon como *Site URL* la URL de Vercel
   (p. ej. `https://scenya.vercel.app`) y agrega `https://scenya.vercel.app/auth/callback` en *Redirect URLs*.

### 2. Stripe (modo prueba)
1. **Productos → Crear producto** "Acceso Total" con dos precios recurrentes:
   $99 MXN mensual y $999 MXN anual (un producto por plan). Copia los dos IDs `prod_...`.
2. **Developers → Webhooks → Add endpoint**: `https://scenya.vercel.app/api/webhook` con los eventos
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Copia el *Signing secret* (`whsec_...`).
3. **Settings → Billing → Customer portal**: actívalo para que los usuarios puedan cancelar.

### 3. Vercel
Importa el repo (preset Next.js) y agrega las variables de `.env.example`.

## Desarrollo local
```bash
cp .env.example .env.local   # y llena los valores
npm install
npm run dev
```

## Subir videos
Cada episodio tiene su URL en la tabla `episode_videos`, que el navegador no puede leer:
el servidor solo entrega la URL si el episodio es gratis o el usuario tiene Acceso Total.
