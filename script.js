
const SUPABASE_URL = "https://thbrjtqbusxmlufbjyby.supabase.co";
const SUPABASE_KEY = "sb_publishable_xMZ7Mg7jnB-_jGxivC1hmw_nvlADovW";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

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
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.session) {
        window.location.href = "dashboard.html";
      }

    } catch (error) {
      message.textContent = error.message;
    } finally {
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

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!signupForm.reportValidity()) return;

    const fullName = signupForm.querySelector("#full-name").value.trim();
    const email = signupForm.querySelector("#email").value.trim();
    const password = signupForm.querySelector("#password").value;

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
          emailRedirectTo: `${window.location.origin}/dashboard.html`
        }
      });

      if (error) throw error;

      if (data.session) {
        window.location.href = "dashboard.html";
      } else {
        message.textContent =
          "Account created! Check your email to verify your account before logging in.";
      }

    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
