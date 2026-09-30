const E164 = /^\+[1-9]\d{6,14}$/;

export function isPhone(s: string): boolean {
  return E164.test(s);
}

/** +2348012344321 -> +234******4321. Full numbers never reach a log line. */
export function maskPhone(phone: string): string {
  if (phone.length <= 8) return "*".repeat(phone.length);
  return `${phone.slice(0, 4)}${"*".repeat(phone.length - 8)}${phone.slice(-4)}`;
}

/** Masks phone-like runs inside any text before it is logged. */
export function maskPhonesIn(text: string): string {
  return text.replace(/\+\d{7,15}/g, (m) => maskPhone(m));
}
