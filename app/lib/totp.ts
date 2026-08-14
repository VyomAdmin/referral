import { generateSecret, generateURI, verify } from "otplib";
import qrcode from "qrcode";

export function generateTotpSecret() {
  return generateSecret();
}

export async function verifyTotpCode(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const result = await verify({ secret, token: code, epochTolerance: [30, 30] });
  return result.valid;
}

export async function totpEnrollmentQrCode(email: string, secret: string) {
  const otpauthUrl = generateURI({ issuer: "NuVision Referrals", label: email, secret });
  return qrcode.toDataURL(otpauthUrl);
}
