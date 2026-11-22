
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      STRIPE_SECRET_KEY,
      STRIPE_PRICE_ID,
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY
    } = process.env;

    if (
      !STRIPE_SECRET_KEY ||
      !STRIPE_PRICE_ID ||
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error("Missing server environment variables.");
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
        }
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

    // Check subscription status on the server.
    const subscriptionResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/user_subscriptions?select=status,current_period_end&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        cache: "no-store"
      }
    );

    if (!subscriptionResponse.ok) {
      throw new Error("Unable to verify subscription status.");
    }

    const rows = await subscriptionResponse.json();
    const subscription = rows[0];

    const validStatus =
      subscription &&
      ["active", "trialing"].includes(subscription.status);

    const validPeriod =
      subscription?.current_period_end &&
      new Date(subscription.current_period_end).getTime() > Date.now();

    // Do not create another subscription for an active subscriber.
    if (validStatus && validPeriod) {
      return res.status(200).json({
        alreadySubscribed: true
      });
    }

    // Create Stripe Checkout session.
    const stripeParams = new URLSearchParams();

    stripeParams.append("mode", "subscription");
    stripeParams.append("line_items[0][price]", STRIPE_PRICE_ID);
    stripeParams.append("line_items[0][quantity]", "1");


    stripeParams.append(
      "success_url",
      "https://masterballer.vercel.app/dashboard.html?checkout=success"
    );

    // Replace this with the actual free-report page URL.
    stripeParams.append(
      "cancel_url",
      "https://masterballer.vercel.app/results.html"
    );

    stripeParams.append("customer_email", user.email);
    stripeParams.append("client_reference_id", user.id);
    stripeParams.append("metadata[user_id]", user.id);
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
      console.error("Stripe error:", session);

      return res.status(400).json({
        error: "Unable to create checkout session."
      });
    }

    return res.status(200).json({
      url: session.url
    });

  } catch (error) {
    console.error("Checkout error:", error);

    return res.status(500).json({
      error: "Something went wrong creating checkout."
    });
  }
}
