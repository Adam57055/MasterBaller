
const SUPABASE_URL = "https://thbrjtqbusxmlufbjyby.supabase.co";
const SUPABASE_KEY = "sb_publishable_xMZ7Mg7jnB-_jGxivC1hmw_nvlADovW";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// =============================
// AGE VALIDATION
// =============================

function calculateAge(dateOfBirth) {
  const birthDate = new Date(dateOfBirth + "T00:00:00");
  const today = new Date();

  if (Number.isNaN(birthDate.getTime()) || birthDate > today) {
    return -1;
  }

  let age = today.getFullYear() - birthDate.getFullYear();

  const birthdayHasNotOccurred =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() < birthDate.getDate());

  if (birthdayHasNotOccurred) age--;

  return age;
}

// =============================
// SUBSCRIPTION CHECK
// =============================

async function checkSubscription(session) {
  if (!session?.access_token) {
    throw new Error("Please log in first.");
  }

  const response = await fetch("/api/check-subscription", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`
    },
    cache: "no-store"
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("Unable to verify your subscription. Please try again.");
  }

  if (!response.ok) {
    throw new Error(
      result.error || "Unable to check subscription."
    );
  }

  return result.subscribed === true;
}

// =============================
// STRIPE CHECKOUT
// =============================

async function redirectToCheckout(session) {
  if (!session?.access_token) {
    throw new Error("Please log in before continuing to payment.");
  }

  const response = await fetch("/api/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    cache: "no-store"
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("Unable to start checkout. Please try again.");
  }

  if (!response.ok) {
    throw new Error(
      result.error || "Unable to start checkout."
    );
  }

  if (result.alreadySubscribed) {
    window.location.replace("dashboard.html");
    return;
  }

  if (!result.url) {
    throw new Error("Checkout URL was not returned.");
  }

  window.location.assign(result.url);
}

// =============================
// LOGIN
// =============================

const loginForm = document.querySelector("#login-form");

if (loginForm) {
  const message = document.querySelector("#form-message");
  const button = loginForm.querySelector("button");

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!loginForm.reportValidity()) return;

    const email = loginForm.querySelector("#email").value.trim();
    const password = loginForm.querySelector("#password").value;

    button.disabled = true;
    message.textContent = "Logging in...";

    try {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      if (!data.session) {
        throw new Error("Login succeeded, but no session was returned.");
      }

      message.textContent = "Login successful. Checking subscription...";

      const subscribed = await checkSubscription(data.session);

      window.location.replace(
        subscribed ? "dashboard.html" : "payment.html"
      );

    } catch (error) {
      message.textContent =
        error.message || "Unable to log in. Please try again.";

      button.disabled = false;
    }
  });
}

// =============================
// SIGN UP
// =============================

const signupForm = document.querySelector("#signup-form");

if (signupForm) {
  const message = document.querySelector("#form-message");
  const button = signupForm.querySelector("button");
  const dateOfBirthInput =
    signupForm.querySelector("#date-of-birth");

  if (dateOfBirthInput) {
    dateOfBirthInput.max = new Date().toISOString().split("T")[0];
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!signupForm.reportValidity()) return;

    const fullName =
      signupForm.querySelector("#full-name").value.trim();

    const email =
      signupForm.querySelector("#email").value.trim();

    const password =
      signupForm.querySelector("#password").value;

    if (!dateOfBirthInput) {
      message.textContent = "Date of birth is required.";
      return;
    }

    const age = calculateAge(dateOfBirthInput.value);

    if (age < 0) {
      message.textContent = "Please enter a valid date of birth.";
      return;
    }

    if (age < 13) {
      message.textContent =
        "You must be at least 13 years old to create a MasterBaller account.";
      return;
    }

    button.disabled = true;
    message.textContent = "Creating your account...";

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          },
          emailRedirectTo:
            `${window.location.origin}/payment.html`
        }
      });

      if (error) throw error;

      if (data.session) {
        message.textContent =
          "Account created! Checking your account...";

        window.location.replace("payment.html");
      } else {
        message.textContent =
          message.textContent =
  "Account created! Please verify your email. Check your inbox and spam folder for the verification email. After verification, log in to continue.";

        button.disabled = false;
      }

    } catch (error) {
      message.textContent =
        error.message || "Unable to create your account.";

      button.disabled = false;
    }
  });
}

// =============================
// PAYMENT PAGE
// =============================

const paymentPage = document.querySelector("#payment-page");

if (paymentPage) {
  const message = document.querySelector("#payment-message");

  async function beginPayment() {
    try {
      message.textContent = "Checking your account...";

      const { data, error } =
        await supabaseClient.auth.getSession();

      if (error) throw error;

      if (!data.session) {
        window.location.replace("login.html");
        return;
      }

      // Active subscribers should never be charged again.
      const subscribed = await checkSubscription(data.session);

      if (subscribed) {
        message.textContent =
          "Subscription active! Opening your dashboard...";

        window.location.replace("dashboard.html");
        return;
      }

      // Only users without an active subscription reach Checkout.
      message.textContent = "Opening secure checkout...";

      await redirectToCheckout(data.session);

    } catch (error) {
      message.textContent =
        error.message ||
        "Something went wrong. Please try again.";
    }
  }

  beginPayment();
}
