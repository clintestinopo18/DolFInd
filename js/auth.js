const registerForm = document.getElementById("register-form");
const loginForm = document.getElementById("login-form");
const authMessage = document.getElementById("auth-message");
const resendButton = document.getElementById("resend-button");

function isPcuEmail(email) {
    return /^[^\s@]+@pcu\.edu\.ph$/i.test(email);
}

function showMessage(text, type) {
    authMessage.textContent = text;
    authMessage.className = `message ${type}`;
}

if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const fullName = document.getElementById("full-name").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const confirmPassword =
            document.getElementById("confirm-password").value;
        const button = document.getElementById("register-button");

        if (!isPcuEmail(email)) {
            showMessage("Please use your PCU email address ending in @pcu.edu.ph.", "error");
            return;
        }

        if (fullName.length < 2) {
            showMessage("Please enter your full name (at least two characters).", "error");
            return;
        }

        if (password !== confirmPassword) {
            showMessage("The passwords do not match.", "error");
            return;
        }

        button.disabled = true;
        button.textContent = "Creating account...";
        showMessage("", "");

        try {
            const { data, error } =
                await window.supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        emailRedirectTo:
                            `${window.location.origin}/index.html`,
                        data: {
                            full_name: fullName
                        }
                    }
                });

            if (error) {
                throw error;
            }

            if (data.session) {
                window.location.href = "index.html";
                return;
            }

            showMessage(
                "Check your inbox for a confirmation email. If you already have a confirmed account, log in instead.",
                "success"
            );
        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            button.disabled = false;
            button.textContent = "Create account";
        }
    });
}

if (resendButton) {
    resendButton.addEventListener("click", async function () {
        const email = document.getElementById("email").value.trim();

        if (!isPcuEmail(email) || !document.getElementById("email").checkValidity()) {
            showMessage(
                "Enter your @pcu.edu.ph email address before requesting another link.",
                "error"
            );
            return;
        }

        resendButton.disabled = true;
        resendButton.textContent = "Sending...";
        showMessage("", "");

        try {
            const { error } =
                await window.supabaseClient.auth.resend({
                    type: "signup",
                    email: email,
                    options: {
                        emailRedirectTo:
                            `${window.location.origin}/index.html`
                    }
                });

            if (error) {
                throw error;
            }

            showMessage(
                "If this account is awaiting confirmation, check your inbox for a new link. Use only the newest email.",
                "success"
            );
        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            resendButton.disabled = false;
            resendButton.textContent = "Resend confirmation email";
        }
    });
}

if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const button = document.getElementById("login-button");

        button.disabled = true;
        button.textContent = "Logging in...";
        showMessage("", "");

        try {
            const { error } =
                await window.supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });

            if (error) {
                throw error;
            }

            const next = new URLSearchParams(window.location.search).get('next');
            // Only allow a local report page as a return destination.
            window.location.href = next === 'my-reports.html' || /^item\.html\?id=[1-9]\d{0,18}$/.test(next || '') ? next : 'index.html';
        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            button.disabled = false;
            button.textContent = "Log in";
        }
    });
}
