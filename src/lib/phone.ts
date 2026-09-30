// Phone numbers for the iMessage link. Stored and compared in E.164 only.

const E164 = /^\+[1-9]\d{6,14}$/;

/** Strips spaces, dashes, dots and brackets. Returns null unless the result is E.164 (+ and country code). */
export function normalizePhone(input: string): string | null {
  const s = input.trim().replace(/[\s\-().]/g, "");
  return E164.test(s) ? s : null;
}

/** +2348012344321 -> +234******4321. Never log or show a full number. */
export function maskPhone(phone: string): string {
  if (phone.length <= 8) return "*".repeat(phone.length);
  return `${phone.slice(0, 4)}${"*".repeat(phone.length - 8)}${phone.slice(-4)}`;
}

/** Masks anything that looks like a phone number inside a message before it's logged. */
export function maskPhonesIn(text: string): string {
  return text.replace(/\+\d{7,15}/g, (m) => maskPhone(m));
}

/**
 * Opens Messages with the text pre-filled. `&body=` is the form Photon's deliverability guide uses
 * and the one iOS and macOS accept.
 */
export function smsLink(number: string, body: string): string {
  return `sms:${number}&body=${encodeURIComponent(body)}`;
}
