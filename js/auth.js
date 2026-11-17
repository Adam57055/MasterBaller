
// SIGNUP
async function signUp(email, password) {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });
  
    if (error) {
      alert(error.message);
      return;
    }
  
    alert("Account created! Check your email to verify your account.");
  }
  
  // LOGIN
  async function logIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
  
    if (error) {
      alert(error.message);
      return;
    }
  
    window.location.href = "dashboard.html";
  }
  
  // LOGOUT
  async function logOut() {
    const { error } = await supabaseClient.auth.signOut();
  
    if (error) {
      alert(error.message);
      return;
    }
  
    window.location.href = "login.html";
  }
  