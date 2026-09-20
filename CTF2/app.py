from flask import Flask, render_template, request, redirect, url_for, session, flash
import secrets

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

ADMIN_USER = "admin"
ADMIN_PASS = "CYRAKSHA2026"
FLAG = "CYRAKSHA{h1dd3n_1n_pl41n_51gh7_2026}"

@app.route("/", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        
        if username == ADMIN_USER and password == ADMIN_PASS:
            session["authenticated"] = True
            session["user"] = username
            return redirect(url_for("dashboard"))
        else:
            flash("Invalid username or password. Please try again.", "error")
            return redirect(url_for("login"))
            
    return render_template("login.html")

@app.route("/dashboard")
def dashboard():
    if not session.get("authenticated"):
        return redirect(url_for("login"))
    return render_template("dashboard.html", user=session.get("user"), flag=FLAG)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
