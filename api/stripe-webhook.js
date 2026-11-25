
import { createHmac, timingSafeEqual } from "node:crypto";

export const config = {
  api: {
    bodyParser: false
  }
};

// Retrieve a subscription directly from Stripe.
async function getStripeSubscription(subscriptionId, secretKey) {
  const response = await fetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Stripe subscription retrieval failed:", data);
    throw new Error("Unable to retrieve Stripe subscription.");
  }

  return data;
}

// Save or update a subscription in Supabase.
async function syncSubscription(
  subscription,
  eventType,
  supabaseUrl,
  serviceKey
) {
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    throw new Error("Subscription is missing user_id metadata.");
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId || !subscription.id) {
    throw new Error("Subscription is missing its customer or ID.");
  }

  const periodEndTimestamp =
    subscription.items?.data?.[0]?.current_period_end ??
    subscription.current_period_end ??
    null;

  const periodEnd =
    periodEndTimestamp !== null &&
    Number.isFinite(Number(periodEndTimestamp))
      ? new Date(Number(periodEndTimestamp) * 1000).toISOString()
      : null;

  const cancelAtTimestamp = subscription.cancel_at ?? null;

  const hasFutureCancelAt =
    cancelAtTimestamp !== null &&
    Number.isFinite(Number(cancelAtTimestamp)) &&
    Number(cancelAtTimestamp) * 1000 > Date.now();

  const cancelAtMatchesPeriodEnd =
    hasFutureCancelAt &&
    periodEndTimestamp !== null &&
    Number(cancelAtTimestamp) === Number(periodEndTimestamp);

  const cancelAtPeriodEnd =
    eventType === "customer.subscription.deleted"
      ? false
      : (
          subscription.cancel_at_period_end === true ||
          cancelAtMatchesPeriodEnd
        );

  const record = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status:
      eventType === "customer.subscription.deleted"
        ? "canceled"
        : subscription.status,
    current_period_end: periodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    updated_at: new Date().toISOString()
  };

  const response = await fetch(
    `${supabaseUrl}/rest/v1/user_subscriptions?on_conflict=user_id`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(record)
    }
  );

  if (!response.ok) {
    console.error("Supabase subscription update failed:", await response.text());
    throw new Error("Unable to update subscription database.");
  }

  return userId;
}

// Create an in-app notification.
// Stripe event IDs prevent duplicate notifications on webhook retries.
async function createNotification(
  supabaseUrl,
  serviceKey,
  notification
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/user_notifications?on_conflict=stripe_event_id`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal"
      },
      body: JSON.stringify(notification)
    }
  );

  if (!response.ok) {
    console.error("Notification creation failed:", await response.text());
    throw new Error("Unable to create notification.");
  }
}

// Find the subscription ID on an invoice.
// Supports both newer and older Stripe invoice structures.
function getInvoiceSubscriptionId(invoice) {
  const subscription =
    invoice.parent?.subscription_details?.subscription ??
    invoice.subscription ??
    invoice.lines?.data?.[0]?.parent?.subscription_item_details?.subscription ??
    null;

  return typeof subscription === "string"
    ? subscription
    : subscription?.id ?? null;
}

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

  const supabaseUrl = SUPABASE_URL.replace(/\/$/, "");

  try {
    // 1. Read the original, unmodified request body.
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
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

      const receivedSignature = Buffer.from(signature, "hex");

      return (
        receivedSignature.length === expectedSignature.length &&
        timingSafeEqual(receivedSignature, expectedSignature)
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
    let invoice = null;

    // 4. Successful subscription checkout.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (
        session.mode !== "subscription" ||
        !session.subscription
      ) {
        return res.status(200).json({ received: true });
      }

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;

      subscription = await getStripeSubscription(
        subscriptionId,
        STRIPE_SECRET_KEY
      );

      const userId =
        subscription.metadata?.user_id ||
        session.metadata?.user_id ||
        session.client_reference_id;

      if (!userId) {
        throw new Error("Checkout session is missing user metadata.");
      }

      subscription.metadata = {
        ...subscription.metadata,
        user_id: userId
      };
    }

    // 5. Subscription updates and cancellations.
    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      subscription = event.data.object;
    }

    // 6. Payment failures and successful payments.
    if (
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.paid"
    ) {
      invoice = event.data.object;

      const subscriptionId = getInvoiceSubscriptionId(invoice);

      // Ignore invoices that aren't connected to subscriptions.
      if (!subscriptionId) {
        return res.status(200).json({ received: true });
      }

      subscription = await getStripeSubscription(
        subscriptionId,
        STRIPE_SECRET_KEY
      );

      // Fall back to invoice metadata if necessary.
      if (!subscription.metadata?.user_id && invoice.metadata?.user_id) {
        subscription.metadata = {
          ...subscription.metadata,
          user_id: invoice.metadata.user_id
        };
      }
    }

    // Ignore unrelated Stripe events.
    if (!subscription) {
      return res.status(200).json({ received: true });
    }

    // 7. Synchronize the subscription in Supabase.
    const userId = await syncSubscription(
      subscription,
      event.type,
      supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY
    );

    // 8. Notify the customer when a payment fails.
    if (event.type === "invoice.payment_failed") {
      await createNotification(
        supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          user_id: userId,
          type: "payment_failed",
          title: "Payment couldn't be processed",
          message:
            "We couldn't process your subscription payment. Please update your payment method in your billing settings. We'll notify you when payment is recovered.",
          stripe_event_id: event.id
        }
      );

      console.log("Payment failure notification created:", userId);
    }

    // 9. Notify the customer when a previously failed payment recovers.
    if (event.type === "invoice.paid") {
      const failedResponse = await fetch(
        `${supabaseUrl}/rest/v1/user_notifications?user_id=eq.${encodeURIComponent(userId)}&type=eq.payment_failed&resolved_at=is.null&select=id`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );

      if (!failedResponse.ok) {
        console.error(
          "Could not check previous payment failures:",
          await failedResponse.text()
        );
        throw new Error("Unable to check payment recovery status.");
      }

      const unresolvedFailures = await failedResponse.json();

      // Only send a recovery notification if a failure existed.
      if (unresolvedFailures.length > 0) {
        const resolveResponse = await fetch(
          `${supabaseUrl}/rest/v1/user_notifications?user_id=eq.${encodeURIComponent(userId)}&type=eq.payment_failed&resolved_at=is.null`,
          {
            method: "PATCH",
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal"
            },
            body: JSON.stringify({
              resolved_at: new Date().toISOString()
            })
          }
        );

        if (!resolveResponse.ok) {
          console.error(
            "Could not resolve previous payment failures:",
            await resolveResponse.text()
          );
          throw new Error("Unable to resolve previous payment failures.");
        }

        await createNotification(
          supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY,
          {
            user_id: userId,
            type: "payment_recovered",
            title: "Payment successfully recovered",
            message:
              "Your subscription payment was successful. Your payment issue has been resolved.",
            stripe_event_id: event.id
          }
        );

        console.log("Payment recovery notification created:", userId);
      }
    }

    console.log(
      "Stripe webhook successfully processed:",
      event.type,
      subscription.id
    );

    return res.status(200).json({
      received: true
    });

  } catch (error) {
    console.error("Stripe webhook error:", error.message);

    return res.status(500).json({
      error: "Webhook processing failed."
    });
  }
}
