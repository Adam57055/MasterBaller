
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
      (
        today.getMonth() === birthDate.getMonth() &&
        today.getDate() < birthDate.getDate()
      );
  
    if (birthdayHasNotOccurred) {
      age--;
    }
  
    return age;
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
    const dateOfBirthInput =
      signupForm.querySelector("#date-of-birth");
  
    // Prevent selecting a future date.
    dateOfBirthInput.max = new Date().toLocaleDateString("en-CA");
  
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
  
      if (!signupForm.reportValidity()) return;
  
      const fullName =
        signupForm.querySelector("#full-name").value.trim();
  
      const email =
        signupForm.querySelector("#email").value.trim();
  
      const password =
        signupForm.querySelector("#password").value;
  
      const dateOfBirth = dateOfBirthInput.value;
      const age = calculateAge(dateOfBirth);
  
      // Reject invalid or future birth dates.
      if (age < 0) {
        message.textContent = "Please enter a valid date of birth.";
        return;
      }
  
      // Minimum age requirement.
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
              `${window.location.origin}/dashboard.html`
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
  