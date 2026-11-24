
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY
  } = process.env;

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return res.status(500).json({
      error: "Server configuration error."
    });
  }

  try {
    // Verify the user's Supabase session.
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Not authenticated."
      });
    }

    const token = authHeader.slice(7);

    const authResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({
        error: "Invalid session."
      });
    }

    const user = await authResponse.json();

    if (!user || !user.id) {
      return res.status(401).json({
        error: "Unable to verify user."
      });
    }

    // Check subscription using the server-only service role key.
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
      throw new Error("Could not check subscription.");
    }

    const rows = await subscriptionResponse.json();
    const subscription = rows[0];

    if (!subscription) {
      return res.status(200).json({
        subscribed: false
      });
    }

    const validStatus = [
      "active",
      "trialing"
    ].includes(subscription.status);

    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end).getTime()
      : 0;

    const periodIsValid =
      Number.isFinite(periodEnd) &&
      periodEnd > Date.now();

    return res.status(200).json({
      subscribed: Boolean(validStatus && periodIsValid)
    });

  } catch (error) {
    console.error("Subscription check failed:", error);

    return res.status(500).json({
      error: "Subscription check failed."
    });
  }
};
