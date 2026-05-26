import Stripe from "stripe";

import {
  generateLicenseKey,
  isLicenseKeyValidFor,
  LICENSE_FORMAT_REGEX,
} from "./license.js";

export type IssueLicenseResult =
  | { ok: true; license: string; source: "metadata" | "issued" }
  | { ok: false; code: "invalid_session" | "not_paid" | "pending" | "product_mismatch" | "stripe_error"; message: string };

const SESSION_ID_REGEX = /^cs_(test_|live_)?[a-zA-Z0-9]+$/;

export function isCheckoutSessionId(value: string): boolean {
  return SESSION_ID_REGEX.test(value);
}

async function sessionMatchesProduct(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  expectedProductId: string
): Promise<boolean> {
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 5,
    expand: ["data.price.product"],
  });
  return lineItems.data.some((li) => {
    const product = li.price?.product;
    const productId =
      typeof product === "string"
        ? product
        : product && "id" in product
          ? product.id
          : undefined;
    return productId === expectedProductId;
  });
}

/**
 * 支払い済み Checkout Session からライセンスキーを返す。
 * Webhook 未到達時はここで発行し Customer Metadata に保存（冪等）。
 */
export async function issueLicenseForCheckoutSession(
  stripe: Stripe,
  sessionId: string,
  licenseSecret: string,
  expectedProductId?: string
): Promise<IssueLicenseResult> {
  if (!isCheckoutSessionId(sessionId)) {
    return { ok: false, code: "invalid_session", message: "Invalid session_id" };
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return { ok: false, code: "invalid_session", message: "Session not found" };
  }

  if (session.payment_status !== "paid") {
    return { ok: false, code: "not_paid", message: "Payment not completed" };
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!customerId || !paymentIntentId) {
    return {
      ok: false,
      code: "pending",
      message: "Waiting for Stripe to attach customer (retry shortly)",
    };
  }

  if (expectedProductId) {
    try {
      const matched = await sessionMatchesProduct(stripe, session, expectedProductId);
      if (!matched) {
        return { ok: false, code: "product_mismatch", message: "Product mismatch" };
      }
    } catch {
      /* line item 取得失敗時は続行 */
    }
  }

  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch {
    return { ok: false, code: "stripe_error", message: "Could not load customer" };
  }

  if ("deleted" in customer && customer.deleted) {
    return { ok: false, code: "stripe_error", message: "Customer deleted" };
  }

  const activeCustomer = customer as Stripe.Customer;
  const existing = activeCustomer.metadata?.cp_license_key;
  const existingPi = activeCustomer.metadata?.cp_payment_intent_id;
  if (
    existing &&
    LICENSE_FORMAT_REGEX.test(existing) &&
    existingPi &&
    isLicenseKeyValidFor(existing, customerId, existingPi, licenseSecret)
  ) {
    return { ok: true, license: existing, source: "metadata" };
  }

  let license: string;
  try {
    license = generateLicenseKey(customerId, paymentIntentId, licenseSecret);
  } catch {
    return { ok: false, code: "stripe_error", message: "License generation failed" };
  }

  try {
    await stripe.customers.update(customerId, {
      metadata: {
        cp_license_key: license,
        cp_payment_intent_id: paymentIntentId,
        cp_issued_at: new Date().toISOString(),
      },
    });
  } catch {
    return { ok: false, code: "stripe_error", message: "Could not save license" };
  }

  return { ok: true, license, source: "issued" };
}
