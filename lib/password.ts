// Reglas de contraseña: ni muy estrictas ni muy flexibles.
export const PASSWORD_RULES = [
  { id: "len", label: "Entre 8 y 64 caracteres", test: (p: string) => p.length >= 8 && p.length <= 64 },
  { id: "letter", label: "Al menos una letra", test: (p: string) => /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(p) },
  { id: "num", label: "Al menos un número", test: (p: string) => /\d/.test(p) },
  { id: "chars", label: "Solo letras, números y símbolos ! @ # $ % & * . _ - ? +", test: (p: string) => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9!@#$%&*._\-?+]*$/.test(p) },
] as const;

export function passwordOk(p: string) {
  return PASSWORD_RULES.every((r) => r.test(p));
}
