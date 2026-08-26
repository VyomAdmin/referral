import { HeaderBrand } from "../../components/brand";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  return (
    <main className="public-page">
      <header className="public-header">
        <div className="page-width header-inner">
          <HeaderBrand />
        </div>
      </header>
      <section className="admin-login-shell page-width">
        <div className="hero-card admin-login-card">
          <HeaderBrand compact />
          <h1>Referral operations</h1>
          <p>Sign in with your NuVision team credentials.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
