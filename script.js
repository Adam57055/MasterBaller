
const SUPABASE_URL = "https://thbrjtqbusxmlufbjyby.supabase.co";
const SUPABASE_KEY = "YOUR_EXISTING_SUPABASE_PUBLISHABLE_KEY";

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
    }
  });

  const result = await response.json();

  if (!response.ok || !result.url) {
    throw new Error(result.error || "Unable to start checkout.");
  }

  window.location.href = result.url;
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

      if (data.session) {
        window.location.href = "dashboard.html";
      }
    } catch (error) {
      message.textContent = error.message;
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

  dateOfBirthInput.max = new Date().toISOString().split("T")[0];

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!signupForm.reportValidity()) return;

    const fullName =
      signupForm.querySelector("#full-name").value.trim();

    const email =
      signupForm.querySelector("#email").value.trim();

    const password =
      signupForm.querySelector("#password").value;

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
          emailRedirectTo: `${window.location.origin}/payment.html`
        }
      });

      if (error) throw error;

      if (data.session) {
        message.textContent = "Account created! Taking you to payment...";
        await redirectToCheckout(data.session);
      } else {
        message.textContent =
          "Account created! Please verify your email. After verification, you'll be taken to checkout.";
        button.disabled = false;
      }
    } catch (error) {
      message.textContent = error.message;
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

      const { data, error } = await supabaseClient.auth.getSession();

      if (error) throw error;

      if (!data.session) {
        message.textContent =
          "Please log in to continue to your subscription.";
        return;
      }

      message.textContent = "Taking you to secure checkout...";

      await redirectToCheckout(data.session);
    } catch (error) {
      message.textContent = error.message;
    }
  }

  beginPayment();
}
