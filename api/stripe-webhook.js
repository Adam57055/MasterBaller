
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
    // Read the unmodified request body for signature verification.
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const rawBody = Buffer.concat(chunks);
    const signatureHeader = req.headers["stripe-signature"];

    if (!signatureHeader) {
      return res.status(400).json({ error: "Missing Stripe signature." });
    }

    // Verify that the event genuinely came from Stripe.
    const signatureParts = signatureHeader.split(",");
    const timestamp = signatureParts
      .find(part => part.startsWith("t="))
      ?.slice(2);

    const signatures = signatureParts
      .filter(part => part.startsWith("v1="))
      .map(part => part.slice(3));

    if (!timestamp || signatures.length === 0) {
      return res.status(400).json({ error: "Invalid Stripe signature." });
    }

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));

    if (!Number.isFinite(age) || age > 300) {
      return res.status(400).json({ error: "Expired Stripe signature." });
    }

    const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;

    const expectedSignature = crypto
      .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
      .update(signedPayload)
      .digest();

    const validSignature = signatures.some(signature => {
      if (!/^[a-f0-9]{64}$/i.test(signature)) return false;

      const receivedSignature = Buffer.from(signature, "hex");

      return (
        receivedSignature.length === expectedSignature.length &&
        crypto.timingSafeEqual(receivedSignature, expectedSignature)
      );
    });

    if (!validSignature) {
      return res.status(400).json({ error: "Signature verification failed." });
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    let subscription = null;

    // A completed Checkout session means we should retrieve its subscription.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.mode !== "subscription" || !session.subscription) {
        return res.status(200).json({ received: true });
      }

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;

      const stripeResponse = await fetch(
        `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
        {
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`
          }
        }
      );

      subscription = await stripeResponse.json();

      if (!stripeResponse.ok) {
        throw new Error("Unable to retrieve Stripe subscription.");
      }

      // Use the verified account ID associated with Checkout.
      subscription.metadata = {
        ...subscription.metadata,
        user_id:
          subscription.metadata?.user_id ||
          session.metadata?.user_id ||
          session.client_reference_id
      };
    }

    // Keep the database synchronized with subscription changes.
    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      subscription = event.data.object;
    }

    // Ignore unrelated Stripe events.
    if (!subscription) {
      return res.status(200).json({ received: true });
    }

    const userId = subscription.metadata?.user_id;

    if (!userId) {
      console.error("Subscription event has no user_id metadata.");
      return res.status(400).json({ error: "Missing user metadata." });
    }

    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

    const record = {
      user_id: userId,
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subscription.id,
      status:
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : subscription.status,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString()
    };

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
      console.error("Supabase update failed:", errorText);
      throw new Error("Unable to update subscription database.");
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("Stripe webhook error:", error);

    return res.status(500).json({
      error: "Webhook processing failed."
    });
  }
};

// Disable automatic body parsing so Stripe's signature can be verified.
module.exports.config = {
  api: {
    bodyParser: false
  }
};
