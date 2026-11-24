
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      STRIPE_SECRET_KEY,
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY
    } = process.env;

    if (
      !STRIPE_SECRET_KEY ||
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

    if (!user.id) {
      return res.status(401).json({
        error: "Unable to verify your account."
      });
    }

    // Retrieve this user's Stripe customer ID.
    const subscriptionResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/user_subscriptions?select=stripe_customer_id&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        cache: "no-store"
      }
    );

    if (!subscriptionResponse.ok) {
      throw new Error("Unable to retrieve subscription.");
    }

    const rows = await subscriptionResponse.json();
    const customerId = rows[0]?.stripe_customer_id;

    if (!customerId) {
      return res.status(404).json({
        error: "No Stripe customer account was found."
      });
    }

    // Create Stripe Customer Portal session.
    const stripeParams = new URLSearchParams();

    stripeParams.append("customer", customerId);
    stripeParams.append(
      "return_url",
      "https://masterballer.vercel.app/dashboard.html"
    );

    const stripeResponse = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
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
      console.error("Stripe portal error:", session);

      return res.status(400).json({
        error: "Unable to open billing portal."
      });
    }

    return res.status(200).json({
      url: session.url
    });

  } catch (error) {
    console.error("Customer portal error:", error);

    return res.status(500).json({
      error: "Something went wrong opening billing settings."
    });
  }
}
