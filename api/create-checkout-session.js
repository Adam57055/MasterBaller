
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const {
      STRIPE_SECRET_KEY,
      STRIPE_PRICE_ID,
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY,
      SITE_URL
    } = process.env;

    // Verify required environment variables.
    if (
      !STRIPE_SECRET_KEY ||
      !STRIPE_PRICE_ID ||
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !SITE_URL
    ) {
      return res.status(500).json({
        error: "Missing server environment variables."
      });
    }

    // Verify SITE_URL configuration.
    let siteUrl;

    try {
      const parsedUrl = new URL(SITE_URL);

      if (
        parsedUrl.protocol !== "https:" &&
        parsedUrl.hostname !== "localhost"
      ) {
        throw new Error("SITE_URL must use HTTPS.");
      }

      siteUrl = parsedUrl.origin;
    } catch {
      return res.status(500).json({
        error: "Invalid SITE_URL configuration."
      });
    }

    // Verify the logged-in Supabase user.
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Please log in first."
      });
    }

    const accessToken = authHeader.slice(7);

    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`
        },
        cache: "no-store"
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Your session is invalid. Please log in again."
      });
    }

    const user = await userResponse.json();

    if (!user.id || !user.email) {
      return res.status(401).json({
        error: "Unable to verify your account."
      });
    }

    // Check the user's existing subscription.
    const subscriptionResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/user_subscriptions?select=status,current_period_end,stripe_subscription_id&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        cache: "no-store"
      }
    );

    if (!subscriptionResponse.ok) {
      console.error(
        "Subscription lookup failed:",
        subscriptionResponse.status
      );

      throw new Error("Unable to verify subscription status.");
    }

    const rows = await subscriptionResponse.json();
    const subscription = rows[0];

    if (subscription) {
      const status = subscription.status;

      const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end).getTime()
        : 0;

      const periodIsValid =
        Number.isFinite(periodEnd) &&
        periodEnd > Date.now();

      // Existing active or trialing subscription.
      if (["active", "trialing"].includes(status)) {
        if (periodIsValid) {
          return res.status(200).json({
            alreadySubscribed: true,
            message: "You already have an active subscription."
          });
        }

        // Do not risk creating a duplicate when the
        // subscription record is inconsistent.
        return res.status(409).json({
          subscriptionNeedsVerification: true,
          error: "Your subscription needs verification. Please contact support."
        });
      }

      // Existing subscription requires attention.
      if (
        ["past_due", "unpaid", "paused", "incomplete"].includes(status)
      ) {
        return res.status(409).json({
          subscriptionNeedsAttention: true,
          subscriptionStatus: status,
          error: "Your existing subscription needs attention. Please resolve it before starting another subscription."
        });
      }

      // A canceled or expired subscription can be replaced.
      if (
        !["canceled", "incomplete_expired"].includes(status)
      ) {
        return res.status(409).json({
          subscriptionNeedsVerification: true,
          error: "We could not verify your subscription status. Please contact support."
        });
      }
    }

    // Create a new Stripe Checkout session.
    const stripeParams = new URLSearchParams();

    stripeParams.append("mode", "subscription");

    stripeParams.append(
      "line_items[0][price]",
      STRIPE_PRICE_ID
    );

    stripeParams.append(
      "line_items[0][quantity]",
      "1"
    );

    stripeParams.append(
      "success_url",
      `${siteUrl}/dashboard.html?checkout=success`
    );

    stripeParams.append(
      "cancel_url",
      `${siteUrl}/results.html`
    );

    // Associate the Checkout session with the Supabase user.
    stripeParams.append(
      "customer_email",
      user.email
    );

    stripeParams.append(
      "client_reference_id",
      user.id
    );

    stripeParams.append(
      "metadata[user_id]",
      user.id
    );

    // Attach the user ID directly to the Stripe subscription.
    stripeParams.append(
      "subscription_data[metadata][user_id]",
      user.id
    );

    const stripeResponse = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: stripeParams
      }
    );

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error(
        "Stripe Checkout error:",
        session.error?.type || "Unknown Stripe error",
        session.error?.code || ""
      );

      return res.status(400).json({
        error: "Unable to create checkout session."
      });
    }

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    return res.status(200).json({
      url: session.url
    });

  } catch (error) {
    console.error("Checkout error:", error.message);

    return res.status(500).json({
      error: "Something went wrong creating checkout."
    });
  }
}
