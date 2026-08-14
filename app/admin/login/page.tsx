import { Brand } from "../../components/brand";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <Brand compact />
        <h1>Referral operations</h1>
        <p>Sign in with your NuVision team credentials.</p>
        <LoginForm />
      </section>
    </main>
  );
}
