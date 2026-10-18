
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Get these from your Supabase project API settings.
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_PUBLISHABLE_KEY =
  "YOUR_SUPABASE_PUBLISHABLE_KEY";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (id) => document.getElementById(id);

const loginSection = $("login-section");
const signupSection = $("signup-section");
const dashboard = $("dashboard");
const message = $("message");

function showMessage(text) {
  message.textContent = text;
}

function showScreen(screen) {
  loginSection.hidden = screen !== "login";
  signupSection.hidden = screen !== "signup";
  dashboard.hidden = screen !== "dashboard";
}

$("show-signup").addEventListener("click", (event) => {
  event.preventDefault();
  showScreen("signup");
  showMessage("");
});

$("show-login").addEventListener("click", (event) => {
  event.preventDefault();
  showScreen("login");
  showMessage("");
});

// Load the profile belonging to the authenticated user.
async function loadProfile(user) {
  const { data: player, error } = await supabase
    .from("players")
    .select("player_name, position, skill_score")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    showScreen("login");
    showMessage("Couldn't load your profile: " + error.message);
    return;
  }

  if (!player) {
    showScreen("login");
    showMessage(
      "Your player profile wasn't found. Please contact support."
    );
    return;
  }

  $("player-name").textContent = player.player_name || "Player";
  $("player-email").textContent = user.email || "";
  $("player-position").textContent = player.position || "Not set";
  $("player-score").textContent =
    player.skill_score ?? "Not assessed yet";

  showScreen("dashboard");
  showMessage("");
}

// CREATE ACCOUNT
$("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const playerName = $("signup-name").value.trim();
  const position = $("signup-position").value;
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;

  if (!playerName || !position) {
    showMessage("Enter your name and choose your position.");
    return;
  }

  showMessage("Creating your account...");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        player_name: playerName,
        position: position
      }
    }
  });

  if (error) {
    showMessage("Signup failed: " + error.message);
    return;
  }

  if (data.session && data.user) {
    await loadProfile(data.user);
  } else {
    showScreen("login");
    showMessage(
      "Account created! Check your email to confirm your account, " +
      "then log in."
    );
  }
});

// LOG IN
$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;

  showMessage("Logging in...");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showMessage("Login failed: " + error.message);
    return;
  }

  await loadProfile(data.user);
});

// FORGOT PASSWORD
$("forgot-password").addEventListener("click", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();

  if (!email) {
    showMessage("Enter your email in the email field first.");
    return;
  }

  showMessage("Requesting password reset...");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-password.html"
  });

  if (error) {
    showMessage("Couldn't request reset: " + error.message);
    return;
  }

  showMessage(
    "If the account is eligible, check your email for a password reset link."
  );
});

// LOG OUT
$("logout-button").addEventListener("click", async () => {
  showMessage("Logging out...");

  const { error } = await supabase.auth.signOut();

  if (error) {
    showMessage("Logout failed: " + error.message);
    return;
  }

  showScreen("login");
  showMessage("You have logged out.");
});

// RESTORE SESSION AFTER REFRESH
async function initializeAuth() {
  showScreen("login");

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    showMessage("Couldn't check your session.");
    return;
  }

  if (data.session?.user) {
    await loadProfile(data.session.user);
  }
}

initializeAuth();
