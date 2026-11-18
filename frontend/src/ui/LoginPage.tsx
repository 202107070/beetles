import { useRef, useState, type FormEvent } from 'react';

interface LoginPageProps {
  error: string | null;
  onLogin(username: string, password: string): Promise<void>;
}

export function LoginPage({ error, onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('demo');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onLogin(username, password);
    } catch {
      // App supplies the API or network error text below the form.
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page-card login-card" aria-labelledby="login-title">
      <p className="eyebrow">눈 감김 집중 모니터</p>
      <h1 id="login-title" className="brand-title">비틀비틀</h1>
      <p className="lead">눈을 감은 순간을 감지해 다시 집중하도록 알려드립니다.</p>

      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="username">아이디</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          required
          disabled={isSubmitting}
          onChange={(event) => setUsername(event.target.value)}
        />

        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          required
          disabled={isSubmitting}
          onChange={(event) => setPassword(event.target.value)}
        />

        <p className="demo-credentials">아이디 demo / 비밀번호 beetle</p>
        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '로그인 중…' : '데모 로그인'}
        </button>
      </form>
    </section>
  );
}
