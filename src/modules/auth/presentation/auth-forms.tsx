"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  INITIAL_AUTH_ACTION_STATE,
  type AuthActionState,
  type AuthFieldName,
} from "./action-state";
import {
  requestPasswordResetAction,
  signInAction,
  signOutAction,
  signUpAction,
  updatePasswordAction,
  updateProfileAction,
} from "./actions";

function FieldError({
  state,
  name,
}: {
  state: AuthActionState;
  name: AuthFieldName;
}) {
  const message = state.fieldErrors?.[name]?.[0];
  if (!message) return null;
  return (
    <p className="field-error" id={`${name}-error`}>
      {message}
    </p>
  );
}

function FormMessage({ state }: { state: AuthActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`form-message ${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button" disabled={pending} type="submit">
      {pending ? "処理中…" : children}
    </button>
  );
}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action] = useActionState(
    signInAction,
    INITIAL_AUTH_ACTION_STATE,
  );
  return (
    <form action={action} className="auth-form" noValidate>
      <input name="next" type="hidden" value={nextPath} />
      <label htmlFor="email">メールアドレス</label>
      <input
        aria-describedby="email-error"
        autoComplete="email"
        id="email"
        name="email"
        type="email"
      />
      <FieldError name="email" state={state} />
      <label htmlFor="password">パスワード</label>
      <input
        aria-describedby="password-error"
        autoComplete="current-password"
        id="password"
        name="password"
        type="password"
      />
      <FieldError name="password" state={state} />
      <FormMessage state={state} />
      <SubmitButton>ログイン</SubmitButton>
      <div className="auth-links">
        <Link href="/forgot-password">パスワードを再設定</Link>
        <Link href="/signup">新規登録</Link>
      </div>
    </form>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(
    signUpAction,
    INITIAL_AUTH_ACTION_STATE,
  );
  return (
    <form action={action} className="auth-form" noValidate>
      <label htmlFor="displayName">表示名</label>
      <input
        aria-describedby="displayName-error"
        autoComplete="name"
        id="displayName"
        name="displayName"
      />
      <FieldError name="displayName" state={state} />
      <label htmlFor="email">メールアドレス</label>
      <input
        aria-describedby="email-error"
        autoComplete="email"
        id="email"
        name="email"
        type="email"
      />
      <FieldError name="email" state={state} />
      <label htmlFor="password">パスワード</label>
      <input
        aria-describedby="password-hint password-error"
        autoComplete="new-password"
        id="password"
        name="password"
        type="password"
      />
      <p className="field-hint" id="password-hint">
        10〜72文字で入力してください。
      </p>
      <FieldError name="password" state={state} />
      <label htmlFor="passwordConfirmation">パスワード（確認）</label>
      <input
        aria-describedby="passwordConfirmation-error"
        autoComplete="new-password"
        id="passwordConfirmation"
        name="passwordConfirmation"
        type="password"
      />
      <FieldError name="passwordConfirmation" state={state} />
      <FormMessage state={state} />
      <SubmitButton>アカウントを作成</SubmitButton>
      <div className="auth-links">
        <Link href="/login">ログインへ戻る</Link>
      </div>
    </form>
  );
}

export function PasswordResetRequestForm() {
  const [state, action] = useActionState(
    requestPasswordResetAction,
    INITIAL_AUTH_ACTION_STATE,
  );
  return (
    <form action={action} className="auth-form" noValidate>
      <label htmlFor="email">メールアドレス</label>
      <input
        aria-describedby="email-error"
        autoComplete="email"
        id="email"
        name="email"
        type="email"
      />
      <FieldError name="email" state={state} />
      <FormMessage state={state} />
      <SubmitButton>再設定メールを送る</SubmitButton>
      <div className="auth-links">
        <Link href="/login">ログインへ戻る</Link>
      </div>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState(
    updatePasswordAction,
    INITIAL_AUTH_ACTION_STATE,
  );
  return (
    <form action={action} className="auth-form" noValidate>
      <label htmlFor="password">新しいパスワード</label>
      <input
        aria-describedby="password-hint password-error"
        autoComplete="new-password"
        id="password"
        name="password"
        type="password"
      />
      <p className="field-hint" id="password-hint">
        10〜72文字で入力してください。
      </p>
      <FieldError name="password" state={state} />
      <label htmlFor="passwordConfirmation">新しいパスワード（確認）</label>
      <input
        aria-describedby="passwordConfirmation-error"
        autoComplete="new-password"
        id="passwordConfirmation"
        name="passwordConfirmation"
        type="password"
      />
      <FieldError name="passwordConfirmation" state={state} />
      <FormMessage state={state} />
      <SubmitButton>パスワードを変更</SubmitButton>
    </form>
  );
}

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action] = useActionState(
    updateProfileAction,
    INITIAL_AUTH_ACTION_STATE,
  );

  return (
    <form action={action} className="profile-form" noValidate>
      <label htmlFor="profileDisplayName">表示名</label>
      <input
        aria-describedby="displayName-error"
        autoComplete="name"
        defaultValue={displayName}
        id="profileDisplayName"
        name="displayName"
      />
      <FieldError name="displayName" state={state} />
      <FormMessage state={state} />
      <SubmitButton>表示名を更新</SubmitButton>
    </form>
  );
}

function LogoutButton() {
  const { pending } = useFormStatus();

  return (
    <button className="text-button" disabled={pending} type="submit">
      {pending ? "ログアウト中…" : "ログアウト"}
    </button>
  );
}

export function LogoutForm() {
  const [state, action] = useActionState(
    signOutAction,
    INITIAL_AUTH_ACTION_STATE,
  );

  return (
    <form action={action} className="logout-form">
      <LogoutButton />
      <FormMessage state={state} />
    </form>
  );
}
