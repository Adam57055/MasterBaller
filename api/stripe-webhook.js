
import { createHmac, timingSafeEqual } from "node:crypto";

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  } = process.env;

  if (
    !STRIPE_SECRET_KEY ||
    !STRIPE_WEBHOOK_SECRET ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return res.status(500).json({
      error: "Missing server environment variables."
    });
  }

  try {
    // 1. Read the original, unmodified request body.
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk)
      );
    }

    const rawBody = Buffer.concat(chunks);
    const signatureHeader = req.headers["stripe-signature"];

    if (!signatureHeader) {
      return res.status(400).json({
        error: "Missing Stripe signature."
      });
    }

    // 2. Verify Stripe's signature.
    const signatureParts = signatureHeader.split(",");

    const timestamp = signatureParts
      .find(part => part.startsWith("t="))
      ?.slice(2);

    const signatures = signatureParts
      .filter(part => part.startsWith("v1="))
      .map(part => part.slice(3));

    if (
      !timestamp ||
      !/^\d+$/.test(timestamp) ||
      signatures.length === 0
    ) {
      return res.status(400).json({
        error: "Invalid Stripe signature."
      });
    }

    const age = Math.abs(
      Date.now() / 1000 - Number(timestamp)
    );

    if (!Number.isFinite(age) || age > 300) {
      return res.status(400).json({
        error: "Expired Stripe signature."
      });
    }

    const expectedSignature = createHmac(
      "sha256",
      STRIPE_WEBHOOK_SECRET
    )
      .update(`${timestamp}.${rawBody.toString("utf8")}`)
      .digest();

    const validSignature = signatures.some(signature => {
      if (!/^[a-f0-9]{64}$/i.test(signature)) {
        return false;
      }

      const receivedSignature = Buffer.from(
        signature,
        "hex"
      );

      return (
        receivedSignature.length === expectedSignature.length &&
        timingSafeEqual(
          receivedSignature,
          expectedSignature
        )
      );
    });

    if (!validSignature) {
      return res.status(400).json({
        error: "Signature verification failed."
      });
    }

    // 3. Parse the verified event.
    const event = JSON.parse(rawBody.toString("utf8"));

    let subscription = null;

    // 4. Handle successful subscription checkout.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (
        session.mode !== "subscription" ||
        !session.subscription
      ) {
        return res.status(200).json({
          received: true
        });
      }

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;

      const stripeResponse = await fetch(
        `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
        {
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`
          }
        }
      );

      const stripeData = await stripeResponse.json();

      if (!stripeResponse.ok) {
        console.error(
          "Stripe subscription retrieval failed:",
          stripeData
        );

        throw new Error(
          "Unable to retrieve Stripe subscription."
        );
      }

      subscription = stripeData;

      // Associate the subscription with the correct user.
      const userId =
        subscription.metadata?.user_id ||
        session.metadata?.user_id ||
        session.client_reference_id;

      if (!userId) {
        throw new Error(
          "Checkout session is missing user metadata."
        );
      }

      // 5. Handle subscription updates and cancellations.
      subscription.metadata = {
        ...subscription.metadata,
        user_id: userId
      };
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      subscription = event.data.object;
    }

    // Ignore events that do not affect subscriptions.
    if (!subscription) {
      return res.status(200).json({
        received: true
      });
    }

    // 6. Identify the Supabase user.
    const userId = subscription.metadata?.user_id;

    if (!userId) {
      console.error(
        "Subscription event has no user_id metadata."
      );

      return res.status(400).json({
        error: "Missing user metadata."
      });
    }

    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

    if (!customerId || !subscription.id) {
      throw new Error(
        "Subscription is missing its customer or subscription ID."
      );
    }

    // 7. Calculate subscription period information.
    const periodEndTimestamp =
      subscription.items?.data?.[0]?.current_period_end ??
      subscription.current_period_end ??
      null;

    const periodEnd =
      periodEndTimestamp !== null &&
      Number.isFinite(Number(periodEndTimestamp))
        ? new Date(
            Number(periodEndTimestamp) * 1000
          ).toISOString()
        : null;

    const cancelAtTimestamp =
      subscription.cancel_at ?? null;

    const hasFutureCancelAt =
      cancelAtTimestamp !== null &&
      Number.isFinite(Number(cancelAtTimestamp)) &&
      Number(cancelAtTimestamp) * 1000 > Date.now();

    const cancelAtMatchesPeriodEnd =
      hasFutureCancelAt &&
      periodEndTimestamp !== null &&
      Number(cancelAtTimestamp) ===
        Number(periodEndTimestamp);

    const cancelAtPeriodEnd =
      event.type === "customer.subscription.deleted"
        ? false
        : (
            subscription.cancel_at_period_end === true ||
            cancelAtMatchesPeriodEnd
          );

    // 8. Prepare the Supabase subscription record.
    const record = {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,

      status:
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : subscription.status,

      current_period_end: periodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      updated_at: new Date().toISOString()
    };

    // 9. Save the new Live Stripe information in Supabase.
    const databaseResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/user_subscriptions?on_conflict=user_id`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(record)
      }
    );

    if (!databaseResponse.ok) {
      const errorText = await databaseResponse.text();

      console.error(
        "Supabase update failed:",
        errorText
      );

      throw new Error(
        "Unable to update subscription database."
      );
    }

    console.log(
      "Subscription successfully synchronized:",
      event.type,
      subscription.id
    );

    return res.status(200).json({
      received: true
    });

  } catch (error) {
    console.error(
      "Stripe webhook error:",
      error.message
    );

    return res.status(500).json({
      error: "Webhook processing failed."
    });
  }
}
