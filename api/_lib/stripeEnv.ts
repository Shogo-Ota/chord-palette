import Stripe from "stripe";

export function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export function createStripeClient(): Stripe {
  return new Stripe(getEnv("STRIPE_SECRET_KEY"));
}
